import {
  type AlertAudioChunk,
  ListAlertAudioResponseSchema,
  PinAlertAudioResponseSchema,
} from "@protecther/contracts";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl } from "../config/apiBaseUrl";
import { formatApiError } from "../lib/apiError";
import { Radius, Shadow } from "../theme";
import {
  SOS_AUDIO_CHUNK_MS,
  formatChunkLabel,
  formatClock,
  nextLiveChunkId,
  pageCount,
  pageSlice,
  pageWindow,
} from "./sosAudio";

/** Intervalo de busca de novos trechos (mais curto ouvindo ao vivo). */
const POLL_MS = 10_000;
const POLL_LIVE_MS = 4_000;
/** Aba da lista: uma página de trechos (0 = mais recentes) ou os fixados. */
type ListTab = { kind: "page"; page: number } | { kind: "pinned" };

function mergeChunks(
  current: AlertAudioChunk[],
  incoming: AlertAudioChunk[],
): AlertAudioChunk[] {
  if (incoming.length === 0) {
    return current;
  }
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) {
    byId.set(c.id, c);
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
}

/**
 * Áudio do alerta para o contato de segurança: lista os trechos que a vítima
 * enviou e toca em sequência no modo "Ouvir ao vivo". Os arquivos são baixados
 * para o cache só enquanto a tela está aberta e apagados ao sair.
 */
export function ContactAlertAudioPanel({ alertId }: { alertId: string }) {
  const { getAccessToken } = useAuth();
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const [chunks, setChunks] = useState<AlertAudioChunk[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>({ kind: "page", page: 0 });
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);

  const lastCreatedAtRef = useRef<string | null>(null);
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const cacheDir = useRef(
    new Directory(Paths.cache, "sos-audio-play", alertId),
  ).current;

  const fetchChunks = useCallback(async () => {
    const since = lastCreatedAtRef.current;
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const res = await apiFetchJson<unknown>(
      `/alerts/${encodeURIComponent(alertId)}/audio${query}`,
      { method: "GET", accessToken: getAccessTokenRef.current() },
    );
    setLoaded(true);
    if (!res.ok) {
      setError(formatApiError(res.body));
      return;
    }
    const parsed = ListAlertAudioResponseSchema.safeParse(res.data);
    if (!parsed.success) {
      setError("Resposta inválida da API");
      return;
    }
    setError(null);
    const incoming = parsed.data.chunks;
    for (const c of incoming) {
      if (!lastCreatedAtRef.current || c.createdAt > lastCreatedAtRef.current) {
        lastCreatedAtRef.current = c.createdAt;
      }
    }
    setChunks((current) => mergeChunks(current, incoming));
  }, [alertId]);

  useEffect(() => {
    void fetchChunks();
    const timer = setInterval(
      () => void fetchChunks(),
      live ? POLL_LIVE_MS : POLL_MS,
    );
    return () => clearInterval(timer);
  }, [fetchChunks, live]);

  // Não deixa áudio da vítima guardado no celular do contato.
  useEffect(() => {
    return () => {
      try {
        if (cacheDir.exists) {
          cacheDir.delete();
        }
      } catch {
        // Cache já limpo.
      }
    };
  }, [cacheDir]);

  /** Baixa o trecho (uma vez só, mesmo com chamadas simultâneas). */
  const downloadsRef = useRef(new Map<string, Promise<File>>());
  const ensureDownloaded = useCallback(
    (chunkId: string): Promise<File> => {
      const existing = downloadsRef.current.get(chunkId);
      if (existing) {
        return existing;
      }
      const job = (async () => {
        if (!cacheDir.exists) {
          cacheDir.create({ intermediates: true, idempotent: true });
        }
        const target = new File(cacheDir, `${chunkId}.m4a`);
        if (!target.exists) {
          const token = getAccessTokenRef.current();
          await File.downloadFileAsync(
            `${getApiBaseUrl()}/alerts/${encodeURIComponent(alertId)}/audio/${encodeURIComponent(chunkId)}`,
            target,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              idempotent: true,
            },
          );
        }
        return target;
      })();
      downloadsRef.current.set(chunkId, job);
      // Falhou: libera para tentar de novo depois.
      job.catch(() => downloadsRef.current.delete(chunkId));
      return job;
    },
    [alertId, cacheDir],
  );

  const playChunk = useCallback(
    async (chunkId: string, fromLive = false) => {
      setLoadingId(chunkId);
      setError(null);
      try {
        const target = await ensureDownloaded(chunkId);
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: "doNotMix",
        });
        player.replace({ uri: target.uri });
        player.play();
        setPlayingId(chunkId);
        setLastPlayedId(chunkId);
      } catch {
        if (fromLive) {
          // Ao vivo não trava num trecho com problema: pula para o seguinte.
          setLastPlayedId(chunkId);
        } else {
          setError("Não foi possível tocar este trecho. Tente de novo.");
        }
      } finally {
        setLoadingId(null);
      }
    },
    [ensureDownloaded, player],
  );

  // Fim do trecho: ouve o evento direto do player (o estado do hook pode
  // juntar atualizações e perder o `didJustFinish`, travando o ao vivo).
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) {
        setPlayingId(null);
      }
    });
    return () => sub.remove();
  }, [player]);

  // Rede de segurança: parou no fim sem o evento chegar.
  useEffect(() => {
    if (
      playingId !== null &&
      loadingId === null &&
      status.isLoaded &&
      !status.playing &&
      status.duration > 0 &&
      status.currentTime >= status.duration - 0.3
    ) {
      setPlayingId(null);
    }
  }, [
    loadingId,
    playingId,
    status.currentTime,
    status.duration,
    status.isLoaded,
    status.playing,
  ]);

  // Ao vivo: toca o próximo assim que o atual termina (se já chegou)…
  useEffect(() => {
    if (!live || playingId !== null || loadingId !== null) {
      return;
    }
    const next = nextLiveChunkId(chunks, lastPlayedId);
    if (next) {
      void playChunk(next, true);
    }
  }, [chunks, lastPlayedId, live, loadingId, playChunk, playingId]);

  // …e já baixa o seguinte enquanto o atual toca, para não haver pausa.
  useEffect(() => {
    if (!live || !lastPlayedId) {
      return;
    }
    const upcoming = nextLiveChunkId(chunks, lastPlayedId);
    if (upcoming) {
      void ensureDownloaded(upcoming).catch(() => undefined);
    }
  }, [chunks, ensureDownloaded, lastPlayedId, live]);

  /** Fixa/desafixa na hora (otimista) e desfaz se a API recusar. */
  const togglePin = async (chunk: AlertAudioChunk) => {
    const pinned = !chunk.pinned;
    const apply = (value: boolean) =>
      setChunks((current) =>
        current.map((c) => (c.id === chunk.id ? { ...c, pinned: value } : c)),
      );
    apply(pinned);
    setPinBusyId(chunk.id);
    const res = await apiFetchJson<unknown>(
      `/alerts/${encodeURIComponent(alertId)}/audio/${encodeURIComponent(chunk.id)}/pin`,
      {
        method: pinned ? "PUT" : "DELETE",
        accessToken: getAccessTokenRef.current(),
      },
    );
    setPinBusyId(null);
    if (!res.ok || !PinAlertAudioResponseSchema.safeParse(res.data).success) {
      apply(!pinned);
      setError(
        pinned
          ? "Não foi possível fixar este trecho. Tente de novo."
          : "Não foi possível desafixar este trecho. Tente de novo.",
      );
    }
  };

  const toggleLive = () => {
    if (live) {
      setLive(false);
      player.pause();
      setPlayingId(null);
      return;
    }
    setLive(true);
    // Começa pelo trecho mais recente: é o que está acontecendo agora.
    setLastPlayedId(null);
  };

  const stopPlayback = () => {
    player.pause();
    setPlayingId(null);
    setLive(false);
  };

  // Mais recentes primeiro, como uma conversa.
  const newestFirst = [...chunks].reverse();
  const pinnedChunks = newestFirst.filter((c) => c.pinned);
  const totalPages = pageCount(newestFirst.length);
  const currentPage =
    tab.kind === "page" ? Math.min(tab.page, totalPages - 1) : -1;
  const visible =
    tab.kind === "pinned" ? pinnedChunks : pageSlice(newestFirst, currentPage);
  const latest = chunks[chunks.length - 1];
  const playingChunk = chunks.find((c) => c.id === playingId);
  const chunkSeconds = Math.round(SOS_AUDIO_CHUNK_MS / 1000);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Áudio do alerta</Text>
      {!loaded ? (
        <ActivityIndicator color="#C71657" />
      ) : chunks.length === 0 ? (
        <Text style={styles.detail}>
          Nenhum áudio recebido ainda. Se o microfone estiver liberado no
          celular dela, os trechos aparecem aqui a cada {chunkSeconds} segundos.
        </Text>
      ) : (
        <>
          <Text style={styles.detail}>
            {chunks.length}{" "}
            {chunks.length === 1 ? "trecho recebido" : "trechos recebidos"}.
            {latest ? ` Último às ${formatClock(latest.capturedAt)}.` : ""}
          </Text>
          <Pressable
            onPress={toggleLive}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.liveButton,
              live && styles.liveButtonOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.liveButtonText}>
              {live ? "Parar de ouvir" : "Ouvir ao vivo"}
            </Text>
          </Pressable>
          {live ? (
            <Text style={styles.meta}>
              {playingChunk
                ? `Tocando o trecho de ${formatClock(playingChunk.capturedAt)}…`
                : "Aguardando o próximo trecho…"}
            </Text>
          ) : null}
          <View style={styles.tabs} accessibilityRole="tablist">
            <Pressable
              onPress={() => setTab({ kind: "pinned" })}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab.kind === "pinned" }}
              accessibilityLabel={`Trechos fixados (${pinnedChunks.length})`}
              style={({ pressed }) => [
                styles.tab,
                tab.kind === "pinned" && styles.tabOn,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.tabStar,
                  tab.kind === "pinned" && styles.tabTextOn,
                ]}
              >
                ★
              </Text>
            </Pressable>
            {pageWindow(currentPage < 0 ? 0 : currentPage, totalPages).map(
              (item, index) =>
                item === "…" ? (
                  <Text
                    // biome-ignore lint/suspicious/noArrayIndexKey: reticências não têm id
                    key={`gap-${index}`}
                    style={styles.tabGap}
                  >
                    …
                  </Text>
                ) : (
                  <Pressable
                    key={item}
                    onPress={() => setTab({ kind: "page", page: item })}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: currentPage === item }}
                    accessibilityLabel={`Página ${item + 1} de ${totalPages}`}
                    style={({ pressed }) => [
                      styles.tab,
                      currentPage === item && styles.tabOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        currentPage === item && styles.tabTextOn,
                      ]}
                    >
                      {item + 1}
                    </Text>
                  </Pressable>
                ),
            )}
          </View>
          {tab.kind === "pinned" && pinnedChunks.length === 0 ? (
            <Text style={styles.detail}>
              Nenhum trecho fixado. Toque na estrela ao lado de um trecho para
              guardá-lo aqui.
            </Text>
          ) : null}
          <View style={styles.list}>
            {visible.map((chunk) => {
              const isPlaying = playingId === chunk.id && status.playing;
              const isLoading = loadingId === chunk.id;
              const label = formatChunkLabel(
                chunk.capturedAt,
                chunk.durationMs,
              );
              return (
                <View
                  key={chunk.id}
                  style={[styles.row, isPlaying && styles.rowPlaying]}
                >
                  <Pressable
                    onPress={() =>
                      isPlaying ? stopPlayback() : void playChunk(chunk.id)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${isPlaying ? "Parar" : "Tocar"} trecho de ${label}`}
                    style={({ pressed }) => [
                      styles.rowMain,
                      pressed && styles.pressed,
                    ]}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#C71657" />
                    ) : (
                      <Text style={styles.rowIcon}>
                        {isPlaying ? "■" : "▶"}
                      </Text>
                    )}
                    <Text style={styles.rowText}>{label}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void togglePin(chunk)}
                    disabled={pinBusyId === chunk.id}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chunk.pinned }}
                    accessibilityLabel={`${chunk.pinned ? "Desafixar" : "Fixar"} trecho de ${label}`}
                    style={({ pressed }) => [
                      styles.pinButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.pinIcon, chunk.pinned && styles.pinIconOn]}
                    >
                      {chunk.pinned ? "★" : "☆"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,208,225,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
  },
  detail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: "#55383E",
  },
  meta: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#6A5157",
    textAlign: "center",
  },
  liveButton: {
    minHeight: 46,
    borderRadius: Radius.md,
    backgroundColor: "#C72A67",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    ...Shadow.sm,
  },
  liveButtonOn: {
    backgroundColor: "#7D1F44",
  },
  liveButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  list: {
    gap: 6,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  tab: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabOn: {
    backgroundColor: "#C72A67",
    borderColor: "#C72A67",
  },
  tabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#55383E",
  },
  tabStar: {
    fontSize: 17,
    color: "#C71657",
  },
  tabTextOn: {
    color: "#FFFFFF",
  },
  tabGap: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#6A5157",
    paddingHorizontal: 2,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  rowMain: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
  },
  pinButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pinIcon: {
    fontSize: 20,
    color: "#9B7B82",
  },
  pinIconOn: {
    color: "#C71657",
  },
  rowPlaying: {
    borderColor: "#C71657",
  },
  rowIcon: {
    fontSize: 14,
    color: "#C71657",
    width: 18,
    textAlign: "center",
  },
  rowText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#55383E",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#B12E58",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});

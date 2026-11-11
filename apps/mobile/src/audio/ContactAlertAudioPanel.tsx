import {
  type AlertAudioChunk,
  ListAlertAudioResponseSchema,
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
} from "./sosAudio";

/** Intervalo de busca de novos trechos (mais curto ouvindo ao vivo). */
const POLL_MS = 10_000;
const POLL_LIVE_MS = 4_000;
/** Quantos trechos mostrar na lista (os mais recentes). */
const LIST_VISIBLE = 12;

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

  const playChunk = useCallback(
    async (chunkId: string) => {
      setLoadingId(chunkId);
      setError(null);
      try {
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
        setError("Não foi possível tocar este trecho. Tente de novo.");
      } finally {
        setLoadingId(null);
      }
    },
    [alertId, cacheDir, player],
  );

  // Ao terminar um trecho no modo ao vivo, toca o próximo (se já chegou).
  useEffect(() => {
    if (!status.didJustFinish) {
      return;
    }
    setPlayingId(null);
  }, [status.didJustFinish]);

  useEffect(() => {
    if (!live || playingId !== null || loadingId !== null) {
      return;
    }
    const next = nextLiveChunkId(chunks, lastPlayedId);
    if (next) {
      void playChunk(next);
    }
  }, [chunks, lastPlayedId, live, loadingId, playChunk, playingId]);

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

  const visible = chunks.slice(-LIST_VISIBLE).reverse();
  const latest = chunks[chunks.length - 1];
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
              {playingId
                ? "Tocando o trecho mais recente…"
                : "Aguardando o próximo trecho…"}
            </Text>
          ) : null}
          <View style={styles.list}>
            {visible.map((chunk) => {
              const isPlaying = playingId === chunk.id && status.playing;
              const isLoading = loadingId === chunk.id;
              return (
                <Pressable
                  key={chunk.id}
                  onPress={() =>
                    isPlaying ? stopPlayback() : void playChunk(chunk.id)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${isPlaying ? "Parar" : "Tocar"} trecho de ${formatChunkLabel(chunk.capturedAt, chunk.durationMs)}`}
                  style={({ pressed }) => [
                    styles.row,
                    isPlaying && styles.rowPlaying,
                    pressed && styles.pressed,
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#C71657" />
                  ) : (
                    <Text style={styles.rowIcon}>{isPlaying ? "■" : "▶"}</Text>
                  )}
                  <Text style={styles.rowText}>
                    {formatChunkLabel(chunk.capturedAt, chunk.durationMs)}
                  </Text>
                </Pressable>
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
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingHorizontal: 12,
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

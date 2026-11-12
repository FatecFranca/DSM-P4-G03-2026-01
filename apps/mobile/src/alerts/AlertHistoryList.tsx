import {
  type AlertHistoryItem,
  AlertHistoryResponseSchema,
  type AlertHistoryScope,
} from "@protecther/contracts";
import { LinearGradient } from "expo-linear-gradient";
import {
  type ReactElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { Radius, Spacing } from "../theme";
import {
  audioSummaryLabel,
  groupByDay,
  timeRangeLabel,
} from "./alertHistoryFormat";

const PAGE_SIZE = 20;

const FILTERS: { scope: AlertHistoryScope; label: string }[] = [
  { scope: "all", label: "Todos" },
  { scope: "mine", label: "Meus" },
  { scope: "protected", label: "Quem eu protejo" },
];

const EMPTY_COPY: Record<AlertHistoryScope, { title: string; desc: string }> = {
  all: {
    title: "Nenhum alerta ainda",
    desc: "Os alertas que você acionar e os de quem você protege aparecem aqui, com o áudio e o trajeto.",
  },
  mine: {
    title: "Você ainda não acionou alertas",
    desc: "Quando acionar o SOS, o registro fica guardado aqui para você rever.",
  },
  protected: {
    title: "Nenhum alerta de quem você protege",
    desc: "Se alguém que tem você como contato acionar o SOS, o registro aparece aqui.",
  },
};

type Props = {
  /** Cabeçalho da tela (marca, título, abas) — rola junto com a lista. */
  header: ReactElement;
  onOpen: (item: AlertHistoryItem) => void;
  /** Padding/largura do conteúdo (mesmo layout das outras telas). */
  contentStyle?: StyleProp<ViewStyle>;
};

function LiveDot() {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[styles.liveDot, { opacity: anim }]} />;
}

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.9,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View style={[styles.card, styles.skeleton, { opacity: anim }]}>
      <View style={styles.skeletonIcon} />
      <View style={styles.cardBody}>
        <View style={[styles.skeletonLine, { width: "55%" }]} />
        <View style={[styles.skeletonLine, { width: "80%" }]} />
        <View style={[styles.skeletonLine, { width: "40%" }]} />
      </View>
    </Animated.View>
  );
}

const HistoryCard = memo(function HistoryCard({
  item,
  onOpen,
}: {
  item: AlertHistoryItem;
  onOpen: (item: AlertHistoryItem) => void;
}) {
  const active = item.alert.status === "active";
  const title = item.isOwner ? "Seu alerta" : item.owner.name;
  const initial = item.isOwner
    ? "Eu"
    : (item.owner.name.trim()[0] ?? "?").toUpperCase();
  const range = timeRangeLabel(item.alert.startedAt, item.alert.endedAt);
  const audio = audioSummaryLabel(item.audio.chunks, item.audio.totalMs);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${active ? "ao vivo" : "encerrado"}, ${range}, ${audio}${item.audio.pinned ? `, ${item.audio.pinned} fixados` : ""}`}
      style={({ pressed }) => [
        styles.card,
        active && styles.cardActive,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={active ? ["#FF6B8B", "#C71657"] : ["#F3C6D3", "#DA8295"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatar}
      >
        <Text style={styles.avatarText}>{initial}</Text>
      </LinearGradient>

      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {active ? (
            <View style={[styles.pill, styles.pillLive]}>
              <LiveDot />
              <Text style={[styles.pillText, styles.pillTextLive]}>
                Ao vivo
              </Text>
            </View>
          ) : (
            <View style={styles.pill}>
              <Text style={styles.pillText}>Encerrado</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardMeta}>{range}</Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipIcon}>🎙</Text>
            <Text style={styles.chipText}>{audio}</Text>
          </View>
          {item.audio.pinned > 0 ? (
            <View style={[styles.chip, styles.chipStar]}>
              <Text style={styles.chipStarIcon}>★</Text>
              <Text style={styles.chipText}>{item.audio.pinned}</Text>
            </View>
          ) : null}
          {item.alert.riskLevel === "high" ? (
            <View style={[styles.chip, styles.chipRisk]}>
              <Text style={[styles.chipText, styles.chipRiskText]}>
                Risco alto
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
});

/**
 * Histórico de alertas (os meus e de quem eu protejo), agrupado por dia, com
 * filtro, "puxar para atualizar" e carregamento de mais páginas ao rolar.
 */
export function AlertHistoryList({ header, onOpen, contentStyle }: Props) {
  const { getAccessToken } = useAuth();
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const [scope, setScope] = useState<AlertHistoryScope>("all");
  const [items, setItems] = useState<AlertHistoryItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "refreshing" | "more"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  /** Ignora respostas de um filtro antigo que cheguem atrasadas. */
  const requestRef = useRef(0);

  const load = useCallback(
    async (mode: "reset" | "refresh" | "more", before: string | null) => {
      const requestId = ++requestRef.current;
      setStatus(
        mode === "more"
          ? "more"
          : mode === "refresh"
            ? "refreshing"
            : "loading",
      );
      setError(null);
      const params = new URLSearchParams({
        scope,
        limit: String(PAGE_SIZE),
      });
      if (before) {
        params.set("before", before);
      }
      const res = await apiFetchJson<unknown>(
        `/alerts/history?${params.toString()}`,
        { method: "GET", accessToken: getAccessTokenRef.current() },
      );
      if (requestId !== requestRef.current) {
        return;
      }
      setStatus("ready");
      if (!res.ok) {
        setError(formatApiError(res.body));
        return;
      }
      const parsed = AlertHistoryResponseSchema.safeParse(res.data);
      if (!parsed.success) {
        setError("Resposta inválida da API");
        return;
      }
      setItems((current) =>
        mode === "more"
          ? [
              ...current,
              ...parsed.data.items.filter(
                (i) => !current.some((c) => c.alert.id === i.alert.id),
              ),
            ]
          : parsed.data.items,
      );
      setNextBefore(parsed.data.nextBefore);
    },
    [scope],
  );

  useEffect(() => {
    setItems([]);
    setNextBefore(null);
    void load("reset", null);
  }, [load]);

  const sections = useMemo(
    () => groupByDay(items, (i) => i.alert.startedAt),
    [items],
  );

  const loadMore = () => {
    if (nextBefore && status === "ready" && !error) {
      void load("more", nextBefore);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: AlertHistoryItem }) => (
      <HistoryCard item={item} onOpen={onOpen} />
    ),
    [onOpen],
  );

  const listHeader = (
    <View style={styles.headerWrap}>
      {header}
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const selected = f.scope === scope;
          return (
            <Pressable
              key={f.scope}
              onPress={() => setScope(f.scope)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.filter,
                selected && styles.filterOn,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.filterText, selected && styles.filterTextOn]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const empty =
    status === "loading" ? (
      <View style={styles.skeletons}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    ) : error ? (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Não deu para carregar</Text>
        <Text style={styles.emptyDesc}>{error}</Text>
        <Pressable
          onPress={() => void load("reset", null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>🛡</Text>
        </View>
        <Text style={styles.emptyTitle}>{EMPTY_COPY[scope].title}</Text>
        <Text style={styles.emptyDesc}>{EMPTY_COPY[scope].desc}</Text>
      </View>
    );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.alert.id}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={empty}
      ListFooterComponent={
        status === "more" ? (
          <ActivityIndicator color="#C71657" style={styles.footer} />
        ) : error && items.length > 0 ? (
          <Pressable
            onPress={() => void load("more", nextBefore)}
            style={styles.footer}
          >
            <Text style={styles.retryText}>
              Erro ao carregar mais. Tocar para tentar de novo
            </Text>
          </Pressable>
        ) : items.length > 0 && !nextBefore ? (
          <Text style={styles.endText}>Isso é tudo por aqui</Text>
        ) : null
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={status === "refreshing"}
          onRefresh={() => void load("refresh", null)}
          tintColor="#C71657"
          colors={["#C71657"]}
        />
      }
      contentContainerStyle={[styles.content, contentStyle]}
      SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
      ItemSeparatorComponent={() => <View style={styles.itemGap} />}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.xxxl,
  },
  headerWrap: {
    gap: 14,
    marginBottom: 6,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filter: {
    minHeight: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  filterOn: {
    backgroundColor: "#55383E",
    borderColor: "#55383E",
  },
  filterText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#55383E",
  },
  filterTextOn: {
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.4,
    color: "#9B6B75",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
  },
  sectionGap: {
    height: 4,
  },
  itemGap: {
    height: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(232,184,192,0.8)",
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#C71657",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  cardActive: {
    borderColor: "rgba(199,22,87,0.45)",
    backgroundColor: "rgba(255,236,242,0.95)",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
  },
  cardMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#7A5A60",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: Radius.full,
    backgroundColor: "rgba(85,56,62,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillLive: {
    backgroundColor: "rgba(199,22,87,0.12)",
  },
  pillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "#7A5A60",
  },
  pillTextLive: {
    color: "#C71657",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#C71657",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,208,225,0.55)",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chipIcon: {
    fontSize: 11,
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#55383E",
  },
  chipStar: {
    backgroundColor: "rgba(199,22,87,0.12)",
  },
  chipStarIcon: {
    fontSize: 12,
    color: "#C71657",
  },
  chipRisk: {
    backgroundColor: "rgba(177,46,88,0.14)",
  },
  chipRiskText: {
    color: "#B12E58",
  },
  chevron: {
    fontSize: 26,
    lineHeight: 28,
    color: "#C9A3AC",
  },
  skeletons: {
    gap: 10,
    marginTop: 12,
  },
  skeleton: {
    shadowOpacity: 0,
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(232,184,192,0.6)",
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(232,184,192,0.6)",
    marginVertical: 3,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,208,225,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconText: {
    fontSize: 32,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#55383E",
    textAlign: "center",
  },
  emptyDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#7A5A60",
    textAlign: "center",
    maxWidth: 300,
  },
  retry: {
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#DA8295",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    justifyContent: "center",
    marginTop: 4,
  },
  retryText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#C71657",
    textAlign: "center",
  },
  footer: {
    paddingVertical: 18,
  },
  endText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#9B6B75",
    textAlign: "center",
    paddingVertical: 18,
  },
  pressed: {
    opacity: 0.85,
  },
});

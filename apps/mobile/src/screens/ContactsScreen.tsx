import {
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { GlassCard } from "../components/GlassCard";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Colors, Spacing, Typography } from "../theme";

type ContactItem = {
  id: string;
  name: string;
  email: string;
  since: string;
};

type Props = NativeStackScreenProps<AppStackParamList, "Contacts">;

const CONTACTS_POLL_MS = 10_000;

export function ContactsScreen(_props: Props) {
  const { getAccessToken } = useAuth();
  const [targetEmail, setTargetEmail] = useState("");
  const [asOwner, setAsOwner] = useState<ContactItem[]>([]);
  const [asContact, setAsContact] = useState<ContactItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setError(null);
        setMessage(null);
      }
      setRefreshing(true);
      try {
        const token = getAccessToken();
        const result = await apiFetchJson<unknown>("/emergency/contacts", {
          method: "GET",
          accessToken: token,
        });
        if (!result.ok) {
          if (!options?.silent) {
            setError(formatApiError(result.body));
          }
          return;
        }
        const parsed = ListContactsResponseSchema.safeParse(result.data);
        if (!parsed.success) {
          if (!options?.silent) {
            setError("Lista inválida da API");
          }
          return;
        }
        setAsOwner(
          parsed.data.asOwner.map((r) => ({
            id: r.id,
            name: r.contact.name,
            email: r.contact.email,
            since: new Date(r.createdAt).toLocaleDateString("pt-BR"),
          })),
        );
        setAsContact(
          parsed.data.asContact.map((r) => ({
            id: r.id,
            name: r.owner.name,
            email: r.owner.email,
            since: new Date(r.createdAt).toLocaleDateString("pt-BR"),
          })),
        );
        setLoaded(true);
      } finally {
        setRefreshing(false);
      }
    },
    [getAccessToken],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshList();
      const timer = setInterval(() => {
        void refreshList({ silent: true });
      }, CONTACTS_POLL_MS);
      return () => {
        clearInterval(timer);
      };
    }, [refreshList]),
  );

  const createInvite = async () => {
    setError(null);
    setMessage(null);
    const parsed = CreateInviteRequestSchema.safeParse({ targetEmail });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetchJson<unknown>("/emergency/invites", {
        method: "POST",
        body: JSON.stringify(parsed.data),
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const body = CreateInviteResponseSchema.safeParse(result.data);
      if (!body.success) {
        setError("Resposta de convite inválida");
        return;
      }
      setMessage(
        body.data.linkedImmediately
          ? "✅ Contato adicionado! Ele já aparece na lista."
          : "✅ Convite enviado! Quando abrir o app com este e-mail, o vínculo será ativado automaticamente.",
      );
      setTargetEmail("");
      await refreshList({ silent: true });
    } finally {
      setLoading(false);
    }
  };

  const confirmRemove = (item: ContactItem, role: "owner" | "contact") => {
    const label =
      role === "owner"
        ? `Remover ${item.name} dos seus contatos?`
        : `Deixar de ser contato de ${item.name}?`;

    Alert.alert("Remover vínculo", label, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => void removeContact(item.id),
      },
    ]);
  };

  const removeContact = async (linkId: string) => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const path = `/emergency/contacts/${encodeURIComponent(linkId)}`;
      const result = await apiFetchJson<unknown>(path, {
        method: "DELETE",
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      setMessage("Vínculo removido.");
      await refreshList({ silent: true });
    } finally {
      setLoading(false);
    }
  };

  const avatarColors = [
    "#6C3CE2",
    "#E74C3C",
    "#2ECC71",
    "#F39C12",
    "#3498DB",
    "#E91E63",
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Contatos de Emergência</Text>
        {refreshing ? (
          <Text style={styles.refreshHint}>Atualizando…</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👤 Meus contatos</Text>
        <Text style={styles.sectionDesc}>
          Pessoas que você adicionou como contato de emergência
        </Text>
        {!loaded ? (
          <Text style={styles.muted}>Carregando…</Text>
        ) : asOwner.length === 0 ? (
          <Text style={styles.muted}>Nenhum contato adicionado ainda</Text>
        ) : (
          asOwner.map((c, i) => (
            <GlassCard key={c.id} style={styles.contactCard}>
              <Avatar
                name={c.name}
                color={avatarColors[i % avatarColors.length]}
              />
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactEmail}>{c.email}</Text>
                <Text style={styles.contactSince}>Desde {c.since}</Text>
              </View>
              <View style={styles.contactActions}>
                <Badge label="Ativo" variant="safe" />
                <AppButton
                  title="Remover"
                  variant="outline"
                  onPress={() => confirmRemove(c, "owner")}
                  small
                  style={styles.removeBtn}
                />
              </View>
            </GlassCard>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🤝 Sou contato de</Text>
        <Text style={styles.sectionDesc}>
          Titulares que você protege (vínculo automático ao abrir o app)
        </Text>
        {!loaded ? null : asContact.length === 0 ? (
          <Text style={styles.muted}>Nenhum vínculo como contato</Text>
        ) : (
          asContact.map((c, i) => (
            <GlassCard key={c.id} style={styles.contactCard}>
              <Avatar
                name={c.name}
                color={avatarColors[(i + 3) % avatarColors.length]}
              />
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactEmail}>{c.email}</Text>
                <Text style={styles.contactSince}>Desde {c.since}</Text>
              </View>
              <View style={styles.contactActions}>
                <Badge label="Ativo" variant="safe" />
                <AppButton
                  title="Remover"
                  variant="outline"
                  onPress={() => confirmRemove(c, "contact")}
                  small
                  style={styles.removeBtn}
                />
              </View>
            </GlassCard>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✉️ Adicionar contato</Text>
        <Text style={styles.sectionDesc}>
          Informe o e-mail da pessoa. Se ela já usa o app, o vínculo é imediato;
          caso contrário, ativa sozinha no primeiro acesso com esse e-mail.
        </Text>
        <AppInput
          label="E-mail do contato"
          placeholder="email@contato.com"
          value={targetEmail}
          onChangeText={setTargetEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppButton
          title="Adicionar"
          onPress={() => void createInvite()}
          loading={loading}
          small
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  container: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    flex: 1,
  },
  refreshHint: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  sectionDesc: {
    ...Typography.small,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  muted: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  contactEmail: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  contactSince: {
    ...Typography.small,
    color: Colors.textMuted,
  },
  contactActions: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  removeBtn: {
    minWidth: 88,
  },
  success: {
    ...Typography.caption,
    color: Colors.safe,
    textAlign: "center",
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
  },
});

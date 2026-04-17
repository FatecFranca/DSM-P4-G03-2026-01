import {
  AcceptInviteResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { GlassCard } from "../components/GlassCard";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { Colors, Typography, Spacing, Radius } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type ContactItem = {
  id: string;
  name: string;
  email: string;
  since: string;
};

type Props = NativeStackScreenProps<AppStackParamList, "Contacts">;

export function ContactsScreen(_props: Props) {
  const { getAccessToken } = useAuth();
  const [targetEmail, setTargetEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [asOwner, setAsOwner] = useState<ContactItem[]>([]);
  const [asContact, setAsContact] = useState<ContactItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setError(null);
    setMessage(null);
    const token = getAccessToken();
    const result = await apiFetchJson<unknown>("/emergency/contacts", {
      method: "GET",
      accessToken: token,
    });
    if (!result.ok) {
      setError(formatApiError(result.body));
      return;
    }
    const parsed = ListContactsResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      setError("Lista inválida da API");
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
  }, [getAccessToken]);

  const createInvite = async () => {
    setError(null);
    setMessage(null);
    setDevToken(null);
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
      if (body.data.devInvitationToken) {
        setDevToken(body.data.devInvitationToken);
      }
      setMessage("✅ Convite enviado com sucesso!");
      setTargetEmail("");
      await refreshList();
    } finally {
      setLoading(false);
    }
  };

  const acceptInvite = async () => {
    setError(null);
    setMessage(null);
    const token = inviteToken.trim();
    if (token.length < 16) {
      setError("Cole o token do convite");
      return;
    }
    setLoading(true);
    try {
      const path = `/emergency/invites/${encodeURIComponent(token)}/accept`;
      const result = await apiFetchJson<unknown>(path, {
        method: "POST",
        body: JSON.stringify({}),
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const body = AcceptInviteResponseSchema.safeParse(result.data);
      if (!body.success) {
        setError("Resposta de aceite inválida");
        return;
      }
      setMessage(
        `✅ Vínculo ativo com ${body.data.link.owner.name}!`,
      );
      setInviteToken("");
      await refreshList();
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
      {/* Header */}
      <Text style={styles.title}>Contatos de Emergência</Text>

      <AppButton
        title="Atualizar lista"
        variant="outline"
        onPress={() => void refreshList()}
        small
      />

      {/* As Owner */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👤 Meus contatos</Text>
        <Text style={styles.sectionDesc}>
          Pessoas que você adicionou como contato de emergência
        </Text>
        {!loaded ? (
          <Text style={styles.muted}>Toque em "Atualizar lista"</Text>
        ) : asOwner.length === 0 ? (
          <Text style={styles.muted}>Nenhum contato adicionado ainda</Text>
        ) : (
          asOwner.map((c, i) => (
            <GlassCard key={c.id} style={styles.contactCard}>
              <Avatar name={c.name} color={avatarColors[i % avatarColors.length]} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactEmail}>{c.email}</Text>
                <Text style={styles.contactSince}>Desde {c.since}</Text>
              </View>
              <Badge label="Ativo" variant="safe" />
            </GlassCard>
          ))
        )}
      </View>

      {/* As Contact */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🤝 Sou contato de</Text>
        <Text style={styles.sectionDesc}>
          Titulares que você protege
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
              <Badge label="Ativo" variant="safe" />
            </GlassCard>
          ))
        )}
      </View>

      {/* New Invite */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✉️ Convidar contato</Text>
        <AppInput
          label="E-mail do contato"
          placeholder="email@contato.com"
          value={targetEmail}
          onChangeText={setTargetEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppButton
          title="Enviar convite"
          onPress={() => void createInvite()}
          loading={loading}
          small
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {/* Dev Token */}
      {devToken ? (
        <GlassCard style={styles.devBox}>
          <Text style={styles.devLabel}>🔧 DEV — token do convite</Text>
          <Text selectable style={styles.devToken}>
            {devToken}
          </Text>
        </GlassCard>
      ) : null}

      {/* Accept Invite */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 Aceitar convite</Text>
        <AppInput
          label="Token do convite"
          placeholder="Cole o token recebido"
          value={inviteToken}
          onChangeText={setInviteToken}
          autoCapitalize="none"
        />
        <AppButton
          title="Aceitar convite"
          variant="outline"
          onPress={() => void acceptInvite()}
          loading={loading}
          small
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {/* Feedback */}
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
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
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
  devBox: {
    gap: Spacing.sm,
  },
  devLabel: {
    ...Typography.captionBold,
    color: Colors.warning,
  },
  devToken: {
    fontFamily: "monospace",
    fontSize: 11,
    color: Colors.textSecondary,
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

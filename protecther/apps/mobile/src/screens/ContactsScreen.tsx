import {
  AcceptInviteResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Contacts">;

export function ContactsScreen(_props: Props) {
  const { getAccessToken } = useAuth();
  const [targetEmail, setTargetEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [listText, setListText] = useState<string>("");
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
    const lines: string[] = [];
    lines.push("Como titular (asOwner):");
    for (const row of parsed.data.asOwner) {
      lines.push(
        `- ${row.contact.name} <${row.contact.email}> — desde ${row.createdAt}`,
      );
    }
    lines.push("");
    lines.push("Onde sou contato (asContact):");
    for (const row of parsed.data.asContact) {
      lines.push(
        `- Titular: ${row.owner.name} <${row.owner.email}> — desde ${row.createdAt}`,
      );
    }
    setListText(lines.join("\n"));
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
      setMessage("Convite criado.");
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
        `Vínculo ativo entre você e ${body.data.link.owner.name} (${body.data.link.owner.email}).`,
      );
      setInviteToken("");
      await refreshList();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Contatos</Text>
      <Button title="Atualizar lista" onPress={() => void refreshList()} />

      <Text style={styles.section}>Lista</Text>
      <Text style={styles.mono}>
        {listText || "(toque em Atualizar lista)"}
      </Text>

      <Text style={styles.section}>Novo convite (email)</Text>
      <TextInput
        style={styles.input}
        placeholder="email@convidada.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={targetEmail}
        onChangeText={setTargetEmail}
      />
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Criar convite" onPress={() => void createInvite()} />
      )}

      {devToken ? (
        <View style={styles.devBox}>
          <Text style={styles.devLabel}>DEV — token do convite (copiar)</Text>
          <Text selectable style={styles.mono}>
            {devToken}
          </Text>
        </View>
      ) : null}

      <Text style={styles.section}>Aceitar convite (token)</Text>
      <TextInput
        style={styles.input}
        placeholder="cole o token"
        autoCapitalize="none"
        value={inviteToken}
        onChangeText={setInviteToken}
      />
      {loading ? null : (
        <Button title="Aceitar convite" onPress={() => void acceptInvite()} />
      )}

      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  section: { marginTop: 16, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#222" },
  devBox: {
    padding: 12,
    backgroundColor: "#f4f4ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccd",
  },
  devLabel: { fontWeight: "600", marginBottom: 6 },
  ok: { color: "#070" },
  error: { color: "#c00" },
});

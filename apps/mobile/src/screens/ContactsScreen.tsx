import {
  AcceptInviteResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type ContactItem = {
  id: string;
  name: string;
  email: string;
  since: string;
};

type Props = NativeStackScreenProps<AppStackParamList, "Contacts">;

export function ContactsScreen(_props: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
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
      setMessage("Convite enviado com sucesso!");
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
      setMessage(`Vínculo ativo com ${body.data.link.owner.name}!`);
      setInviteToken("");
      await refreshList();
    } finally {
      setLoading(false);
    }
  };

  const renderContactList = (items: ContactItem[]) => {
    if (!loaded) {
      return null;
    }
    if (items.length === 0) {
      return null;
    }
    return (
      <View style={styles.contactList}>
        {items.map((c) => (
          <View key={c.id} style={styles.contactRow}>
            <Text style={styles.contactName}>{c.name}</Text>
            <Text style={styles.contactEmail}>{c.email}</Text>
            <Text style={styles.contactSince}>Desde {c.since}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(12, insets.top + 6),
            paddingBottom: Math.max(Spacing.xxxl, insets.bottom + 16),
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Protect Her</Text>

        <Text style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}>
          Contatos de Emergência
        </Text>

        <Pressable
          onPress={() => void refreshList()}
          style={({ pressed }) => [
            styles.outlineButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.outlineButtonText}>Atualizar lista</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meus contatos</Text>
          <Text style={styles.sectionDesc}>
            Pessoas que você adicionou como contato de emergência
          </Text>
          {!loaded ? (
            <Text style={styles.hint}>Toque em &quot;Atualizar lista&quot;</Text>
          ) : asOwner.length === 0 ? (
            <Text style={styles.hint}>Nenhum contato adicionado ainda</Text>
          ) : null}
          {renderContactList(asOwner)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sou contato de</Text>
          <Text style={styles.sectionDesc}>Titulares que você protege</Text>
          {loaded && asContact.length === 0 ? (
            <Text style={styles.hint}>Nenhum vínculo como contato</Text>
          ) : null}
          {renderContactList(asContact)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Convidar contato</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-mail do contato</Text>
            <TextInput
              style={styles.input}
              placeholder="seu@email.com"
              placeholderTextColor="#8B7378"
              value={targetEmail}
              onChangeText={setTargetEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              cursorColor="#DA8295"
              selectionColor="#DA8295"
            />
          </View>
          <Pressable
            onPress={() => void createInvite()}
            disabled={loading}
            style={({ pressed }) => [
              styles.outlineButton,
              (pressed || loading) && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#DA8295" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>Enviar convite</Text>
            )}
          </Pressable>
        </View>

        {devToken ? (
          <View style={styles.devBox}>
            <Text style={styles.devLabel}>DEV — token do convite</Text>
            <Text selectable style={styles.devToken}>
              {devToken}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aceitar convite</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Token do convite</Text>
            <TextInput
              style={styles.input}
              placeholder="Cole o token recebido"
              placeholderTextColor="#8B7378"
              value={inviteToken}
              onChangeText={setInviteToken}
              autoCapitalize="none"
              cursorColor="#DA8295"
              selectionColor="#DA8295"
            />
          </View>
          <Pressable
            onPress={() => void acceptInvite()}
            disabled={loading}
            style={({ pressed }) => [
              styles.outlineButton,
              (pressed || loading) && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#DA8295" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>Aceitar convite</Text>
            )}
          </Pressable>
        </View>

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#FDF2F6",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: Spacing.lg,
    gap: 16,
  },
  brand: {
    fontFamily: "Italianno_400Regular",
    fontSize: 36,
    color: "#DA8295",
    lineHeight: 40,
  },
  pageTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 24,
    lineHeight: 30,
    color: "#55383E",
    marginTop: -4,
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
  },
  pageTitleSmall: {
    fontSize: 21,
    lineHeight: 27,
  },
  outlineButton: {
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#DA8295",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  outlineButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    color: "#DA8295",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#55383E",
    marginTop: 4,
  },
  sectionDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#55383E",
  },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#55383E",
    opacity: 0.85,
  },
  inputGroup: {
    gap: 6,
    marginTop: 4,
  },
  inputLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#55383E",
  },
  input: {
    backgroundColor: "#FFD0E1",
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#8B7378",
    borderWidth: 0,
  },
  contactList: {
    gap: 8,
    marginTop: 4,
  },
  contactRow: {
    backgroundColor: "rgba(255,221,225,0.6)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contactName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#55383E",
  },
  contactEmail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#55383E",
    marginTop: -2,
    includeFontPadding: false,
  },
  contactSince: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#7A5A60",
    marginTop: 2,
  },
  devBox: {
    backgroundColor: "rgba(255,221,225,0.8)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#D9A2AE",
    padding: 12,
    gap: 6,
  },
  devLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#7D1F44",
  },
  devToken: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#55383E",
  },
  success: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#2E7D4F",
    textAlign: "center",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});

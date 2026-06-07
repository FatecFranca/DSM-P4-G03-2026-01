import {
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const CONTACTS_POLL_MS = 10_000;

export function ContactsScreen(_props: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
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
          ? "Contato adicionado! Ele já aparece na lista."
          : "Convite enviado! Quando abrir o app com este e-mail, o vínculo será ativado automaticamente.",
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

  const renderContactList = (
    items: ContactItem[],
    role: "owner" | "contact",
  ) => {
    if (!loaded || items.length === 0) {
      return null;
    }
    return (
      <View style={styles.contactList}>
        {items.map((c) => (
          <View key={c.id} style={styles.contactRow}>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{c.name}</Text>
              <Text style={styles.contactEmail}>{c.email}</Text>
              <Text style={styles.contactSince}>Desde {c.since}</Text>
            </View>
            <Pressable
              onPress={() => confirmRemove(c, role)}
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.removeButtonText}>Remover</Text>
            </Pressable>
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
          disabled={refreshing}
          style={({ pressed }) => [
            styles.outlineButton,
            (pressed || refreshing) && styles.buttonPressed,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color="#DA8295" size="small" />
          ) : (
            <Text style={styles.outlineButtonText}>Atualizar lista</Text>
          )}
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meus contatos</Text>
          <Text style={styles.sectionDesc}>
            Pessoas que você adicionou como contato de emergência
          </Text>
          {!loaded ? (
            <Text style={styles.hint}>Carregando…</Text>
          ) : asOwner.length === 0 ? (
            <Text style={styles.hint}>Nenhum contato adicionado ainda</Text>
          ) : null}
          {renderContactList(asOwner, "owner")}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sou contato de</Text>
          <Text style={styles.sectionDesc}>
            Titulares que você protege (vínculo automático ao abrir o app)
          </Text>
          {loaded && asContact.length === 0 ? (
            <Text style={styles.hint}>Nenhum vínculo como contato</Text>
          ) : null}
          {renderContactList(asContact, "contact")}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Convidar contato</Text>
          <Text style={styles.sectionDesc}>
            Informe o e-mail da pessoa. Se ela já usa o app, o vínculo é
            imediato; caso contrário, ativa sozinha no primeiro acesso com esse
            e-mail.
          </Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-mail do contato</Text>
            <TextInput
              style={styles.input}
              placeholder="email@contato.com"
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
    color: "#55383E",
    borderWidth: 0,
  },
  contactList: {
    gap: 8,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,221,225,0.6)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contactInfo: {
    flex: 1,
    gap: 0,
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
  removeButton: {
    minHeight: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#DA8295",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#DA8295",
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

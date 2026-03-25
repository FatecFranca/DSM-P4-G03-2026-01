import { ActiveAlertResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { state, signOut, getAccessToken } = useAuth();
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

  const refreshActive = useCallback(async () => {
    const token = getAccessToken();
    const result = await apiFetchJson<unknown>("/alerts/active", {
      method: "GET",
      accessToken: token,
    });
    if (!result.ok) {
      setActiveAlertId(null);
      return;
    }
    const parsed = ActiveAlertResponseSchema.safeParse(result.data);
    if (!parsed.success || !parsed.data.alert) {
      setActiveAlertId(null);
      return;
    }
    setActiveAlertId(parsed.data.alert.id);
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshActive();
    }, [refreshActive]),
  );

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state.session;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Olá, {user.name}</Text>
      <Text style={styles.sub}>{user.email}</Text>
      <View style={styles.actions}>
        {activeAlertId ? (
          <Button
            title="Continuar alerta ativo"
            onPress={() =>
              navigation.navigate("ActiveAlert", { alertId: activeAlertId })
            }
          />
        ) : null}
        <Button title="SOS" onPress={() => navigation.navigate("Sos")} />
        <Button
          title="Contatos de emergência"
          onPress={() => navigation.navigate("Contacts")}
        />
        <Button
          title="Alertas das titulares (contato)"
          onPress={() => navigation.navigate("ContactAlertsFeed")}
        />
        <Button title="Sair" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, paddingTop: 56 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 16, color: "#444" },
  actions: { marginTop: 24, gap: 8 },
});

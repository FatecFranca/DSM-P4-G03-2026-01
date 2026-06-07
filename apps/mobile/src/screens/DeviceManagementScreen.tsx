import {
  ListBleDevicesResponseSchema,
  RegisterBleDeviceRequestSchema,
  RegisterBleDeviceResponseSchema,
} from "@protecther/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useEspDeviceStorage } from "../hooks/useEspDeviceStorage";
import {
  CHARACTERISTIC_UUID,
  DEVICE_NAME,
  SERVICE_UUID,
} from "../services/ble/espBle";
import { Radius, Shadow, Spacing } from "../theme";

type BleDevice = {
  id: string;
  deviceId: string;
  deviceName: string;
  serviceUuid: string;
  characteristicUuid: string;
  isActive: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
};

export function DeviceManagementScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const { getAccessToken } = useAuth();
  const { savedDevice, saveDevice, clearDevice } = useEspDeviceStorage();
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const result = await apiFetchJson<unknown>("/devices/ble", {
        method: "GET",
        accessToken: token,
      });
      if (!result.ok) {
        setError("Falha ao carregar dispositivos");
        return;
      }
      const parsed = ListBleDevicesResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setError("Resposta inválida da API");
        return;
      }
      setDevices(parsed.data.devices);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const pairDevice = async () => {
    setPairing(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        setError("Não autenticado");
        return;
      }

      const request = RegisterBleDeviceRequestSchema.parse({
        deviceId: DEVICE_NAME,
        deviceName: DEVICE_NAME,
        serviceUuid: SERVICE_UUID,
        characteristicUuid: CHARACTERISTIC_UUID,
      });

      const result = await apiFetchJson<unknown>("/devices/ble", {
        method: "POST",
        body: JSON.stringify(request),
        accessToken: token,
      });

      if (!result.ok) {
        setError("Falha ao parear dispositivo");
        return;
      }

      const parsed = RegisterBleDeviceResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setError("Resposta inválida da API");
        return;
      }

      await saveDevice({
        deviceId: DEVICE_NAME,
        deviceName: DEVICE_NAME,
        serviceUuid: SERVICE_UUID,
        characteristicUuid: CHARACTERISTIC_UUID,
        apiDeviceId: parsed.data.device.id,
      });

      try {
        const heartbeatResult = await apiFetchJson<unknown>(
          `/devices/ble/${parsed.data.device.id}/heartbeat`,
          { method: "PATCH", accessToken: token },
        );
        if (heartbeatResult.ok) {
          console.log("Heartbeat registrado após pareamento");
        }
      } catch {
        console.log("Heartbeat pós-pareamento falhou, ignorando");
      }

      Alert.alert("Sucesso", "Dispositivo pareado com sucesso!");
      void loadDevices();
    } catch (err) {
      setError("Erro ao parear dispositivo");
    } finally {
      setPairing(false);
    }
  };

  const unpairDevice = async (deviceId: string) => {
    Alert.alert(
      "Desvincular dispositivo",
      "Tem certeza que deseja desvincular este dispositivo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desvincular",
          style: "destructive",
          onPress: async () => {
            const token = getAccessToken();
            if (!token) return;

            try {
              const result = await apiFetchJson<unknown>(
                `/devices/ble/${deviceId}`,
                {
                  method: "DELETE",
                  accessToken: token,
                },
              );

              if (!result.ok) {
                setError("Falha ao desvincular dispositivo");
                return;
              }

              await clearDevice();
              void loadDevices();
            } catch {
              setError("Erro ao desvincular dispositivo");
            }
          },
        },
      ],
    );
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    return new Date(dateStr).toLocaleString("pt-BR");
  };

  const renderDevice = (item: BleDevice) => (
    <View key={item.id} style={styles.deviceCard}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.deviceName}</Text>
          <Text style={styles.deviceId}>ID: {item.id.slice(0, 8)}...</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            item.isActive ? styles.statusActive : styles.statusInactive,
          ]}
        >
          <Text style={styles.statusText}>
            {item.isActive ? "Ativo" : "Inativo"}
          </Text>
        </View>
      </View>
      <View style={styles.deviceDetails}>
        <Text style={styles.detailLabel}>Ultima conexao:</Text>
        <Text style={styles.detailValue}>
          {formatDateTime(item.lastConnectedAt)}
        </Text>
      </View>
      <View style={styles.deviceDetails}>
        <Text style={styles.detailLabel}>Vinculado em:</Text>
        <Text style={styles.detailValue}>{formatDateTime(item.createdAt)}</Text>
      </View>
      <Pressable
        onPress={() => void unpairDevice(item.id)}
        style={({ pressed }) => [
          styles.unpairButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.unpairButtonText}>Desvincular</Text>
      </Pressable>
    </View>
  );

  if (loading && devices.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#DA8295" />
      </View>
    );
  }

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
      >
        <Text style={styles.brand}>Protect Her</Text>
        <Text style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}>
          Dispositivos BLE
        </Text>
        <Text style={styles.subtitle}>Gerencie seus dispositivos pareados</Text>

        {savedDevice ? (
          <View style={styles.pairedBanner}>
            <View style={styles.bannerIconCircle}>
              <Text style={styles.bannerIcon}>✓</Text>
            </View>
            <Text style={styles.pairedText}>Dispositivo Pareado localmente</Text>
          </View>
        ) : (
          <View style={styles.unpairedBanner}>
            <Text style={styles.unpairedText}>Nenhum dispositivo pareado</Text>
            <Pressable
              onPress={() => void pairDevice()}
              disabled={pairing}
              style={({ pressed }) => [
                styles.pairButton,
                (pressed || pairing) && styles.buttonPressed,
              ]}
            >
              {pairing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.pairButtonText}>Parear dispositivo</Text>
              )}
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Dispositivos vinculados</Text>

        {devices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nenhum dispositivo registrado</Text>
          </View>
        ) : (
          <View style={styles.list}>{devices.map((item) => renderDevice(item))}</View>
        )}
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
    gap: 14,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDF2F6",
  },
  brand: {
    fontFamily: "Italianno_400Regular",
    fontSize: 36,
    color: "#DA8295",
    lineHeight: 40,
  },
  pageTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 34,
    lineHeight: 40,
    color: "#55383E",
    marginTop: -4,
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
  },
  pageTitleSmall: {
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    lineHeight: 22,
    color: "#55383E",
    textAlign: "center",
  },
  pairedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bannerIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D57F94",
  },
  bannerIcon: {
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 14,
  },
  pairedText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: "#55383E",
  },
  unpairedBanner: {
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  unpairedText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: "#55383E",
  },
  pairButton: {
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: "#C17986",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    ...Shadow.sm,
  },
  pairButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    lineHeight: 24,
    color: "#55383E",
    marginTop: 2,
  },
  list: {
    gap: 10,
  },
  deviceCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#55383E",
  },
  deviceId: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "#7C6268",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "#8CC28E",
  },
  statusActive: {
    backgroundColor: "rgba(160, 214, 163, 0.45)",
  },
  statusInactive: {
    backgroundColor: "rgba(255, 171, 171, 0.35)",
    borderColor: "#D88E8E",
  },
  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "#3E5D41",
  },
  deviceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    gap: 8,
  },
  detailLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#6A5157",
  },
  detailValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#6A5157",
    textAlign: "right",
    flexShrink: 1,
  },
  unpairButton: {
    marginTop: 8,
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#6E4E57",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  unpairButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: "#6E4E57",
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.35)",
    minHeight: 64,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: "#6A5157",
  },
  buttonPressed: {
    opacity: 0.85,
  },
});

import {
  BleDevicePublicSchema,
  ListBleDevicesResponseSchema,
  RegisterBleDeviceRequestSchema,
  RegisterBleDeviceResponseSchema,
  UnregisterBleDeviceResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppButton } from "../components/AppButton";
import { GlassCard } from "../components/GlassCard";
import { useEspDeviceStorage } from "../hooks/useEspDeviceStorage";
import type { AppStackParamList } from "../navigation/types";
import {
  CHARACTERISTIC_UUID,
  DEVICE_NAME,
  SERVICE_UUID,
} from "../services/ble/espBle";
import { Colors, Radius, Spacing, Typography } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "DeviceManagement">;

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

export function DeviceManagementScreen({ navigation }: Props) {
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

  const renderDevice = ({ item }: { item: BleDevice }) => (
    <GlassCard style={styles.deviceCard}>
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
        <Text style={styles.detailLabel}>Última conexão:</Text>
        <Text style={styles.detailValue}>
          {formatDateTime(item.lastConnectedAt)}
        </Text>
      </View>
      <View style={styles.deviceDetails}>
        <Text style={styles.detailLabel}>Vinculado em:</Text>
        <Text style={styles.detailValue}>{formatDateTime(item.createdAt)}</Text>
      </View>
      <AppButton
        title="Desvincular"
        variant="outline"
        onPress={() => void unpairDevice(item.id)}
        style={styles.unpairButton}
      />
    </GlassCard>
  );

  if (loading && devices.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primaryLight} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dispositivos BLE</Text>
      <Text style={styles.subtitle}>
        Gerencie seus dispositivos ESP32 pareados
      </Text>

      {savedDevice ? (
        <GlassCard variant="success" style={styles.pairedBanner}>
          <Text style={styles.pairedIcon}>✅</Text>
          <Text style={styles.pairedText}>Dispositivo pareado localmente</Text>
        </GlassCard>
      ) : (
        <GlassCard style={styles.unpairedBanner}>
          <Text style={styles.unpairedIcon}>📡</Text>
          <Text style={styles.unpairedText}>Nenhum dispositivo pareado</Text>
          <AppButton
            title="Parear ESP32"
            variant="primary"
            onPress={() => void pairDevice()}
            loading={pairing}
            style={styles.pairButton}
          />
        </GlassCard>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Dispositivos vinculados</Text>

      {devices.length === 0 ? (
        <GlassCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nenhum dispositivo registrado</Text>
        </GlassCard>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={renderDevice}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgPrimary,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  pairedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pairedIcon: {
    fontSize: 24,
  },
  pairedText: {
    ...Typography.bodyBold,
    color: Colors.safe,
  },
  unpairedBanner: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  unpairedIcon: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  unpairedText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  pairButton: {
    marginTop: Spacing.md,
    width: "100%",
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  list: {
    gap: Spacing.md,
  },
  deviceCard: {
    marginBottom: Spacing.md,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  deviceId: {
    ...Typography.small,
    color: Colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  statusActive: {
    backgroundColor: "rgba(46, 213, 115, 0.15)",
  },
  statusInactive: {
    backgroundColor: "rgba(255, 71, 87, 0.15)",
  },
  statusText: {
    ...Typography.small,
    color: Colors.textPrimary,
  },
  deviceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  detailLabel: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  detailValue: {
    ...Typography.small,
    color: Colors.textPrimary,
  },
  unpairButton: {
    marginTop: Spacing.md,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
});

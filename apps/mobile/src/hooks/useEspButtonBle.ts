import { useCallback, useEffect, useRef, useState } from "react";
import type { BleError, Device, Subscription } from "react-native-ble-plx";
import {
  CHARACTERISTIC_UUID,
  DEVICE_NAME,
  SERVICE_UUID,
  decodeBleValue,
  getBleManager,
  isBleNativeAvailable,
  requestBlePermissions,
} from "../services/ble/espBle";
import { useEspDeviceStorage } from "./useEspDeviceStorage";

export type EspButtonBleState = {
  status: string;
  isConnected: boolean;
  error: string | null;
};

type UseEspButtonBleOptions = {
  onButtonPress?: () => void;
  onAlertTriggered?: (alertId: string) => void;
  getAccessToken?: () => string | null;
};

const MAX_RECONNECT_DELAY = 30000;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useEspButtonBle(
  options: UseEspButtonBleOptions = {},
): EspButtonBleState {
  const { savedDevice } = useEspDeviceStorage();
  const savedDeviceRef = useRef(savedDevice);
  savedDeviceRef.current = savedDevice;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState("Aguardando BLE...");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const monitorSubscriptionRef = useRef<Subscription | null>(null);
  const mountedRef = useRef(true);
  const isTriggeringRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatSentRef = useRef(false);
  const isScanningRef = useRef(false);

  const cleanup = useCallback(async () => {
    const bleManager = getBleManager();
    if (!bleManager) {
      return;
    }

    console.log("Desconectando BLE e limpando recursos...");
    isScanningRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    bleManager.stopDeviceScan();

    monitorSubscriptionRef.current?.remove();
    monitorSubscriptionRef.current = null;

    try {
      await deviceRef.current?.cancelConnection();
    } catch (cancelError) {
      console.log("Erro ao cancelar conexão BLE:", cancelError);
    }

    deviceRef.current = null;
  }, []);

  const getReconnectDelay = useCallback((): number => {
    const attempt = reconnectAttemptsRef.current;
    const delay = BASE_RECONNECT_DELAY * 2 ** Math.min(attempt, 5);
    const jitter = Math.random() * 1000;
    return Math.min(delay + jitter, MAX_RECONNECT_DELAY);
  }, []);

  const sendHeartbeat = useCallback(async (apiDeviceId: string) => {
    if (heartbeatSentRef.current) return;
    try {
      const token = optionsRef.current.getAccessToken?.();
      if (!token) return;
      const { apiFetchJson } = require("../api/client");
      const result = await apiFetchJson(
        `/devices/ble/${apiDeviceId}/heartbeat`,
        { method: "PATCH", accessToken: token },
      );
      if (result.ok) {
        heartbeatSentRef.current = true;
        console.log("Heartbeat enviado com sucesso");
      }
    } catch (e) {
      console.log("Erro ao enviar heartbeat:", e);
    }
  }, []);

  const triggerAlert = useCallback(async () => {
    if (isTriggeringRef.current) {
      console.log("Alerta já sendo disparado, ignorando...");
      return;
    }

    isTriggeringRef.current = true;
    setStatus("Disparando alerta...");

    try {
      const { getAccessToken, onButtonPress, onAlertTriggered } =
        optionsRef.current;

      if (!getAccessToken) {
        console.log("getAccessToken não fornecido, navegando para SOS");
        onButtonPress?.();
        return;
      }

      const token = getAccessToken();
      if (!token) {
        console.log("Token não disponível, navegando para SOS");
        onButtonPress?.();
        return;
      }

      const { apiFetchJson } = require("../api/client");
      const {
        StartAlertRequestSchema,
        StartAlertResponseSchema,
      } = require("@protecther/contracts");

      const parsed = StartAlertRequestSchema.safeParse({ mode: "visible" });
      if (!parsed.success) {
        console.log("Erro na validação do alerta:", parsed.error.message);
        onButtonPress?.();
        return;
      }

      const result = await apiFetchJson("/alerts/start", {
        method: "POST",
        body: JSON.stringify(parsed.data),
        accessToken: token,
      });

      if (!result.ok) {
        console.log("Erro ao disparar alerta via API:", result.status);
        onButtonPress?.();
        return;
      }

      const body = StartAlertResponseSchema.safeParse(result.data);
      if (!body.success) {
        console.log("Resposta inválida da API");
        onButtonPress?.();
        return;
      }

      console.log("Alerta disparado com sucesso:", body.data.alert.id);
      onAlertTriggered?.(body.data.alert.id);
    } catch (err) {
      console.log("Erro ao disparar alerta:", err);
      optionsRef.current.onButtonPress?.();
    } finally {
      isTriggeringRef.current = false;
    }
  }, []);

  const startMonitoring = useCallback(
    (connectedDevice: Device) => {
      monitorSubscriptionRef.current =
        connectedDevice.monitorCharacteristicForService(
          SERVICE_UUID,
          CHARACTERISTIC_UUID,
          (monitorError: BleError | null, characteristic) => {
            if (monitorError) {
              console.log("erro no monitoramento:", monitorError.message);
              if (mountedRef.current) {
                setError(monitorError.message);
                setStatus("Erro de conexão");
                setIsConnected(false);
              }
              return;
            }

            if (!mountedRef.current) {
              return;
            }

            const decodedValue = decodeBleValue(
              characteristic?.value ?? undefined,
            );
            if (!decodedValue) {
              return;
            }

            console.log("Valor recebido via BLE:", decodedValue);
            if (decodedValue.trim() === "Pressionado") {
              console.log("botão pressionado - disparando alerta automático");
              setStatus("Botão pressionado - disparando alerta!");
              void triggerAlert();
            }
          },
        );
    },
    [triggerAlert],
  );

  const connectToDevice = useCallback(
    async (device: Device) => {
      const bleManager = getBleManager();
      if (!bleManager || !mountedRef.current) return;

      try {
        console.log("Tentando conectar ao dispositivo:", device.id);
        const connectedDevice = await device.connect();
        deviceRef.current = connectedDevice;
        reconnectAttemptsRef.current = 0;
        console.log("Conexão BLE estabelecida");
        if (mountedRef.current) {
          setIsConnected(true);
          setStatus("Conectado");
        }

        console.log("Descobrindo serviços e características...");
        await connectedDevice.discoverAllServicesAndCharacteristics();
        console.log("Serviços e características descobertos");
        if (mountedRef.current) {
          setStatus("Aguardando botão");
        }

        const currentSavedDevice = savedDeviceRef.current;
        if (currentSavedDevice?.apiDeviceId) {
          void sendHeartbeat(currentSavedDevice.apiDeviceId);
        }

        startMonitoring(connectedDevice);
      } catch (connectionError: unknown) {
        const errorMsg =
          connectionError instanceof Error
            ? connectionError.message
            : String(connectionError);
        console.log("erro de conexão:", errorMsg);

        if (!mountedRef.current) return;

        reconnectAttemptsRef.current += 1;

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.log("Máximo de tentativas de reconexão atingido. Parando.");
          setError("Falha ao conectar após várias tentativas");
          setStatus("Falha na conexão");
          setIsConnected(false);
          return;
        }

        setIsConnected(false);
        setError(errorMsg);
        setStatus("Reconectando...");

        const delay = getReconnectDelay();
        console.log(
          `Tentando reconectar em ${Math.round(delay / 1000)}s (tentativa ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            isScanningRef.current = false;
            setStatus("Buscando dispositivo BLE...");
            bleManager.startDeviceScan(
              [SERVICE_UUID],
              null,
              async (scanError, foundDevice) => {
                if (scanError || !foundDevice) return;
                const foundName = foundDevice.name ?? foundDevice.localName;
                if (foundName === DEVICE_NAME) {
                  console.log("Dispositivo encontrado na reconexão");
                  bleManager.stopDeviceScan();
                  isScanningRef.current = false;
                  await connectToDevice(foundDevice);
                }
              },
            );
          }
        }, delay);
      }
    },
    [getReconnectDelay, sendHeartbeat, startMonitoring],
  );

  useEffect(() => {
    if (!isBleNativeAvailable()) {
      setStatus("BLE indisponível no Expo Go");
      return;
    }

    const bleManager = getBleManager();
    if (!bleManager) {
      return;
    }

    let cancelled = false;

    const tryReconnectOrScan = async () => {
      if (isScanningRef.current) return;
      isScanningRef.current = true;

      setStatus("Buscando dispositivo BLE...");
      setError(null);
      heartbeatSentRef.current = false;
      console.log("Iniciando busca BLE...");

      const permissionGranted = await requestBlePermissions();
      if (!permissionGranted) {
        console.log("Permissões BLE não concedidas");
        if (!cancelled && mountedRef.current) {
          setError("Permissões BLE não concedidas.");
          setStatus("Erro de conexão");
        }
        isScanningRef.current = false;
        return;
      }

      try {
        console.log("Verificando dispositivos já conectados...");
        const connected = await bleManager.connectedDevices([SERVICE_UUID]);
        console.log("Dispositivos conectados encontrados:", connected.length);
        const existing = connected.find(
          (d) => (d.name ?? d.localName) === DEVICE_NAME,
        );
        if (existing) {
          console.log("Dispositivo já conectado, reutilizando:", existing.id);
          setStatus("Dispositivo encontrado");
          await connectToDevice(existing);
          isScanningRef.current = false;
          return;
        }
      } catch (e) {
        console.log("Erro ao verificar dispositivos conectados:", e);
      }

      if (cancelled) {
        isScanningRef.current = false;
        return;
      }

      console.log("Iniciando scan BLE...");
      bleManager.startDeviceScan(
        [SERVICE_UUID],
        null,
        async (scanError, device) => {
          if (cancelled || !mountedRef.current) return;

          if (scanError) {
            console.warn("⚠️ Erro no scan BLE:", scanError.message);
            if (!cancelled && mountedRef.current) {
              setError(scanError.message);
              setStatus("Erro de conexão");
            }
            bleManager.stopDeviceScan();
            isScanningRef.current = false;
            return;
          }

          if (!device) return;

          const foundName = device.name ?? device.localName;
          console.log(
            `📡 Dispositivo BLE encontrado: "${foundName}" | ID: ${device.id}`,
          );

          if (foundName !== DEVICE_NAME) return;

          console.log("✅ Dispositivo alvo encontrado no scan:", foundName);
          setStatus("Dispositivo encontrado");
          bleManager.stopDeviceScan();
          isScanningRef.current = false;

          await connectToDevice(device);
        },
      );
    };

    void tryReconnectOrScan();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      isScanningRef.current = false;
      void cleanup();
    };
  }, [cleanup, connectToDevice]);

  return {
    status,
    isConnected,
    error,
  };
}

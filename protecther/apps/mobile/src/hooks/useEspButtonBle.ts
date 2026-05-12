import { useCallback, useEffect, useRef, useState } from "react";
import { BleError, Device, Subscription } from "react-native-ble-plx";
import { bleManager, CHARACTERISTIC_UUID, DEVICE_NAME, SERVICE_UUID, decodeBleValue, requestBlePermissions } from "../services/ble/espBle";

export type EspButtonBleState = {
  status: string;
  isConnected: boolean;
  error: string | null;
};

export function useEspButtonBle(onButtonPress: () => void): EspButtonBleState {
  const [status, setStatus] = useState("Aguardando BLE...");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const monitorSubscriptionRef = useRef<Subscription | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(async () => {
    console.log("Desconectando BLE e limpando recursos...");
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

  useEffect(() => {
    let active = true;

    const startBleFlow = async () => {
      setStatus("Buscando dispositivo BLE...");
      setError(null);
      console.log("buscando dispositivo");

      const permissionGranted = await requestBlePermissions();
      if (!permissionGranted) {
        console.log("erro de conexão: permissões BLE não concedidas");
        if (mountedRef.current) {
          setError("Permissões BLE não concedidas.");
          setStatus("Erro de conexão");
        }
        return;
      }

      bleManager.startDeviceScan([SERVICE_UUID], null, async (scanError, device) => {
        if (!mountedRef.current) {
          return;
        }

        if (scanError) {
          console.log("erro de conexão:", scanError);
          if (mountedRef.current) {
            setError(scanError.message);
            setStatus("Erro de conexão");
          }
          bleManager.stopDeviceScan();
          return;
        }

        if (!device) {
          return;
        }

        const foundName = device.name ?? device.localName;
        if (foundName !== DEVICE_NAME) {
          return;
        }

        console.log("dispositivo encontrado:", foundName);
        setStatus("Dispositivo encontrado");
        bleManager.stopDeviceScan();

        try {
          const connectedDevice = await device.connect();
          deviceRef.current = connectedDevice;
          console.log("conectado");
          if (mountedRef.current) {
            setIsConnected(true);
            setStatus("Conectado");
          }

          await connectedDevice.discoverAllServicesAndCharacteristics();
          console.log("Serviços e características descobertos");
          if (mountedRef.current) {
            setStatus("Aguardando botão");
          }

          monitorSubscriptionRef.current = connectedDevice.monitorCharacteristicForService(
            SERVICE_UUID,
            CHARACTERISTIC_UUID,
            (monitorError: BleError | null, characteristic) => {
              if (monitorError) {
                console.log("erro de conexão:", monitorError);
                if (mountedRef.current) {
                  setError(monitorError.message);
                  setStatus("Erro de conexão");
                }
                return;
              }

              if (!mountedRef.current) {
                return;
              }

              const decodedValue = decodeBleValue(characteristic?.value);
              if (!decodedValue) {
                return;
              }

              console.log("Valor recebido via BLE:", decodedValue);
              if (decodedValue.trim() === "Pressionado") {
                console.log("botão pressionado");
                setStatus("Botão pressionado");
                onButtonPress();
              }
            },
          );
        } catch (connectionError) {
          console.log("erro de conexão:", connectionError);
          if (mountedRef.current) {
            setError(String(connectionError));
            setStatus("Erro de conexão");
          }
        }
      });
    };

    void startBleFlow();

    return () => {
      mountedRef.current = false;
      void cleanup();
    };
  }, [cleanup, onButtonPress]);

  return {
    status,
    isConnected,
    error,
  };
}

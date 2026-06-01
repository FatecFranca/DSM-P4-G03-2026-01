import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

type EspDeviceData = {
  deviceId: string;
  deviceName: string;
  serviceUuid: string;
  characteristicUuid: string;
  apiDeviceId?: string;
};

const STORAGE_KEY = "@protecther:esp_device";

export function useEspDeviceStorage() {
  const [savedDevice, setSavedDevice] = useState<EspDeviceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDevice = async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) {
          setSavedDevice(JSON.parse(data));
        }
      } catch (error) {
        console.log("Erro ao carregar dispositivo BLE:", error);
      } finally {
        setLoading(false);
      }
    };
    void loadDevice();
  }, []);

  const saveDevice = useCallback(async (device: EspDeviceData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
      setSavedDevice(device);
    } catch (error) {
      console.log("Erro ao salvar dispositivo BLE:", error);
    }
  }, []);

  const clearDevice = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setSavedDevice(null);
    } catch (error) {
      console.log("Erro ao limpar dispositivo BLE:", error);
    }
  }, []);

  return { savedDevice, saveDevice, clearDevice, loading };
}

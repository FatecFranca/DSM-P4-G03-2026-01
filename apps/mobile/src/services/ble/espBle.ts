import Constants from "expo-constants";
import { type Permission, PermissionsAndroid, Platform } from "react-native";
import type { BleManager } from "react-native-ble-plx";

export const DEVICE_NAME = "ESP-Oficial-BLE";
export const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleManagerInstance: BleManager | null = null;

export function isBleNativeAvailable(): boolean {
  return Constants.appOwnership !== "expo";
}

export function getBleManager(): BleManager | null {
  if (!isBleNativeAvailable()) {
    return null;
  }
  if (!bleManagerInstance) {
    const { BleManager } =
      require("react-native-ble-plx") as typeof import("react-native-ble-plx");
    bleManagerInstance = new BleManager();
  }
  return bleManagerInstance;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  console.log("Solicitando permissões BLE no Android...");

  const permissions = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ].filter(Boolean) as string[];

  const result = await PermissionsAndroid.requestMultiple(
    permissions as Permission[],
  );
  const deniedPermission = Object.entries(result).find(
    ([, granted]) => granted !== PermissionsAndroid.RESULTS.GRANTED,
  );

  if (deniedPermission) {
    console.log("Permissões BLE não concedidas:", deniedPermission);
    return false;
  }

  return true;
}

export function decodeBleValue(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const { decode } = require("base-64");
    return decode(value);
  } catch (error) {
    console.log("Erro ao decodificar valor BLE:", error);
    return null;
  }
}

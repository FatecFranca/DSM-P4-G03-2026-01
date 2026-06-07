import * as Location from "expo-location";
import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Solicita permissões de localização (foreground + background) assim que o
 * usuário autentica, antes de qualquer alerta ser iniciado.
 * Background é essencial para rastreamento contínuo durante emergências.
 */
export function LocationPermissionSync() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== "authenticated") return;
    void (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        const result = await Location.requestForegroundPermissionsAsync();
        if (result.status !== "granted") return;
      }
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== "granted") {
        await Location.requestBackgroundPermissionsAsync();
      }
    })();
  }, [state.status]);

  return null;
}

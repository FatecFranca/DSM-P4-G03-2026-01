import { useEffect } from "react";
import { AppState } from "react-native";
import { applyPrivacyScreen } from "./discreetIconNative";
import { readPrivacyScreenPreference } from "./privacyPreference";

/**
 * Aplica a preferência de "ocultar prévia nos apps recentes" ao abrir o app e sempre
 * que ele volta ao primeiro plano (a Activity do Android pode ter sido recriada).
 */
export function PrivacyScreenSync() {
  useEffect(() => {
    const apply = () => {
      void readPrivacyScreenPreference()
        .then(applyPrivacyScreen)
        .catch(() => {
          /* sem módulo nativo (Expo Go): nada a aplicar */
        });
    };
    apply();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        apply();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

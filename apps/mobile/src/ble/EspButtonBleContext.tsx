import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  useEspButtonBle,
  type EspButtonBleState,
} from "../hooks/useEspButtonBle";
import { navigationRef } from "../navigation/navigationRef";

const defaultState: EspButtonBleState = {
  status: "Aguardando BLE...",
  isConnected: false,
  error: null,
};

const EspButtonBleContext = createContext<EspButtonBleState>(defaultState);

export function useEspButtonBleState(): EspButtonBleState {
  return useContext(EspButtonBleContext);
}

/** BLE vive no nível da app para não desmontar ao navegar para ActiveAlert. */
export function EspButtonBleProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useAuth();
  const bleState = useEspButtonBle({
    getAccessToken,
    onAlertTriggered: (alertId) => {
      if (navigationRef.isReady()) {
        navigationRef.navigate("ActiveAlert", { alertId });
      }
    },
    onButtonPress: () => {
      if (navigationRef.isReady()) {
        navigationRef.navigate("Sos");
      }
    },
  });

  return (
    <EspButtonBleContext.Provider value={bleState}>
      {children}
    </EspButtonBleContext.Provider>
  );
}

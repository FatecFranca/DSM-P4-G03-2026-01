import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl } from "../config/apiBaseUrl";
import { requestLocationSyncNow } from "../location/locationSyncTrigger";
import { navigationRef } from "../navigation/navigationRef";
import {
  type QuickSosTriggerResult,
  describeTriggerResult,
  isStale,
  shouldOpenActiveAlert,
} from "./quickSos";
import {
  consumePendingQuickSos,
  isQuickSosAvailable,
  onQuickSosTrigger,
  syncQuickSosSession,
} from "./quickSosNative";

const NAV_READY_RETRY_MS = 300;
const NAV_READY_MAX_TRIES = 20;

function whenNavigationReady(run: () => void, tries = 0) {
  if (navigationRef.isReady()) {
    run();
    return;
  }
  if (tries < NAV_READY_MAX_TRIES) {
    setTimeout(() => whenNavigationReady(run, tries + 1), NAV_READY_RETRY_MS);
  }
}

/**
 * Liga o SOS rápido nativo ao app:
 * - espelha a sessão (URL da API + token) para o nativo disparar com o app fechado;
 * - ao receber um disparo (evento ao vivo ou pendente ao abrir o app), inicia o streaming
 *   de GPS e abre a tela do alerta ativo.
 */
export function QuickSosSync() {
  const { state } = useAuth();
  const accessToken =
    state.status === "authenticated" ? state.session.accessToken : null;
  const authenticated = state.status === "authenticated";
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  useEffect(() => {
    if (!isQuickSosAvailable || state.status === "loading") {
      return;
    }
    let session: { apiBaseUrl: string; accessToken: string } | null = null;
    if (accessToken) {
      try {
        session = { apiBaseUrl: getApiBaseUrl(), accessToken };
      } catch {
        session = null;
      }
    }
    void syncQuickSosSession(session).catch(() => undefined);
  }, [accessToken, state.status]);

  useEffect(() => {
    if (!isQuickSosAvailable || !authenticated) {
      return;
    }

    const handle = (result: QuickSosTriggerResult, fromPending: boolean) => {
      if (fromPending && isStale(result)) {
        return;
      }
      if (shouldOpenActiveAlert(result) && result.alertId) {
        const alertId = result.alertId;
        requestLocationSyncNow();
        whenNavigationReady(() => {
          if (authenticatedRef.current) {
            navigationRef.navigate("ActiveAlert", { alertId });
          }
        });
        return;
      }
      const { title, message } = describeTriggerResult(result);
      Alert.alert(title, message);
    };

    const consume = () => {
      void consumePendingQuickSos()
        .then((pending) => {
          if (pending) {
            handle(pending, true);
          }
        })
        .catch(() => undefined);
    };

    consume();
    const unsubscribe = onQuickSosTrigger((result) => {
      if (AppState.currentState === "active") {
        // O nativo também guardou como pendente; consome para não repetir depois.
        void consumePendingQuickSos().catch(() => undefined);
        handle(result, false);
      } else if (shouldOpenActiveAlert(result)) {
        // Em segundo plano: já começa a mandar GPS; o pendente abre a tela quando o
        // app voltar para a frente.
        requestLocationSyncNow();
      }
    });
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        consume();
      }
    });
    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [authenticated]);

  return null;
}

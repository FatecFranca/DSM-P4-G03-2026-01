/**
 * Publica qual alerta da usuária está ativo agora (ou `null`). Quem descobre é o
 * `ActiveAlertLocationSync` (polling de /alerts/active + gatilhos imediatos);
 * o gravador de áudio do SOS escuta daqui para não repetir o polling.
 */
type Listener = (alertId: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function getActiveAlertId(): string | null {
  return current;
}

export function publishActiveAlert(alertId: string | null): void {
  if (alertId === current) {
    return;
  }
  current = alertId;
  for (const listener of listeners) {
    listener(alertId);
  }
}

export function onActiveAlertChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

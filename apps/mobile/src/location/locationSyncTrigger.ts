/**
 * Gatilho leve para forçar uma sincronização imediata do streaming de
 * localização. Sem ele, o `ActiveAlertLocationSync` só descobre um alerta
 * recém-iniciado no próximo ciclo de polling (até ~25s depois), o que atrasa
 * o primeiro ponto no mapa do contato. Ao iniciar um alerta (SOS ou botão
 * BLE), chame `requestLocationSyncNow()` para começar a capturar GPS na hora.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onRequestLocationSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestLocationSyncNow(): void {
  for (const listener of listeners) {
    listener();
  }
}

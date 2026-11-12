import { INITIAL_SOS_AUDIO_STATE, type SosAudioState } from "./sosAudio";

/**
 * Estado global do áudio do SOS (sem React Native), compartilhado entre o
 * gravador (`SosAudioRecorderSync`) e as telas. Também carrega os comandos da
 * interface (pausar/retomar, abrir a explicação do microfone).
 */

type Listener = () => void;

let state: SosAudioState = INITIAL_SOS_AUDIO_STATE;
const stateListeners = new Set<Listener>();

export function getSosAudioState(): SosAudioState {
  return state;
}

export function updateSosAudioState(patch: Partial<SosAudioState>): void {
  const next = { ...state, ...patch };
  const changed = (Object.keys(next) as (keyof SosAudioState)[]).some(
    (key) => next[key] !== state[key],
  );
  if (!changed) {
    return;
  }
  state = next;
  for (const listener of stateListeners) {
    listener();
  }
}

export function subscribeSosAudioState(listener: Listener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function resetSosAudioStateForTests(): void {
  state = INITIAL_SOS_AUDIO_STATE;
  stateListeners.clear();
  commandListeners.clear();
}

export type SosAudioCommand =
  | { type: "pause"; alertId: string }
  | { type: "resume"; alertId: string }
  /** Pede para tentar de novo agora (ex.: permissão acabou de ser concedida). */
  | { type: "kick" }
  | { type: "open_mic_explanation" };

type CommandListener = (command: SosAudioCommand) => void;

const commandListeners = new Set<CommandListener>();

export function sendSosAudioCommand(command: SosAudioCommand): void {
  for (const listener of commandListeners) {
    listener(command);
  }
}

export function onSosAudioCommand(listener: CommandListener): () => void {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";

const EVENTS_KEY = "protecther.experiments.events.v1";
/** Suficiente para uma demonstração; mais que isso não cabe numa tela de resultado. */
export const EXPERIMENT_EVENTS_MAX = 500;

export type StoredExperimentEvent = {
  readonly type: "experiment_exposed" | "experiment_converted";
  readonly experiment: string;
  readonly variant: string;
  readonly metric?: string;
  readonly valueMs?: number;
  readonly recordedAtMs: number;
};

async function loadEvents(): Promise<StoredExperimentEvent[]> {
  const raw = await AsyncStorage.getItem(EVENTS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredExperimentEvent[]) : [];
  } catch {
    return [];
  }
}

export async function recordExperimentEvent(
  event: Omit<StoredExperimentEvent, "recordedAtMs">,
): Promise<void> {
  const events = await loadEvents();
  events.push({ ...event, recordedAtMs: Date.now() });
  while (events.length > EXPERIMENT_EVENTS_MAX) {
    events.shift();
  }
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export async function readExperimentEvents(): Promise<StoredExperimentEvent[]> {
  return loadEvents();
}

export async function clearExperimentEvents(): Promise<void> {
  await AsyncStorage.removeItem(EVENTS_KEY);
}

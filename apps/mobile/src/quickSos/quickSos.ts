/**
 * SOS rápido: tipos e regras puras (sem React Native) compartilhadas pela tela, pela
 * sincronização e pelos testes. O disparo em si é nativo (modules/quick-sos).
 */
import siriNicknames from "./siriNicknames.json";

export type QuickSosStatus =
  | "sent"
  | "already_active"
  | "test"
  | "failed"
  | "no_session";

export type QuickSosSource =
  | "power_button"
  | "quick_tile"
  | "app"
  | "app_intent"
  | "unknown";

export type QuickSosTriggerResult = {
  status: QuickSosStatus;
  source: QuickSosSource;
  alertId: string | null;
  /** epoch em ms */
  at: number;
  message: string | null;
};

export const COUNTDOWN_OPTIONS = [0, 3, 5, 10] as const;
export type CountdownSeconds = (typeof COUNTDOWN_OPTIONS)[number];
export const DEFAULT_COUNTDOWN: CountdownSeconds = 5;

export type QuickSosSettings = {
  powerButtonEnabled: boolean;
  countdownSeconds: CountdownSeconds;
  testMode: boolean;
  /** Android: serviço do botão liga/desliga realmente rodando. */
  serviceRunning: boolean;
};

export type QuickSosCapabilities = {
  powerButton: boolean;
  quickTile: boolean;
  addTilePrompt: boolean;
  appIntents: boolean;
};

export const NO_CAPABILITIES: QuickSosCapabilities = {
  powerButton: false,
  quickTile: false,
  addTilePrompt: false,
  appIntents: false,
};

const STATUSES: readonly QuickSosStatus[] = [
  "sent",
  "already_active",
  "test",
  "failed",
  "no_session",
];
const SOURCES: readonly QuickSosSource[] = [
  "power_button",
  "quick_tile",
  "app",
  "app_intent",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeCountdown(value: unknown): CountdownSeconds {
  return (COUNTDOWN_OPTIONS as readonly unknown[]).includes(value)
    ? (value as CountdownSeconds)
    : DEFAULT_COUNTDOWN;
}

export function normalizeSettings(raw: unknown): QuickSosSettings {
  const r = isRecord(raw) ? raw : {};
  return {
    powerButtonEnabled: r.powerButtonEnabled === true,
    countdownSeconds: normalizeCountdown(r.countdownSeconds),
    testMode: r.testMode === true,
    serviceRunning: r.serviceRunning === true,
  };
}

export function normalizeCapabilities(raw: unknown): QuickSosCapabilities {
  const r = isRecord(raw) ? raw : {};
  return {
    powerButton: r.powerButton === true,
    quickTile: r.quickTile === true,
    addTilePrompt: r.addTilePrompt === true,
    appIntents: r.appIntents === true,
  };
}

/** Valida o payload vindo do nativo (evento ou pendente). null se for lixo. */
export function parseTriggerResult(raw: unknown): QuickSosTriggerResult | null {
  if (!isRecord(raw)) {
    return null;
  }
  const status = STATUSES.find((s) => s === raw.status);
  if (!status) {
    return null;
  }
  const source = SOURCES.find((s) => s === raw.source) ?? "unknown";
  const alertId =
    typeof raw.alertId === "string" && raw.alertId.length > 0
      ? raw.alertId
      : null;
  const at =
    typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : Date.now();
  const message =
    typeof raw.message === "string" && raw.message.length > 0
      ? raw.message
      : null;
  return { status, source, alertId, at, message };
}

/** Disparos pendentes muito antigos não devem abrir telas sozinhos. */
export const PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function isStale(result: QuickSosTriggerResult, now = Date.now()) {
  return now - result.at > PENDING_MAX_AGE_MS;
}

export function shouldOpenActiveAlert(result: QuickSosTriggerResult): boolean {
  return (
    (result.status === "sent" || result.status === "already_active") &&
    result.alertId !== null
  );
}

const SOURCE_LABEL: Record<QuickSosSource, string> = {
  power_button: "botão liga/desliga",
  quick_tile: "bloco das Configurações Rápidas",
  app: "teste no app",
  app_intent: "Siri / Atalhos",
  unknown: "atalho",
};

export function describeTriggerResult(result: QuickSosTriggerResult): {
  title: string;
  message: string;
} {
  const via = SOURCE_LABEL[result.source];
  switch (result.status) {
    case "sent":
      return {
        title: "Alerta enviado",
        message: `Seus contatos foram avisados (via ${via}).`,
      };
    case "already_active":
      return {
        title: "Alerta já estava ativo",
        message: `O atalho (${via}) encontrou um alerta em andamento.`,
      };
    case "test":
      return {
        title: "Teste do atalho",
        message: `Gesto reconhecido (${via}). Nenhum alerta foi enviado porque o modo teste está ligado.`,
      };
    case "no_session":
      return {
        title: "Atalho sem sessão",
        message:
          "O atalho não encontrou sua sessão. Entre de novo no app para reativá-lo.",
      };
    default:
      return {
        title: "Não foi possível enviar",
        message: `O atalho (${via}) falhou${result.message ? `: ${result.message}` : ""}. Use o botão SOS.`,
      };
  }
}

/** Frases da Siri — precisam bater com modules/quick-sos/app-intents/QuickSosIntents.swift. */
export function siriPhrases(appName: string): string[] {
  return [
    `Ativar SOS no ${appName}`,
    `SOS no ${appName}`,
    `Ativar proteção no ${appName}`,
    `Iniciar proteção no ${appName}`,
    `Pedir ajuda no ${appName}`,
    `Emergência no ${appName}`,
  ];
}

/**
 * Apelidos do app para a Siri (INAlternativeAppNames no Info.plist, via app.config.ts): a
 * usuária pode dizer "SOS no Proteger" em vez do nome em inglês.
 */
export const SIRI_APP_NICKNAMES: readonly string[] = siriNicknames;

/**
 * Ensaio da Siri: deu certo quando o disparo veio da Siri / Atalhos e parou no modo teste
 * (ou seja, a Siri achou o atalho e o app respondeu, sem enviar alerta).
 */
export function isSiriRehearsalSuccess(result: QuickSosTriggerResult): boolean {
  return result.source === "app_intent" && result.status === "test";
}

export function countdownLabel(seconds: CountdownSeconds): string {
  return seconds === 0 ? "Na hora" : `${seconds} s`;
}

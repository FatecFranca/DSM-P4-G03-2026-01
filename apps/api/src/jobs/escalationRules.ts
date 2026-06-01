export type EscalationConfig = {
  firstNoAckMs: number;
  repeatMs: number;
};

export type AlertEscalationInput = {
  startedAt: Date;
  lastEscalationAt: Date | null;
};

/**
 * Returns true when an active alert without any ACK should escalate now.
 * Mirrors `runAlertEscalationTick` timing (first fire after N minutes, then every M minutes).
 */
export function isAlertDueForEscalation(
  alert: AlertEscalationInput,
  nowMs: number,
  hasAck: boolean,
  config: EscalationConfig,
): boolean {
  if (hasAck) {
    return false;
  }
  const firstCutoff = nowMs - config.firstNoAckMs;
  const repeatCutoff = nowMs - config.repeatMs;
  const dueFirst =
    alert.lastEscalationAt === null && alert.startedAt.getTime() <= firstCutoff;
  const dueRepeat =
    alert.lastEscalationAt !== null &&
    alert.lastEscalationAt.getTime() <= repeatCutoff;
  return dueFirst || dueRepeat;
}

export function readEscalationConfigFromEnv(): EscalationConfig {
  const firstMin = readMinutesEnv(
    "ALERT_ESCALATION_NO_ACK_MINUTES",
    DEFAULT_FIRST_NO_ACK_MINUTES,
  );
  const repeatMin = readMinutesEnv(
    "ALERT_ESCALATION_REPEAT_MINUTES",
    DEFAULT_REPEAT_MINUTES,
  );
  return {
    firstNoAckMs: firstMin * 60_000,
    repeatMs: repeatMin * 60_000,
  };
}

const DEFAULT_FIRST_NO_ACK_MINUTES = 5;
const DEFAULT_REPEAT_MINUTES = 5;

function readMinutesEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

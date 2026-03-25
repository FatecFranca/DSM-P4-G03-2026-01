/** Escalation ping: no recipient PII in structured logs. */
export type AlertEscalationNotifyPayload = {
  alertId: string;
  escalationCount: number;
  activeContactCount: number;
};

export interface AlertEscalationNotifier {
  notifyEscalation(payload: AlertEscalationNotifyPayload): Promise<void>;
}

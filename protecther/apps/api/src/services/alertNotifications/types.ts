/** Escalation ping: no recipient PII in structured logs. */
export type AlertEscalationNotifyPayload = {
  alertId: string;
  escalationCount: number;
  activeContactCount: number;
};

/** Push to emergency contacts (alert start + escalation). */
export interface AlertContactsPushNotifier {
  notifyAlertStarted(alertId: string): Promise<void>;
  notifyEscalation(payload: AlertEscalationNotifyPayload): Promise<void>;
}

/** @deprecated Use AlertContactsPushNotifier */
export type AlertEscalationNotifier = AlertContactsPushNotifier;

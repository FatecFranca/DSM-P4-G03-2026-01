import admin from "firebase-admin";
import type { OutboundPush, PushProvider, PushSendResult } from "./types.js";

function initFirebaseApp(): void {
  if (admin.apps.length > 0) {
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw.trim() === "") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }
  const parsed = JSON.parse(raw) as admin.ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(parsed),
  });
}

export function createFcmPushProvider(): PushProvider {
  initFirebaseApp();
  const messaging = admin.messaging();

  return {
    async sendBatch(messages: OutboundPush[]): Promise<PushSendResult[]> {
      if (messages.length === 0) {
        return [];
      }
      const fbMessages: admin.messaging.Message[] = messages.map((m) => ({
        token: m.token,
        notification: { title: m.title, body: m.body },
        data: Object.fromEntries(
          Object.entries(m.data ?? {}).map(([k, v]) => [k, String(v)]),
        ),
        android: {
          priority: m.androidPriority === "high" ? "high" : "normal",
          notification: {
            channelId: "alerts",
            priority: m.androidPriority === "high" ? "high" : "default",
          },
        },
        apns: {
          headers: {
            "apns-priority": m.androidPriority === "high" ? "10" : "5",
          },
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      }));
      const res = await messaging.sendEach(fbMessages);
      return messages.map((m, i) => {
        const r = res.responses[i];
        if (!r) {
          return {
            token: m.token,
            ok: false,
            errorCode: "MISSING_RESPONSE",
          };
        }
        if (r.success) {
          return {
            token: m.token,
            ok: true,
            messageId: r.messageId,
          };
        }
        return {
          token: m.token,
          ok: false,
          errorCode: r.error?.code ?? "UNKNOWN",
        };
      });
    },
  };
}

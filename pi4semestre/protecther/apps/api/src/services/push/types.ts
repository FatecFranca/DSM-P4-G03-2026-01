export type OutboundPush = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  androidPriority: "normal" | "high";
};

export type PushSendResult = {
  token: string;
  ok: boolean;
  messageId?: string;
  errorCode?: string;
};

export interface PushProvider {
  sendBatch(messages: OutboundPush[]): Promise<PushSendResult[]>;
}

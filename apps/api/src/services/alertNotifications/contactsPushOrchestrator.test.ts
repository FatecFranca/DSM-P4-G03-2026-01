import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../lib/alertAccess.js", () => ({
  getAlertById: vi.fn(),
}));

vi.mock("../../lib/telemetry.js", () => ({
  logAlertTelemetry: vi.fn(),
}));

import { db } from "../../db/index.js";
import { getAlertById } from "../../lib/alertAccess.js";
import type { PushProvider } from "../push/types.js";
import { createAlertContactsPushOrchestrator } from "./contactsPushOrchestrator.js";

type SelectChain<T> = {
  from: (t: unknown) => { where: (c: unknown) => Promise<T[]> };
};

function makeSelectChain<T>(rows: T[]): SelectChain<T> {
  return { from: () => ({ where: () => Promise.resolve(rows) }) };
}

function makeInsertChain(mockValues: ReturnType<typeof vi.fn>) {
  return { values: mockValues };
}

const mockLog = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
} as unknown as FastifyBaseLogger;

const ACTIVE_ALERT = {
  id: "alert-1",
  ownerUserId: "owner-1",
  status: "active" as const,
  startedAt: new Date("2026-01-01T12:00:00Z"),
  mode: "visible" as const,
  riskLevel: "normal" as const,
  createdAt: new Date("2026-01-01T12:00:00Z"),
  endedAt: null,
  cancelReason: null,
  lastEscalationAt: null,
  escalationCount: 0,
};

describe("createAlertContactsPushOrchestrator — notifyAlertStarted", () => {
  let provider: PushProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = { sendBatch: vi.fn().mockResolvedValue([]) };
  });

  it("sends push to all active contacts and records delivery events", async () => {
    vi.mocked(getAlertById).mockResolvedValue(ACTIVE_ALERT);

    const mockValues = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeSelectChain([
          { contactUserId: "c1" },
          { contactUserId: "c2" },
        ]) as unknown as ReturnType<typeof db.select>,
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { userId: "c1", token: "tok-a" },
          { userId: "c2", token: "tok-b" },
        ]) as unknown as ReturnType<typeof db.select>,
      );
    vi.mocked(db.insert).mockReturnValue(
      makeInsertChain(mockValues) as unknown as ReturnType<typeof db.insert>,
    );
    vi.mocked(provider.sendBatch).mockResolvedValue([
      { token: "tok-a", ok: true, messageId: "msg-1" },
      { token: "tok-b", ok: true, messageId: "msg-2" },
    ]);

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await notifier.notifyAlertStarted("alert-1");

    expect(provider.sendBatch).toHaveBeenCalledOnce();
    const messages = vi.mocked(provider.sendBatch).mock.calls[0]?.[0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      token: "tok-a",
      title: "ProtectHer",
      data: { alertId: "alert-1", kind: "alert_started" },
    });

    // One delivery event per token
    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(mockValues.mock.calls[0]?.[0]).toMatchObject({
      success: true,
      providerMessageId: "msg-1",
    });
    expect(mockValues.mock.calls[1]?.[0]).toMatchObject({
      success: true,
      providerMessageId: "msg-2",
    });
  });

  it("does not send push when there are no active contacts", async () => {
    vi.mocked(getAlertById).mockResolvedValue(ACTIVE_ALERT);
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([]) as unknown as ReturnType<typeof db.select>,
    );

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await notifier.notifyAlertStarted("alert-1");

    expect(provider.sendBatch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not crash and does not send push when contacts have no push tokens", async () => {
    vi.mocked(getAlertById).mockResolvedValue(ACTIVE_ALERT);
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeSelectChain([{ contactUserId: "c1" }]) as unknown as ReturnType<
          typeof db.select
        >,
      )
      .mockReturnValueOnce(
        makeSelectChain([]) as unknown as ReturnType<typeof db.select>,
      );

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await expect(
      notifier.notifyAlertStarted("alert-1"),
    ).resolves.toBeUndefined();

    expect(provider.sendBatch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("records BATCH_EXCEPTION failure events and does not throw when sendBatch throws", async () => {
    vi.mocked(getAlertById).mockResolvedValue(ACTIVE_ALERT);

    const mockValues = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeSelectChain([{ contactUserId: "c1" }]) as unknown as ReturnType<
          typeof db.select
        >,
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { userId: "c1", token: "tok-a" },
        ]) as unknown as ReturnType<typeof db.select>,
      );
    vi.mocked(db.insert).mockReturnValue(
      makeInsertChain(mockValues) as unknown as ReturnType<typeof db.insert>,
    );
    vi.mocked(provider.sendBatch).mockRejectedValue(
      new Error("FCM unavailable"),
    );

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await expect(
      notifier.notifyAlertStarted("alert-1"),
    ).resolves.toBeUndefined();

    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockValues.mock.calls[0]?.[0]).toMatchObject({
      success: false,
      errorCode: "BATCH_EXCEPTION",
    });
  });

  it("records per-token success and failure from sendBatch results", async () => {
    vi.mocked(getAlertById).mockResolvedValue(ACTIVE_ALERT);

    const mockValues = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeSelectChain([
          { contactUserId: "c1" },
          { contactUserId: "c2" },
        ]) as unknown as ReturnType<typeof db.select>,
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { userId: "c1", token: "tok1" },
          { userId: "c2", token: "tok2" },
        ]) as unknown as ReturnType<typeof db.select>,
      );
    vi.mocked(db.insert).mockReturnValue(
      makeInsertChain(mockValues) as unknown as ReturnType<typeof db.insert>,
    );
    vi.mocked(provider.sendBatch).mockResolvedValue([
      { token: "tok1", ok: true, messageId: "m1" },
      { token: "tok2", ok: false, errorCode: "INVALID_REGISTRATION_TOKEN" },
    ]);

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await notifier.notifyAlertStarted("alert-1");

    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(mockValues.mock.calls[0]?.[0]).toMatchObject({
      success: true,
      providerMessageId: "m1",
    });
    expect(mockValues.mock.calls[1]?.[0]).toMatchObject({
      success: false,
      errorCode: "INVALID_REGISTRATION_TOKEN",
    });
  });

  it("skips silently when alert is not found", async () => {
    vi.mocked(getAlertById).mockResolvedValue(null);

    const notifier = createAlertContactsPushOrchestrator(mockLog, provider);
    await expect(
      notifier.notifyAlertStarted("nonexistent"),
    ).resolves.toBeUndefined();

    expect(provider.sendBatch).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

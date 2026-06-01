import { describe, expect, it } from "vitest";
import { isAlertDueForEscalation } from "./escalationRules.js";

describe("isAlertDueForEscalation", () => {
  const config = { firstNoAckMs: 300_000, repeatMs: 120_000 };

  it("returns false when alert has ACK", () => {
    const alert = {
      startedAt: new Date("2026-01-01T00:00:00Z"),
      lastEscalationAt: null,
    };
    expect(isAlertDueForEscalation(alert, Date.now(), true, config)).toBe(
      false,
    );
  });

  it("returns false before first window elapses", () => {
    const startedAt = new Date("2026-01-01T12:00:00Z");
    const nowMs = startedAt.getTime() + 60_000;
    expect(
      isAlertDueForEscalation(
        { startedAt, lastEscalationAt: null },
        nowMs,
        false,
        config,
      ),
    ).toBe(false);
  });

  it("returns true for first escalation after first window without ACK", () => {
    const startedAt = new Date("2026-01-01T12:00:00Z");
    const nowMs = startedAt.getTime() + config.firstNoAckMs + 1;
    expect(
      isAlertDueForEscalation(
        { startedAt, lastEscalationAt: null },
        nowMs,
        false,
        config,
      ),
    ).toBe(true);
  });

  it("returns false after first escalation until repeat window passes", () => {
    const startedAt = new Date("2026-01-01T12:00:00Z");
    const lastEsc = new Date(startedAt.getTime() + config.firstNoAckMs + 1);
    const tooSoon = lastEsc.getTime() + 30_000;
    expect(
      isAlertDueForEscalation(
        { startedAt, lastEscalationAt: lastEsc },
        tooSoon,
        false,
        config,
      ),
    ).toBe(false);
  });

  it("returns true for repeat escalation after repeat window", () => {
    const startedAt = new Date("2026-01-01T12:00:00Z");
    const lastEsc = new Date(startedAt.getTime() + config.firstNoAckMs + 1);
    const nowMs = lastEsc.getTime() + config.repeatMs + 1;
    expect(
      isAlertDueForEscalation(
        { startedAt, lastEscalationAt: lastEsc },
        nowMs,
        false,
        config,
      ),
    ).toBe(true);
  });
});

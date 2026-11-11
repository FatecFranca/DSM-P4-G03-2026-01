import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTDOWN,
  PENDING_MAX_AGE_MS,
  describeTriggerResult,
  isStale,
  normalizeCapabilities,
  normalizeCountdown,
  normalizeSettings,
  parseTriggerResult,
  shouldOpenActiveAlert,
  siriPhrases,
} from "./quickSos";

describe("normalizeSettings", () => {
  it("aplica padrões seguros para dados ausentes", () => {
    expect(normalizeSettings(null)).toEqual({
      powerButtonEnabled: false,
      countdownSeconds: DEFAULT_COUNTDOWN,
      testMode: false,
      serviceRunning: false,
    });
  });

  it("mantém valores válidos e rejeita contagem fora da lista", () => {
    expect(
      normalizeSettings({
        powerButtonEnabled: true,
        countdownSeconds: 0,
        testMode: true,
        serviceRunning: true,
      }),
    ).toEqual({
      powerButtonEnabled: true,
      countdownSeconds: 0,
      testMode: true,
      serviceRunning: true,
    });
    expect(normalizeCountdown(7)).toBe(DEFAULT_COUNTDOWN);
    expect(normalizeCountdown("5")).toBe(DEFAULT_COUNTDOWN);
    expect(normalizeCountdown(10)).toBe(10);
  });

  it("só aceita booleanos verdadeiros", () => {
    expect(
      normalizeSettings({ powerButtonEnabled: "true" }).powerButtonEnabled,
    ).toBe(false);
  });
});

describe("normalizeCapabilities", () => {
  it("assume nada suportado quando o módulo não responde", () => {
    expect(normalizeCapabilities(undefined)).toEqual({
      powerButton: false,
      quickTile: false,
      addTilePrompt: false,
      appIntents: false,
    });
  });
});

describe("parseTriggerResult", () => {
  it("lê o payload nativo", () => {
    expect(
      parseTriggerResult({
        status: "sent",
        source: "power_button",
        alertId: "a1",
        at: 1000,
        message: null,
      }),
    ).toEqual({
      status: "sent",
      source: "power_button",
      alertId: "a1",
      at: 1000,
      message: null,
    });
  });

  it("rejeita status desconhecido e normaliza origem desconhecida", () => {
    expect(parseTriggerResult({ status: "boom" })).toBeNull();
    expect(parseTriggerResult("x")).toBeNull();
    const r = parseTriggerResult({ status: "failed", source: "??", at: 5 });
    expect(r?.source).toBe("unknown");
    expect(r?.alertId).toBeNull();
  });
});

describe("regras de navegação", () => {
  const base = {
    source: "quick_tile" as const,
    at: 0,
    message: null,
  };

  it("abre o alerta só quando há id e o envio deu certo", () => {
    expect(
      shouldOpenActiveAlert({ ...base, status: "sent", alertId: "a" }),
    ).toBe(true);
    expect(
      shouldOpenActiveAlert({
        ...base,
        status: "already_active",
        alertId: "a",
      }),
    ).toBe(true);
    expect(
      shouldOpenActiveAlert({
        ...base,
        status: "already_active",
        alertId: null,
      }),
    ).toBe(false);
    expect(
      shouldOpenActiveAlert({ ...base, status: "test", alertId: null }),
    ).toBe(false);
  });

  it("descarta pendentes antigos", () => {
    const r = { ...base, status: "sent" as const, alertId: "a", at: 1_000 };
    expect(isStale(r, 1_000 + PENDING_MAX_AGE_MS + 1)).toBe(true);
    expect(isStale(r, 2_000)).toBe(false);
  });
});

describe("textos", () => {
  it("explica a falha com o motivo", () => {
    const d = describeTriggerResult({
      status: "failed",
      source: "power_button",
      alertId: null,
      at: 0,
      message: "Sem conexão com o servidor",
    });
    expect(d.message).toContain("botão liga/desliga");
    expect(d.message).toContain("Sem conexão");
  });

  it("frases da Siri usam o nome do app", () => {
    expect(siriPhrases("ProtectHer")[0]).toBe("Pedir ajuda no ProtectHer");
  });
});

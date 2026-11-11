import { describe, expect, it } from "vitest";
import {
  AUDIO_CLOCK_SKEW_MS,
  AUDIO_LATE_UPLOAD_WINDOW_MS,
  decideAudioUpload,
  decodeAudioBase64,
  looksLikeMp4Audio,
  parseByteRange,
} from "./alertAudio.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const STARTED = Date.parse("2026-11-11T12:00:00.000Z");

function activeAlert() {
  return {
    ownerUserId: OWNER,
    status: "active" as const,
    startedAt: new Date(STARTED),
    endedAt: null,
  };
}

function closedAlert(endedMs: number) {
  return {
    ownerUserId: OWNER,
    status: "closed" as const,
    startedAt: new Date(STARTED),
    endedAt: new Date(endedMs),
  };
}

/** Cabeçalho mínimo de um M4A: tamanho da caixa + "ftyp" + marca "M4A ". */
function fakeM4a(extraBytes = 32): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 0x1c]),
    Buffer.from("ftypM4A ", "latin1"),
    Buffer.alloc(extraBytes),
  ]);
}

describe("decideAudioUpload", () => {
  it("aceita trecho da dona durante o alerta ativo", () => {
    const now = STARTED + 60_000;
    expect(decideAudioUpload(OWNER, activeAlert(), now - 15_000, now)).toEqual({
      ok: true,
    });
  });

  it("esconde o alerta de quem não é a dona (404)", () => {
    const now = STARTED + 60_000;
    const res = decideAudioUpload(OTHER, activeAlert(), now, now);
    expect(res).toMatchObject({ ok: false, status: 404, reason: "not_owner" });
  });

  it("rejeita trecho gravado antes do início do alerta", () => {
    const now = STARTED + 60_000;
    const res = decideAudioUpload(
      OWNER,
      activeAlert(),
      STARTED - AUDIO_CLOCK_SKEW_MS - 1,
      now,
    );
    expect(res).toMatchObject({ ok: false, reason: "before_alert_start" });
  });

  it("rejeita trecho com horário no futuro além da tolerância", () => {
    const now = STARTED + 60_000;
    const res = decideAudioUpload(
      OWNER,
      activeAlert(),
      now + AUDIO_CLOCK_SKEW_MS + 1,
      now,
    );
    expect(res).toMatchObject({ ok: false, reason: "captured_in_future" });
  });

  it("aceita trecho da fila offline gravado antes do encerramento", () => {
    const ended = STARTED + 10 * 60_000;
    const now = ended + 30 * 60_000;
    const res = decideAudioUpload(
      OWNER,
      closedAlert(ended),
      ended - 15_000,
      now,
    );
    expect(res).toEqual({ ok: true });
  });

  it("rejeita trecho gravado depois do encerramento", () => {
    const ended = STARTED + 10 * 60_000;
    const res = decideAudioUpload(
      OWNER,
      closedAlert(ended),
      ended + AUDIO_CLOCK_SKEW_MS + 1,
      ended + AUDIO_CLOCK_SKEW_MS + 2,
    );
    expect(res).toMatchObject({
      ok: false,
      status: 409,
      reason: "captured_after_end",
    });
  });

  it("rejeita envio atrasado depois da janela de tolerância", () => {
    const ended = STARTED + 10 * 60_000;
    const res = decideAudioUpload(
      OWNER,
      closedAlert(ended),
      ended - 15_000,
      ended + AUDIO_LATE_UPLOAD_WINDOW_MS + 1,
    );
    expect(res).toMatchObject({
      ok: false,
      reason: "late_upload_window_expired",
    });
  });
});

describe("decodeAudioBase64 / looksLikeMp4Audio", () => {
  it("decodifica e reconhece um M4A", () => {
    const buf = decodeAudioBase64(fakeM4a().toString("base64"));
    expect(buf).not.toBeNull();
    expect(looksLikeMp4Audio(buf as Buffer)).toBe(true);
  });

  it("não reconhece arquivo que não é MP4", () => {
    const notMp4 = Buffer.from("#!AMR\n0123456789abcdef", "latin1");
    expect(looksLikeMp4Audio(notMp4)).toBe(false);
  });

  it("rejeita arquivo acima do limite", () => {
    const huge = Buffer.alloc(1_500_001).toString("base64");
    expect(decodeAudioBase64(huge)).toBeNull();
  });
});

describe("parseByteRange", () => {
  it("sem cabeçalho devolve null (arquivo inteiro)", () => {
    expect(parseByteRange(undefined, 100)).toBeNull();
  });

  it("interpreta intervalo fechado e aberto", () => {
    expect(parseByteRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseByteRange("bytes=90-500", 100)).toEqual({
      start: 90,
      end: 99,
    });
  });

  it("interpreta sufixo (últimos N bytes)", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("marca intervalo impossível", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=5-2", 100)).toBe("unsatisfiable");
  });

  it("ignora formatos não suportados", () => {
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
  });
});

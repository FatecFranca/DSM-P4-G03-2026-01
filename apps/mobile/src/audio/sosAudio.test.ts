import { describe, expect, it } from "vitest";
import {
  INITIAL_SOS_AUDIO_STATE,
  MIC_EXPLANATION_SNOOZE_MS,
  type QueuedAudioChunk,
  SOS_AUDIO_CHUNK_MS,
  classifyUploadStatus,
  describeSosAudioStatus,
  enqueueChunk,
  formatChunkLabel,
  makeClientChunkId,
  nextLiveChunkId,
  recorderRestartDelayMs,
  retryDelayMs,
  shouldShowMicExplanation,
} from "./sosAudio";

function chunk(id: string, capturedAt: string): QueuedAudioChunk {
  return {
    alertId: "alert-1",
    clientChunkId: id,
    capturedAt,
    durationMs: 15_000,
    mimeType: "audio/mp4",
    fileUri: `file:///docs/sos-audio/${id}.m4a`,
    attempts: 0,
  };
}

describe("SOS_AUDIO_CHUNK_MS", () => {
  it("envia um trecho a cada 15 segundos", () => {
    expect(SOS_AUDIO_CHUNK_MS).toBe(15_000);
  });
});

describe("makeClientChunkId", () => {
  it("gera ids aceitos pela API e diferentes para o mesmo instante", () => {
    const a = makeClientChunkId(1_700_000_000_000, () => 0.1);
    const b = makeClientChunkId(1_700_000_000_000, () => 0.2);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("enqueueChunk", () => {
  it("ordena por horário de gravação e não duplica", () => {
    const first = enqueueChunk([], chunk("b", "2026-11-11T12:00:15.000Z"));
    const second = enqueueChunk(
      first.queue,
      chunk("a", "2026-11-11T12:00:00.000Z"),
    );
    const again = enqueueChunk(
      second.queue,
      chunk("a", "2026-11-11T12:00:00.000Z"),
    );
    expect(second.queue.map((c) => c.clientChunkId)).toEqual(["a", "b"]);
    expect(again.queue).toHaveLength(2);
    expect(again.dropped).toEqual([]);
  });

  it("descarta os mais antigos acima do limite e devolve quais foram", () => {
    let queue: QueuedAudioChunk[] = [];
    for (let i = 0; i < 3; i++) {
      queue = enqueueChunk(
        queue,
        chunk(`c${i}`, `2026-11-11T12:00:0${i}.000Z`),
        3,
      ).queue;
    }
    const res = enqueueChunk(queue, chunk("c3", "2026-11-11T12:00:03.000Z"), 3);
    expect(res.queue.map((c) => c.clientChunkId)).toEqual(["c1", "c2", "c3"]);
    expect(res.dropped.map((c) => c.clientChunkId)).toEqual(["c0"]);
  });
});

describe("classifyUploadStatus", () => {
  it("considera enviado 200 (reenvio) e 201", () => {
    expect(classifyUploadStatus(200)).toBe("sent");
    expect(classifyUploadStatus(201)).toBe("sent");
  });

  it("tenta de novo sem rede, sessão expirada, limite e erro do servidor", () => {
    for (const status of [0, 401, 408, 429, 500, 503]) {
      expect(classifyUploadStatus(status)).toBe("retry");
    }
  });

  it("descarta o que o servidor nunca vai aceitar", () => {
    for (const status of [400, 403, 404, 409, 413]) {
      expect(classifyUploadStatus(status)).toBe("drop");
    }
  });
});

describe("esperas", () => {
  it("reenvio cresce e para em 2 min", () => {
    expect(retryDelayMs(0)).toBe(5_000);
    expect(retryDelayMs(1)).toBe(10_000);
    expect(retryDelayMs(50)).toBe(120_000);
  });

  it("religar o microfone cresce e para em 30 s", () => {
    expect(recorderRestartDelayMs(0)).toBe(2_000);
    expect(recorderRestartDelayMs(2)).toBe(8_000);
    expect(recorderRestartDelayMs(99)).toBe(30_000);
  });
});

describe("shouldShowMicExplanation", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");
  const askable = { granted: false, canAskAgain: true };

  it("mostra na primeira vez", () => {
    expect(shouldShowMicExplanation(askable, null, now)).toBe(true);
  });

  it("não mostra com permissão já concedida", () => {
    expect(
      shouldShowMicExplanation({ granted: true, canAskAgain: true }, null, now),
    ).toBe(false);
  });

  it("não insiste quando o sistema não deixa mais pedir", () => {
    expect(
      shouldShowMicExplanation(
        { granted: false, canAskAgain: false },
        null,
        now,
      ),
    ).toBe(false);
  });

  it("respeita o 'Agora não' por 7 dias", () => {
    expect(shouldShowMicExplanation(askable, now - 1000, now)).toBe(false);
    expect(
      shouldShowMicExplanation(askable, now - MIC_EXPLANATION_SNOOZE_MS, now),
    ).toBe(true);
  });
});

describe("describeSosAudioStatus", () => {
  it("explica a gravação e os trechos pendentes", () => {
    const text = describeSosAudioStatus({
      ...INITIAL_SOS_AUDIO_STATE,
      status: "recording",
      pendingUploads: 2,
    });
    expect(text.tone).toBe("ok");
    expect(text.detail).toContain("a cada 15 s");
    expect(text.detail).toContain("2 trechos aguardam conexão");
  });

  it("avisa quando só grava com o app aberto", () => {
    const text = describeSosAudioStatus({
      ...INITIAL_SOS_AUDIO_STATE,
      status: "recording",
      foregroundOnly: true,
    });
    expect(text.detail).toContain("Mantenha o app aberto");
  });

  it("pede permissão e orienta a abrir o app", () => {
    expect(
      describeSosAudioStatus({
        ...INITIAL_SOS_AUDIO_STATE,
        status: "needs_permission",
      }).tone,
    ).toBe("warning");
    expect(
      describeSosAudioStatus({
        ...INITIAL_SOS_AUDIO_STATE,
        status: "waiting_foreground",
      }).title,
    ).toBe("Abra o app para gravar");
  });
});

describe("formatChunkLabel", () => {
  it("mostra hora e duração arredondada", () => {
    const iso = new Date(2026, 10, 11, 14, 32, 5).toISOString();
    expect(formatChunkLabel(iso, 14_600)).toBe("14:32:05 · 15 s");
  });
});

describe("nextLiveChunkId", () => {
  const chunks = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("começa pelo mais recente", () => {
    expect(nextLiveChunkId(chunks, null)).toBe("c");
  });

  it("segue para o próximo depois do último tocado", () => {
    expect(nextLiveChunkId(chunks, "a")).toBe("b");
  });

  it("espera quando já tocou o último", () => {
    expect(nextLiveChunkId(chunks, "c")).toBeNull();
  });

  it("sem trechos não toca nada", () => {
    expect(nextLiveChunkId([], null)).toBeNull();
  });
});

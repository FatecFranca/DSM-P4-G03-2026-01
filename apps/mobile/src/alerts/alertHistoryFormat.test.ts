import { describe, expect, it } from "vitest";
import {
  audioSummaryLabel,
  dayLabel,
  durationLabel,
  groupByDay,
  timeRangeLabel,
} from "./alertHistoryFormat";

// Quinta-feira, 12 nov. 2026, 15:00 (horário local).
const now = new Date(2026, 10, 12, 15, 0, 0);
const at = (d: number, h: number, m = 0, month = 10, y = 2026) =>
  new Date(y, month, d, h, m).toISOString();

describe("dayLabel", () => {
  it("hoje, ontem, dia da semana e datas antigas", () => {
    expect(dayLabel(at(12, 9), now)).toBe("Hoje");
    expect(dayLabel(at(11, 23), now)).toBe("Ontem");
    expect(dayLabel(at(10, 8), now)).toBe("ter., 10 de nov.");
    expect(dayLabel(at(1, 8), now)).toBe("1 de nov.");
    expect(dayLabel(at(3, 8, 0, 4, 2025), now)).toBe("3 de mai. de 2025");
  });
});

describe("durationLabel", () => {
  it("minutos e horas", () => {
    expect(durationLabel(20_000)).toBe("menos de 1 min");
    expect(durationLabel(7 * 60_000)).toBe("7 min");
    expect(durationLabel(65 * 60_000)).toBe("1 h 05 min");
  });
});

describe("timeRangeLabel", () => {
  it("encerrado mostra início, fim e duração", () => {
    expect(timeRangeLabel(at(12, 9, 5), at(12, 9, 12), now)).toBe(
      "09:05 – 09:12 · 7 min",
    );
  });
  it("ativo mostra desde quando", () => {
    expect(timeRangeLabel(at(12, 14, 30), null, now)).toBe(
      "Desde 14:30 · 30 min",
    );
  });
});

describe("audioSummaryLabel", () => {
  it("resume os áudios", () => {
    expect(audioSummaryLabel(0, 0)).toBe("Nenhum áudio");
    expect(audioSummaryLabel(1, 15_000)).toBe("1 áudio · 15 s");
    expect(audioSummaryLabel(30, 450_000)).toBe("30 áudios · 7 min");
  });
});

describe("groupByDay", () => {
  it("agrupa itens consecutivos do mesmo dia", () => {
    const items = [at(12, 10), at(12, 8), at(11, 22), at(10, 7)];
    const sections = groupByDay(items, (i) => i, now);
    expect(sections.map((s) => [s.title, s.data.length])).toEqual([
      ["Hoje", 2],
      ["Ontem", 1],
      ["ter., 10 de nov.", 1],
    ]);
  });
});

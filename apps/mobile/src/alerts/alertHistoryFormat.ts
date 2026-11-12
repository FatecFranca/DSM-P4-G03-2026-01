/**
 * Formatação do histórico de alertas (pt-BR). Funções puras para teste.
 */

const WEEKDAYS = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const MONTHS = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Hoje", "Ontem", "seg., 10 de nov." ou "10 de nov. de 2025". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) {
    return "Hoje";
  }
  if (diffDays === 1) {
    return "Ontem";
  }
  const base = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  if (d.getFullYear() !== now.getFullYear()) {
    return `${base} de ${d.getFullYear()}`;
  }
  return diffDays > 1 && diffDays < 7
    ? `${WEEKDAYS[d.getDay()]}, ${base}`
    : base;
}

function clock(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3 min", "1 h 05 min", "menos de 1 min". */
export function durationLabel(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) {
    return "menos de 1 min";
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

/** "23:05 – 23:12 · 7 min" (encerrado) ou "Desde 23:05 · 7 min" (ativo). */
export function timeRangeLabel(
  startedAt: string,
  endedAt: string | null,
  now: Date = new Date(),
): string {
  const start = new Date(startedAt);
  if (!endedAt) {
    return `Desde ${clock(start)} · ${durationLabel(now.getTime() - start.getTime())}`;
  }
  const end = new Date(endedAt);
  return `${clock(start)} – ${clock(end)} · ${durationLabel(end.getTime() - start.getTime())}`;
}

/** "Nenhum áudio", "1 trecho · 15 s", "30 trechos · 7 min". */
export function audioSummaryLabel(chunks: number, totalMs: number): string {
  if (chunks === 0) {
    return "Nenhum áudio";
  }
  const length =
    totalMs < 60_000
      ? `${Math.max(1, Math.round(totalMs / 1000))} s`
      : durationLabel(totalMs);
  return `${chunks} ${chunks === 1 ? "trecho" : "trechos"} · ${length}`;
}

export type DaySection<T> = { title: string; key: string; data: T[] };

/** Agrupa por dia (itens já do mais recente para o mais antigo). */
export function groupByDay<T>(
  items: readonly T[],
  getIso: (item: T) => string,
  now: Date = new Date(),
): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const item of items) {
    const d = new Date(getIso(item));
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(item);
    } else {
      sections.push({ key, title: dayLabel(getIso(item), now), data: [item] });
    }
  }
  return sections;
}

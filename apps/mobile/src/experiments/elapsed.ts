/**
 * Diferença entre dois instantes em ms, nunca negativa.
 * Protege a métrica de tempo-até-ação contra ajustes de relógio do dispositivo.
 */
export function elapsedMs(startedAtMs: number, nowMs: number): number {
  const delta = nowMs - startedAtMs;
  return delta > 0 ? delta : 0;
}

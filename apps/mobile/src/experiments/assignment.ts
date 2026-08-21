import type { Experiment } from "./types";

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const BUCKET_RESOLUTION = 10000;

/**
 * FNV-1a: hash determinístico, estável entre execuções e sem dependência nativa
 * (`crypto` não existe no runtime do React Native).
 */
function hash(value: string): number {
  let result = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, FNV_PRIME);
  }

  return result >>> 0;
}

/**
 * Escolhe a variante do usuário para um experimento.
 *
 * A chave do experimento entra no hash junto do usuário, então a atribuição de um
 * experimento não contamina a dos demais. Usuários sem identificação ficam no
 * controle: sem id estável não há como manter a variante entre sessões, e uma
 * escolha instável poluiria a métrica.
 */
export function assignVariant(
  experiment: Experiment,
  userId: string | undefined,
): string {
  if (!userId) {
    return experiment.controlVariantId;
  }

  const totalWeight = experiment.variants.reduce(
    (total, variant) => total + variant.weight,
    0,
  );

  if (totalWeight <= 0) {
    return experiment.controlVariantId;
  }

  const bucket = hash(`${experiment.key}:${userId}`) % BUCKET_RESOLUTION;
  const threshold = (bucket / BUCKET_RESOLUTION) * totalWeight;

  let cumulativeWeight = 0;

  for (const variant of experiment.variants) {
    cumulativeWeight += variant.weight;

    if (threshold < cumulativeWeight) {
      return variant.id;
    }
  }

  return experiment.controlVariantId;
}

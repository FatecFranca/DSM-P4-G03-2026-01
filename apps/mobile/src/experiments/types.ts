export type ExperimentVariant = {
  readonly id: string;
  /** Peso relativo ao total do experimento: 1 e 9 => 10% e 90%. */
  readonly weight: number;
};

export type Experiment = {
  /** Identifica o experimento no bucket e na telemetria. */
  readonly key: string;
  readonly controlVariantId: string;
  readonly variants: readonly ExperimentVariant[];
};

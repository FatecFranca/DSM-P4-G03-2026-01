import { describe, expect, it } from "vitest";
import { assignVariant } from "./assignment";
import type { Experiment } from "./types";

const twoWayExperiment: Experiment = {
  key: "sos_button_layout",
  controlVariantId: "control",
  variants: [
    { id: "control", weight: 1 },
    { id: "large_button", weight: 1 },
  ],
};

const weightedExperiment: Experiment = {
  key: "onboarding_flow",
  controlVariantId: "control",
  variants: [
    { id: "control", weight: 9 },
    { id: "treatment", weight: 1 },
  ],
};

function makeUserIds(total: number): string[] {
  return Array.from({ length: total }, (_, index) => `user-${index}`);
}

describe("assignVariant", () => {
  it("sempre devolve uma variante declarada no experimento", () => {
    const validIds = twoWayExperiment.variants.map((variant) => variant.id);

    for (const userId of makeUserIds(50)) {
      expect(validIds).toContain(assignVariant(twoWayExperiment, userId));
    }
  });

  it("é determinístico: o mesmo usuário cai sempre na mesma variante", () => {
    const first = assignVariant(twoWayExperiment, "user-42");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(assignVariant(twoWayExperiment, "user-42")).toBe(first);
    }
  });

  it("atribui de forma independente por experimento", () => {
    const userIds = makeUserIds(200);

    const divergent = userIds.filter(
      (userId) =>
        assignVariant(twoWayExperiment, userId) !==
        assignVariant(
          { ...weightedExperiment, variants: twoWayExperiment.variants },
          userId,
        ),
    );

    /* Chaves diferentes precisam gerar buckets diferentes para parte dos usuários,
       senão um mesmo usuário ficaria preso ao mesmo lado em todos os experimentos. */
    expect(divergent.length).toBeGreaterThan(0);
  });

  it("distribui aproximadamente 50/50 quando os pesos são iguais", () => {
    const userIds = makeUserIds(1000);

    const treatmentCount = userIds.filter(
      (userId) => assignVariant(twoWayExperiment, userId) === "large_button",
    ).length;

    expect(treatmentCount).toBeGreaterThan(400);
    expect(treatmentCount).toBeLessThan(600);
  });

  it("respeita pesos desiguais", () => {
    const userIds = makeUserIds(1000);

    const treatmentCount = userIds.filter(
      (userId) => assignVariant(weightedExperiment, userId) === "treatment",
    ).length;

    /* Peso 1 em 10 => ~10% dos usuários. */
    expect(treatmentCount).toBeGreaterThan(50);
    expect(treatmentCount).toBeLessThan(150);
  });

  it("cai no controle quando não há usuário identificado", () => {
    expect(assignVariant(twoWayExperiment, "")).toBe("control");
    expect(assignVariant(twoWayExperiment, undefined)).toBe("control");
  });

  it("devolve a única variante quando o experimento não tem alternativa", () => {
    const singleVariant: Experiment = {
      key: "single",
      controlVariantId: "control",
      variants: [{ id: "control", weight: 1 }],
    };

    expect(assignVariant(singleVariant, "user-1")).toBe("control");
  });
});

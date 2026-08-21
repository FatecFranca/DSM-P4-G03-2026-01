import { describe, expect, it } from "vitest";
import { resolveSosButtonPresentation } from "./sosButtonPresentation";

describe("resolveSosButtonPresentation", () => {
  it("mantém o tamanho atual do botão para o controle", () => {
    expect(resolveSosButtonPresentation("control")).toEqual({
      minHeight: 44,
      fontSize: 16,
    });
  });

  it("aumenta o botão para a variante large_button", () => {
    const presentation = resolveSosButtonPresentation("large_button");

    expect(presentation.minHeight).toBeGreaterThan(44);
    expect(presentation.fontSize).toBeGreaterThan(16);
  });

  it("cai no tamanho do controle para uma variante desconhecida", () => {
    expect(resolveSosButtonPresentation("nunca-existiu")).toEqual({
      minHeight: 44,
      fontSize: 16,
    });
  });
});

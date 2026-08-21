import { describe, expect, it } from "vitest";
import { resolveSosCircleScale } from "./sosCircleScale";

describe("resolveSosCircleScale", () => {
  it("mantém o tamanho atual do círculo para o controle", () => {
    expect(resolveSosCircleScale("control")).toBe(1);
  });

  it("aumenta o círculo para a variante large_button", () => {
    expect(resolveSosCircleScale("large_button")).toBeGreaterThan(1);
  });

  it("cai na escala do controle para uma variante desconhecida", () => {
    expect(resolveSosCircleScale("nunca-existiu")).toBe(1);
  });
});

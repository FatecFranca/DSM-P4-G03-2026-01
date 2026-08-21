import { describe, expect, it } from "vitest";
import { elapsedMs } from "./elapsed";

describe("elapsedMs", () => {
  it("calcula a diferença entre dois instantes", () => {
    expect(elapsedMs(1000, 4500)).toBe(3500);
  });

  it("devolve zero quando os instantes são iguais", () => {
    expect(elapsedMs(1000, 1000)).toBe(0);
  });

  it("nunca devolve negativo, mesmo com relógio do dispositivo andando para trás", () => {
    expect(elapsedMs(5000, 1000)).toBe(0);
  });
});

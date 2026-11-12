import { LoginRequestSchema } from "@protecther/contracts";
import { describe, expect, it } from "vitest";
import { formatApiError, formatValidationError } from "./apiError";

describe("formatApiError", () => {
  it("uses the API's nested error message", () => {
    expect(
      formatApiError({ error: { message: "Credenciais inválidas" } }),
    ).toBe("Credenciais inválidas");
  });

  it("uses gateway messages returned at the top level", () => {
    expect(formatApiError({ message: "Application not found" })).toBe(
      "Application not found",
    );
  });

  it("falls back for malformed responses and bounds displayed text", () => {
    expect(formatApiError({ error: "unexpected" })).toBe("Falha na requisição");
    expect(formatApiError({ message: " x ".repeat(150) })).toHaveLength(240);
  });
});

describe("formatValidationError", () => {
  it("returns a short message instead of raw zod JSON", () => {
    const result = LoginRequestSchema.safeParse({
      email: "a@b.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationError(result.error)).toBe("Informe a senha.");
    }
  });
});

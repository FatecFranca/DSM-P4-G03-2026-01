import { describe, expect, it } from "vitest";
import {
  DEFAULT_ICON_KEY,
  DISCREET_ICONS,
  SECRET_CODE_DIAL,
  fromNativeIconName,
  isDiscreetIconKey,
  toNativeIconName,
} from "./discreetIcons";
import catalog from "./discreetIcons.json";

describe("catálogo de ícones discretos", () => {
  it("o padrão existe no catálogo e as chaves são únicas e seguras para recursos Android", () => {
    const keys = DISCREET_ICONS.map((i) => i.key);
    expect(keys).toContain(DEFAULT_ICON_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9]*$/);
    }
  });

  it("o padrão é o ícone original; só os disfarces têm nomes que não entregam o app", () => {
    expect(DEFAULT_ICON_KEY).toBe("original");
    const forbidden = /protec|prote[çc][ãa]o|sos|emerg|safe|alert|seguran/i;
    for (const icon of catalog.icons) {
      if (icon.key === DEFAULT_ICON_KEY) {
        continue;
      }
      expect(icon.label).not.toMatch(forbidden);
    }
  });

  it("iOS restaura o ícone principal (null) para o padrão", () => {
    expect(toNativeIconName(DEFAULT_ICON_KEY, "ios")).toBeNull();
    expect(toNativeIconName("calculator", "ios")).toBe("calculator");
  });

  it("Android sempre usa a chave (o padrão também é um alias)", () => {
    expect(toNativeIconName(DEFAULT_ICON_KEY, "android")).toBe(
      DEFAULT_ICON_KEY,
    );
    expect(toNativeIconName("clock", "android")).toBe("clock");
  });

  it("o código secreto é numérico e é exibido no formato de discador", () => {
    expect(catalog.secretCode).toMatch(/^\d{4,}$/);
    expect(SECRET_CODE_DIAL).toBe(`*#*#${catalog.secretCode}#*#*`);
  });

  it("valores nativos desconhecidos caem no padrão", () => {
    expect(fromNativeIconName(null)).toBe(DEFAULT_ICON_KEY);
    expect(fromNativeIconName(undefined)).toBe(DEFAULT_ICON_KEY);
    expect(fromNativeIconName("original")).toBe(DEFAULT_ICON_KEY);
    expect(fromNativeIconName("weather")).toBe("weather");
    expect(isDiscreetIconKey("cycle")).toBe(true);
    expect(isDiscreetIconKey("shield")).toBe(false);
  });
});

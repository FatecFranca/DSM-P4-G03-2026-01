import { Platform, type TextStyle } from "react-native";

// Tipografia sistema — usa fonte do sistema operacional
const fontFamily = Platform.select({
  ios: "System",
  android: "Roboto",
  default: "System",
});

export const Typography = {
  hero: {
    fontFamily,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
    letterSpacing: -0.5,
  } satisfies TextStyle,

  h1: {
    fontFamily,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    letterSpacing: -0.3,
  } satisfies TextStyle,

  h2: {
    fontFamily,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  } satisfies TextStyle,

  h3: {
    fontFamily,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  } satisfies TextStyle,

  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 22,
  } satisfies TextStyle,

  bodyBold: {
    fontFamily,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  } satisfies TextStyle,

  caption: {
    fontFamily,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 18,
  } satisfies TextStyle,

  captionBold: {
    fontFamily,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  } satisfies TextStyle,

  small: {
    fontFamily,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  } satisfies TextStyle,

  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    letterSpacing: 0.5,
  } satisfies TextStyle,

  buttonSmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    letterSpacing: 0.3,
  } satisfies TextStyle,
} as const;

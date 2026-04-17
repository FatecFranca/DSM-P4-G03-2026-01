/**
 * ProtectHer — Design Token: Colors
 *
 * Paleta escura com tons de roxo/navy e acento coral/vermelho para emergência.
 * Glassmorphism e gradientes vibrantes.
 */
export const Colors = {
  // Backgrounds
  bgPrimary: "#0A0E27",
  bgSecondary: "#111640",
  bgCard: "rgba(255,255,255,0.06)",
  bgCardHover: "rgba(255,255,255,0.10)",
  bgGlass: "rgba(255,255,255,0.08)",

  // Gradients (start → end)
  gradientPurple: ["#4A1A8A", "#1B0F3B"] as const,
  gradientAurora: ["#6C3CE2", "#3D1D93", "#0A0E27"] as const,
  gradientDanger: ["#FF4757", "#C0392B"] as const,
  gradientSafe: ["#2ECC71", "#27AE60"] as const,

  // Primary & accents
  primary: "#6C3CE2",
  primaryLight: "#8B5CF6",
  primaryDark: "#4A1A8A",

  // Emergency / SOS
  danger: "#FF4757",
  dangerDark: "#C0392B",
  dangerGlow: "rgba(255,71,87,0.3)",

  // Safe / success
  safe: "#2ECC71",
  safeDark: "#27AE60",
  safeGlow: "rgba(46,204,113,0.3)",

  // Warning
  warning: "#F39C12",
  warningDark: "#E67E22",

  // Text
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.4)",
  textDanger: "#FF6B7A",

  // Borders
  border: "rgba(255,255,255,0.10)",
  borderActive: "rgba(108,60,226,0.5)",
  borderDanger: "rgba(255,71,87,0.4)",

  // Misc
  overlay: "rgba(0,0,0,0.5)",
  white: "#FFFFFF",
  black: "#000000",
} as const;

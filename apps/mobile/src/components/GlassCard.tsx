import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../theme";
import { GlassSurface } from "./GlassSurface";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "danger" | "safe" | "success";
};

export function GlassCard({ children, style, variant = "default" }: Props) {
  const borderColor =
    variant === "danger"
      ? Colors.borderDanger
      : variant === "safe"
        ? "rgba(46,204,113,0.3)"
        : variant === "success"
          ? "rgba(46,213,115,0.4)"
          : Colors.border;

  return (
    <GlassSurface style={[styles.card, { borderColor }, Shadow.sm, style]}>
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
});

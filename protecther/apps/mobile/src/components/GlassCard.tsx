import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../theme";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  variant?: "default" | "danger" | "safe";
};

export function GlassCard({ children, style, variant = "default" }: Props) {
  const borderColor =
    variant === "danger"
      ? Colors.borderDanger
      : variant === "safe"
        ? "rgba(46,204,113,0.3)"
        : Colors.border;

  return (
    <View style={[styles.card, { borderColor }, Shadow.sm, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
});

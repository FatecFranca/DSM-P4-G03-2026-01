import { StyleSheet, Text, View } from "react-native";
import { Colors, Radius, Spacing, Typography } from "../theme";

type Props = {
  label: string;
  variant?: "danger" | "safe" | "warning" | "neutral";
};

const bgMap = {
  danger: "rgba(255,71,87,0.15)",
  safe: "rgba(46,204,113,0.15)",
  warning: "rgba(243,156,18,0.15)",
  neutral: "rgba(255,255,255,0.08)",
};

const textMap = {
  danger: Colors.textDanger,
  safe: Colors.safe,
  warning: Colors.warning,
  neutral: Colors.textSecondary,
};

export function Badge({ label, variant = "neutral" }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: bgMap[variant] }]}>
      <Text style={[styles.text, { color: textMap[variant] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
  },
  text: {
    ...Typography.small,
    fontWeight: "600",
  },
});

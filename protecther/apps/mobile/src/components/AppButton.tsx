import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";

type Variant = "primary" | "danger" | "safe" | "outline" | "ghost";

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  small?: boolean;
};

const bgMap: Record<Variant, string> = {
  primary: Colors.primary,
  danger: Colors.danger,
  safe: Colors.safe,
  outline: "transparent",
  ghost: "transparent",
};

const textMap: Record<Variant, string> = {
  primary: Colors.white,
  danger: Colors.white,
  safe: Colors.white,
  outline: Colors.primaryLight,
  ghost: Colors.textSecondary,
};

export function AppButton({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  small = false,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        {
          backgroundColor: bgMap[variant],
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor:
            variant === "outline" ? Colors.borderActive : "transparent",
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        },
        variant === "primary" && Shadow.glow(Colors.primary, 0.25),
        variant === "danger" && Shadow.glow(Colors.danger, 0.3),
        variant === "safe" && Shadow.glow(Colors.safe, 0.25),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textMap[variant]} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              small ? Typography.buttonSmall : Typography.button,
              { color: textMap[variant] },
              icon ? { marginLeft: Spacing.sm } : undefined,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 52,
  },
  small: {
    minHeight: 40,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
});

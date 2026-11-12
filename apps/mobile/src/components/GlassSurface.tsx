import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import {
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
};

/** Glass nativo no iOS 26+, com superfície translúcida consistente nos demais. */
export function GlassSurface({ children, style, interactive = false }: Props) {
  const surfaceStyle = [styles.surface, style];

  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={surfaceStyle}
      >
        {children}
      </GlassView>
    );
  }

  return <View style={[styles.fallback, surfaceStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    borderColor: "rgba(125,31,68,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  fallback: {
    backgroundColor: "rgba(255,255,255,0.58)",
  },
});

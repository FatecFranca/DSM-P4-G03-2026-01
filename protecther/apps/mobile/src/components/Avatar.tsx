import { Text, View, StyleSheet } from "react-native";
import { Colors, Typography, Spacing } from "../theme";

type Props = {
  size?: number;
  name: string;
  color?: string;
};

/** Avatar circular com inicial do nome */
export function Avatar({ size = 44, name, color }: Props) {
  const initial = name.charAt(0).toUpperCase();
  const bg = color ?? Colors.primary;

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text
        style={[
          Typography.bodyBold,
          { color: Colors.white, fontSize: size * 0.4 },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
});

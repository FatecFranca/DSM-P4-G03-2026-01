import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Italianno_400Regular } from "@expo-google-fonts/italianno";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { PushTokenSync } from "./src/devices/PushTokenSync";
import { ActiveAlertLocationSync } from "./src/location/activeAlertLocationSync";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  const [fontsLoaded] = useFonts({
    Italianno_400Regular,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ActiveAlertLocationSync />
        <PushTokenSync />
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

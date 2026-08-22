import { Italianno_400Regular } from "@expo-google-fonts/italianno";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { EspButtonBleProvider } from "./src/ble/EspButtonBleContext";
import { PushTokenSync } from "./src/devices/PushTokenSync";
import { EmergencyContactsSync } from "./src/emergency/EmergencyContactsSync";
import { LocationPermissionSync } from "./src/location/LocationPermissionSync";
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
        <EspButtonBleProvider>
          <LocationPermissionSync />
          <ActiveAlertLocationSync />
          <EmergencyContactsSync />
          <PushTokenSync />
          <RootNavigator />
          <StatusBar style="dark" />
        </EspButtonBleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

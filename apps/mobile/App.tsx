import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EspButtonBleProvider } from "./src/ble/EspButtonBleContext";
import { AuthProvider } from "./src/auth/AuthContext";
import { PushTokenSync } from "./src/devices/PushTokenSync";
import { ActiveAlertLocationSync } from "./src/location/activeAlertLocationSync";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EspButtonBleProvider>
          <ActiveAlertLocationSync />
          <PushTokenSync />
          <RootNavigator />
          <StatusBar style="light" />
        </EspButtonBleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { ActiveAlertScreen } from "../screens/ActiveAlertScreen";
import { ContactAlertDetailScreen } from "../screens/ContactAlertDetailScreen";
import { ContactAlertsFeedScreen } from "../screens/ContactAlertsFeedScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { DeviceManagementScreen } from "../screens/DeviceManagementScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { SosScreen } from "../screens/SosScreen";
import { Colors, Typography } from "../theme";
import type { AppStackParamList, AuthStackParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const DarkNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.bgPrimary,
    card: Colors.bgSecondary,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.primaryLight,
  },
};

const screenOptions = {
  headerStyle: {
    backgroundColor: Colors.bgPrimary,
  },
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  headerShadowVisible: false,
  contentStyle: {
    backgroundColor: Colors.bgPrimary,
  },
} as const;

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{ ...screenOptions, headerShown: false }}
    >
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: "Login" }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "Registrar" }}
      />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator
      screenOptions={{ ...screenOptions, headerShown: false }}
    >
      <AppStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Início" }}
      />
      <AppStack.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{ title: "Contatos" }}
      />
      <AppStack.Screen
        name="Sos"
        component={SosScreen}
        options={{ title: "SOS" }}
      />
      <AppStack.Screen
        name="ActiveAlert"
        component={ActiveAlertScreen}
        options={{ title: "Alerta ativo" }}
      />
      <AppStack.Screen
        name="ContactAlertsFeed"
        component={ContactAlertsFeedScreen}
        options={{ title: "Alertas" }}
      />
      <AppStack.Screen
        name="ContactAlertDetail"
        component={ContactAlertDetailScreen}
        options={{ title: "Localização" }}
      />
      <AppStack.Screen
        name="DeviceManagement"
        component={DeviceManagementScreen}
        options={{ title: "Dispositivos BLE" }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primaryLight} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkNavTheme}>
      {state.status === "authenticated" ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgPrimary,
  },
});

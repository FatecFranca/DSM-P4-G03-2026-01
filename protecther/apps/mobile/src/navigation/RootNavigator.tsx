import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { ActiveAlertScreen } from "../screens/ActiveAlertScreen";
import { ContactAlertDetailScreen } from "../screens/ContactAlertDetailScreen";
import { ContactAlertsFeedScreen } from "../screens/ContactAlertsFeedScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { SosScreen } from "../screens/SosScreen";
import type { AppStackParamList, AuthStackParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator>
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
    <AppStack.Navigator>
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
        options={{ title: "Alertas das titulares" }}
      />
      <AppStack.Screen
        name="ContactAlertDetail"
        component={ContactAlertDetailScreen}
        options={{ title: "Localização do alerta" }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {state.status === "authenticated" ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
});

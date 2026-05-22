import {
  type AuthSuccessResponse,
  AuthSuccessResponseSchema,
} from "@protecther/contracts";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "protecther.session";

export async function saveSession(session: AuthSuccessResponse): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function readSession(): Promise<AuthSuccessResponse | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const parsed = AuthSuccessResponseSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

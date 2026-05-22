import type { AuthSuccessResponse } from "@protecther/contracts";
import { AuthSuccessResponseSchema } from "@protecther/contracts";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clearSession, readSession, saveSession } from "./sessionStorage";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSuccessResponse };

type AuthContextValue = {
  state: AuthState;
  signIn: (session: AuthSuccessResponse) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await readSession();
      if (cancelled) {
        return;
      }
      if (!session) {
        setState({ status: "anonymous" });
        return;
      }
      setState({ status: "authenticated", session });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (session: AuthSuccessResponse) => {
    const parsed = AuthSuccessResponseSchema.parse(session);
    await saveSession(parsed);
    setState({ status: "authenticated", session: parsed });
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setState({ status: "anonymous" });
  }, []);

  const getAccessToken = useCallback((): string | null => {
    if (state.status !== "authenticated") {
      return null;
    }
    return state.session.accessToken;
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      signIn,
      signOut,
      getAccessToken,
    }),
    [state, signIn, signOut, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

import { useEffect, useRef } from "react";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/**
 * Accepts pending emergency invites for the logged-in user's email
 * (e.g. after first login). Idempotent; safe to call on every session.
 */
export function EmergencyContactsSync() {
  const { state, getAccessToken } = useAuth();
  const syncedForToken = useRef<string | null>(null);

  useEffect(() => {
    if (state.status !== "authenticated") {
      syncedForToken.current = null;
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken || syncedForToken.current === accessToken) {
      return;
    }

    syncedForToken.current = accessToken;

    void apiFetchJson<unknown>("/emergency/invites/accept-pending", {
      method: "POST",
      body: JSON.stringify({}),
      accessToken,
    });
  }, [state, getAccessToken]);

  return null;
}

import { getApiBaseUrl } from "../config/apiBaseUrl";
import { formatFetchError } from "../lib/apiError";

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Avisa quando uma chamada autenticada volta 401 (token expirado ou de outro
 * servidor — o Keychain do iOS mantém a sessão mesmo reinstalando o app).
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; body: unknown };

export async function apiFetchJson<T>(
  path: string,
  options: RequestInit & { accessToken?: string | null } = {},
): Promise<ApiResult<T>> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  const { accessToken: _token, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
    });
  } catch (error) {
    const message = formatFetchError(error, url);
    if (__DEV__) {
      console.warn("[apiFetchJson] network error", { url, error });
    }
    return {
      ok: false,
      status: 0,
      body: { error: { code: "NETWORK_ERROR", message } },
    };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && options.accessToken) {
      for (const listener of unauthorizedListeners) {
        listener();
      }
    }
    return { ok: false, status: response.status, body };
  }

  return { ok: true, status: response.status, data: body as T };
}

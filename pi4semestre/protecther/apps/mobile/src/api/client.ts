import { getApiBaseUrl } from "../config/apiBaseUrl";

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

  const response = await fetch(url, {
    ...rest,
    headers,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }

  return { ok: true, status: response.status, data: body as T };
}

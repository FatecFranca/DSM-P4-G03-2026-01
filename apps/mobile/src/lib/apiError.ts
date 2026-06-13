export function formatApiError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { message?: string } }).error?.message;
    if (typeof err === "string" && err.length > 0) {
      return err;
    }
  }
  return "Falha na requisição";
}

export function formatFetchError(error: unknown, url: string): string {
  if (error instanceof TypeError) {
    return `Sem conexão com a API (${url}). Confira se a API está rodando, se o iPhone está na mesma Wi‑Fi e se EXPO_PUBLIC_API_URL usa o IP do Mac.`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Erro de rede. Tente novamente.";
}

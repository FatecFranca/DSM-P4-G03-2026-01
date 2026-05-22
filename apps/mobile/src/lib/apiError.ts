export function formatApiError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { message?: string } }).error?.message;
    if (typeof err === "string" && err.length > 0) {
      return err;
    }
  }
  return "Falha na requisição";
}

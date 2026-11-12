export function formatApiError(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "Falha na requisição";
  }

  const payload = body as {
    error?: unknown;
    message?: unknown;
  };
  const nestedMessage =
    payload.error && typeof payload.error === "object"
      ? (payload.error as { message?: unknown }).message
      : undefined;
  const message =
    typeof nestedMessage === "string"
      ? nestedMessage
      : typeof payload.message === "string"
        ? payload.message
        : undefined;

  return message?.trim().slice(0, 240) || "Falha na requisição";
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

const FIELD_LABELS: Record<string, string> = {
  email: "o e-mail",
  password: "a senha",
  name: "o nome",
};

type ValidationIssue = {
  code?: string;
  path?: ReadonlyArray<string | number>;
  minimum?: number | bigint;
  maximum?: number | bigint;
};

/** Converte erros do zod em uma frase curta (nunca o JSON bruto das issues). */
export function formatValidationError(error: {
  issues?: ReadonlyArray<ValidationIssue>;
}): string {
  const issue = error.issues?.[0];
  const label = FIELD_LABELS[String(issue?.path?.[0] ?? "")];
  if (!issue || !label) {
    return "Dados inválidos. Confira os campos.";
  }
  if (issue.code === "invalid_string") {
    return `Informe ${label} válido.`;
  }
  if (issue.code === "too_big") {
    return `Limite de ${issue.maximum} caracteres excedido em ${label}.`;
  }
  if (issue.code === "too_small" && Number(issue.minimum) > 1) {
    return `Use ao menos ${issue.minimum} caracteres em ${label}.`;
  }
  return `Informe ${label}.`;
}

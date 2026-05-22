export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function apiError(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

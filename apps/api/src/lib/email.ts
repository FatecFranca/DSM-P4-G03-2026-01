/**
 * Normalizes email for storage and comparison (trim + lowercase).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

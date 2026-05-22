/**
 * Formats an ISO-8601 instant for display (default locale pt-BR).
 */
export function formatDisplayDateTime(iso: string, locale = "pt-BR"): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(instant);
}

/**
 * A lead's display name from whichever name columns its source had — a
 * single full-name column, separate first/last columns, or both. The full
 * name wins when present; otherwise first + last are joined. Returns "" when
 * there's no name at all. Used by the Google Sheets poller and the CSV
 * import, so a sheet with "First Name" / "Last Name" columns imports the
 * whole name, not just the first one.
 */
export function combineCustomerName(
  fullName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const full = (fullName ?? "").trim();
  if (full) return full;
  return [firstName, lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

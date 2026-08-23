import type { Session } from "@/lib/auth";

/**
 * Fields an agent must never see on a customer record — last name and every
 * phone-shaped field. Admins see everything; agents get the rest. This is
 * the one place that decides this, so every read path (API routes, server
 * components) enforces the same rule instead of each hiding fields in its
 * own JSX.
 */
const AGENT_HIDDEN_FIELDS = ["last_name", "phone", "home_telephone", "cellular_phone"] as const;

/** Strips agent-hidden fields from a customer row for the given session. Admins get the row unchanged. */
export function redactCustomerForSession<T extends Record<string, unknown>>(
  row: T,
  session: Session
): T {
  if (session.isAdmin) return row;
  const copy = { ...row };
  for (const field of AGENT_HIDDEN_FIELDS) {
    delete copy[field];
  }
  return copy;
}

/** Same redaction, applied to a list of customer rows. */
export function redactCustomersForSession<T extends Record<string, unknown>>(
  rows: T[],
  session: Session
): T[] {
  return rows.map((row) => redactCustomerForSession(row, session));
}

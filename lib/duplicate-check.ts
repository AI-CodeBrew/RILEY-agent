import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, type Session } from "@/lib/auth";

export type DuplicateMatch = { field: "phone" | "email"; name: string };

/**
 * Looks for another customer already using this phone or email, so the
 * create/edit forms can warn before filing what's probably the same person
 * twice. Scoped the same way the customer list itself is (applyAgentScope):
 * an agent only ever matches against their own book, admins match against
 * everyone — an agent seeing "this phone already belongs to X" for a
 * customer they can't otherwise see would leak another agent's book (see
 * lib/customer-visibility.ts and the "Owner" hint in CustomerEditor.tsx).
 */
export async function findDuplicateCustomer({
  phone,
  email,
  excludeId,
  session,
}: {
  /** Omit to skip the phone check entirely — used when a PATCH doesn't touch phone at all. */
  phone?: string | null;
  email?: string | null;
  excludeId?: string;
  session: Session;
}): Promise<DuplicateMatch | null> {
  if (phone) {
    let phoneQuery = applyAgentScope(
      supabaseAdmin.from("customers").select("id, name").eq("phone", phone),
      session
    );
    if (excludeId) phoneQuery = phoneQuery.neq("id", excludeId);

    const { data: phoneMatch } = await phoneQuery.limit(1).maybeSingle();
    if (phoneMatch) return { field: "phone", name: phoneMatch.name };
  }

  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    // Escape ilike's own wildcards so an email that happens to contain a
    // literal "%" or "_" can't turn this into a pattern match against
    // unrelated rows.
    const escapedEmail = trimmedEmail.replace(/[%_\\]/g, (char) => `\\${char}`);
    let emailQuery = applyAgentScope(
      supabaseAdmin.from("customers").select("id, name").ilike("email", escapedEmail),
      session
    );
    if (excludeId) emailQuery = emailQuery.neq("id", excludeId);

    const { data: emailMatch } = await emailQuery.limit(1).maybeSingle();
    if (emailMatch) return { field: "email", name: emailMatch.name };
  }

  return null;
}

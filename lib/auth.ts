import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SalesAgent } from "@/types/database";

export type Session = {
  userId: string;
  agent: SalesAgent;
  isAdmin: boolean;
};

/**
 * The one place that answers "who is making this request". Everything below
 * — pages, route handlers — starts here, then scopes its queries with
 * `scopeAgentFilter` so an agent can only ever touch their own book of
 * business. Memoized per render pass so a page with five queries still does
 * one auth round-trip.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Signed in with a valid Supabase user, but no active agent record — treat
  // as signed out rather than half-granting access.
  if (!agent || !agent.is_active) return null;

  return { userId: user.id, agent, isAdmin: agent.role === "admin" };
});

/** Page-level gate. Redirects to /login when there's no usable session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Page-level gate for admin-only screens (agent provisioning, billing). */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/dashboard?error=admin-only");
  return session;
}

type ApiAuth =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

/** Route-handler gate — returns a 401/403 response instead of redirecting. */
export async function requireApiSession(
  { adminOnly }: { adminOnly?: boolean } = {}
): Promise<ApiAuth> {
  const session = await getSession();

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not signed in" }, { status: 401 }),
    };
  }
  if (adminOnly && !session.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "admins only" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}

/**
 * The agent id every query should be filtered by, or null for admins (who
 * see the whole account). Pair with `applyAgentScope`.
 */
export function scopeAgentFilter(session: Session): string | null {
  return session.isAdmin ? null : session.agent.id;
}

/**
 * Applies the agent filter to a PostgREST query builder. Admins get the
 * unfiltered query, optionally narrowed by an explicit `?agent=` filter from
 * the UI.
 */
export function applyAgentScope<T extends { eq(column: string, value: string): T }>(
  query: T,
  session: Session,
  { column = "agent_id", requestedAgentId }: { column?: string; requestedAgentId?: string } = {}
): T {
  const scoped = scopeAgentFilter(session);
  if (scoped) return query.eq(column, scoped);
  if (requestedAgentId) return query.eq(column, requestedAgentId);
  return query;
}

/**
 * Confirms a row belongs to the caller before acting on it. Returns the row
 * on success so callers don't have to re-fetch.
 */
export async function authorizeRow<T extends { agent_id: string | null }>(
  table: "customers" | "appointments" | "calls",
  id: string,
  session: Session,
  columns = "*"
): Promise<{ row: T } | { error: NextResponse }> {
  const { data } = await supabaseAdmin
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle();

  const row = data as T | null;

  if (!row) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }
  if (!session.isAdmin && row.agent_id !== session.agent.id) {
    return {
      error: NextResponse.json(
        { error: "this record belongs to another agent" },
        { status: 403 }
      ),
    };
  }

  return { row };
}

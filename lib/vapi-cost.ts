import { supabaseAdmin } from "@/lib/supabase-admin";
import { listVapiCalls, type VapiCall } from "@/lib/vapi";

/**
 * Vapi spend for the admin Costs page.
 *
 * Vapi only keeps individual calls for about two weeks, so the portal can't
 * ask it for "last 3 months" on demand. Instead every call's cost lives in
 * `calls.cost`: the end-of-call webhook writes it first, and `syncVapiCosts`
 * (hourly cron + the page's "Sync from Vapi" button) re-reads recent calls
 * from Vapi and corrects any row that is missing a cost or has since been
 * re-priced. The page itself then only ever reads the saved costs, for any
 * range.
 */

/** `calls.created_at` and Vapi's `createdAt` differ by up to a few seconds; the saved rows are loaded this much wider so a call on a window edge is still matched. */
const BOUNDARY_PAD_MS = 5 * 60_000;
const SLICE_MS = 6 * 3_600_000;
const PAGE_SIZE = 1000;
const CONCURRENCY = 6;
/** Vapi's list payloads are heavy (full transcripts); past this the sync reports itself incomplete instead of overrunning the route. */
const VAPI_BUDGET_MS = 50_000;

export interface CostSyncResult {
  /** Calls Vapi returned for the window. */
  checked: number;
  /** Saved costs that were missing or out of date and have been corrected. */
  updated: number;
  /** True when part of the Vapi read failed or ran out of time. */
  incomplete: boolean;
}

async function fetchVapiSlice(createdAtGe: string, createdAtLt: string, signal: AbortSignal) {
  const found = new Map<string, VapiCall>();
  let createdAtLe: string | undefined;
  for (;;) {
    const page = await listVapiCalls(
      { createdAtGe, ...(createdAtLe ? { createdAtLe } : { createdAtLt }), limit: PAGE_SIZE },
      signal
    );
    const before = found.size;
    for (const call of page) found.set(call.id, call);
    if (page.length < PAGE_SIZE || found.size === before) break;
    createdAtLe = page.reduce(
      (oldest, call) => (call.createdAt && call.createdAt < oldest ? call.createdAt : oldest),
      createdAtLt
    );
  }
  return [...found.values()];
}

/** Copies Vapi's cost onto every `calls` row created in the window whose saved cost is missing or different. */
export async function syncVapiCosts({
  fromMs,
  toMs,
}: {
  fromMs: number;
  toMs: number;
}): Promise<CostSyncResult> {
  const slices: { ge: string; lt: string }[] = [];
  for (let at = fromMs; at < toMs; at += SLICE_MS) {
    slices.push({
      ge: new Date(at).toISOString(),
      lt: new Date(Math.min(at + SLICE_MS, toMs)).toISOString(),
    });
  }

  const signal = AbortSignal.timeout(VAPI_BUDGET_MS);
  const vapiCalls = new Map<string, VapiCall>();
  let incomplete = false;
  let next = 0;

  async function worker() {
    while (next < slices.length) {
      const slice = slices[next++];
      try {
        for (const call of await fetchVapiSlice(slice.ge, slice.lt, signal)) {
          vapiCalls.set(call.id, call);
        }
      } catch (error) {
        console.error(`Vapi cost sync failed for ${slice.ge}:`, error);
        incomplete = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slices.length) }, worker));

  const corrections: { id: string; cost: number }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("id, vapi_call_id, cost")
      .not("vapi_call_id", "is", null)
      .gte("created_at", new Date(fromMs - BOUNDARY_PAD_MS).toISOString())
      .lt("created_at", new Date(toMs + BOUNDARY_PAD_MS).toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load saved calls: ${error.message}`);

    for (const row of data ?? []) {
      const call = row.vapi_call_id ? vapiCalls.get(row.vapi_call_id) : undefined;
      // Only a finished call has a final cost worth saving.
      if (!call || call.status !== "ended" || typeof call.cost !== "number") continue;
      if (row.cost === null || Math.abs(call.cost - row.cost) > 0.00005) {
        corrections.push({ id: row.id, cost: Math.round(call.cost * 10_000) / 10_000 });
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  for (let i = 0; i < corrections.length; i += 20) {
    await Promise.all(
      corrections
        .slice(i, i + 20)
        .map(({ id, cost }) => supabaseAdmin.from("calls").update({ cost }).eq("id", id))
    );
  }

  return { checked: vapiCalls.size, updated: corrections.length, incomplete };
}

export interface CostBucket {
  cost: number;
  calls: number;
}

export interface CostReport extends CostBucket {
  /** Per agent, highest spend first. Calls whose agent was deleted are grouped under a null id. */
  agents: (CostBucket & { agentId: string | null })[];
  /** Per calendar month ("YYYY-MM" in the viewer's timezone), newest first. */
  months: (CostBucket & { month: string })[];
}

/** Saved Vapi cost for a date range — one agent's, or everyone's when `agentId` is null. */
export async function getCostReport({
  agentId,
  startUtc,
  endUtc,
  timeZone,
}: {
  agentId: string | null;
  /** Inclusive ISO lower bound, or null for "from the beginning". */
  startUtc: string | null;
  /** Exclusive ISO upper bound, or null for "up to now". */
  endUtc: string | null;
  timeZone: string;
}): Promise<CostReport> {
  function chunk(offset: number) {
    let query = supabaseAdmin
      .from("calls")
      .select("agent_id, cost, created_at", { count: "exact" })
      // Rows Vapi never dialled (canceled before they were placed) aren't calls it charged for.
      .not("vapi_call_id", "is", null);
    if (agentId) query = query.eq("agent_id", agentId);
    if (startUtc) query = query.gte("created_at", startUtc);
    if (endUtc) query = query.lt("created_at", endUtc);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
  }

  // PostgREST caps a response at 1000 rows, so the first chunk's exact count
  // decides how many more to fetch alongside each other.
  const first = await chunk(0);
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < (first.count ?? 0); offset += PAGE_SIZE) offsets.push(offset);
  const rest = await Promise.all(offsets.map(chunk));

  const failed = [first, ...rest].find((result) => result.error);
  if (failed?.error) throw new Error(`Failed to load call costs: ${failed.error.message}`);

  const monthFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" });
  const monthKey = (iso: string) => {
    const parts = monthFormat.formatToParts(new Date(iso));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}`;
  };

  const agents = new Map<string | null, CostBucket>();
  const months = new Map<string, CostBucket>();
  const total: CostBucket = { cost: 0, calls: 0 };
  function add<K>(buckets: Map<K, CostBucket>, key: K, cost: number) {
    const bucket = buckets.get(key) ?? { cost: 0, calls: 0 };
    bucket.cost += cost;
    bucket.calls += 1;
    buckets.set(key, bucket);
  }

  for (const row of [first, ...rest].flatMap((result) => result.data ?? [])) {
    const cost = row.cost ?? 0;
    total.cost += cost;
    total.calls += 1;
    add(agents, row.agent_id, cost);
    add(months, monthKey(row.created_at), cost);
  }

  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    cost: round(total.cost),
    calls: total.calls,
    agents: [...agents.entries()]
      .map(([id, bucket]) => ({ agentId: id, cost: round(bucket.cost), calls: bucket.calls }))
      .sort((a, b) => b.cost - a.cost),
    months: [...months.entries()]
      .map(([month, bucket]) => ({ month, cost: round(bucket.cost), calls: bucket.calls }))
      .sort((a, b) => (a.month < b.month ? 1 : -1)),
  };
}

import Link from "next/link";
import { CalendarCheck, Download, PhoneMissed, Users } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { dialFromPreview } from "@/lib/area-code-routing";
import { redactCustomersForSession } from "@/lib/customer-visibility";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { FilterPills, SearchInput } from "@/components/Filters";
import { LinkButton } from "@/components/Button";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import { CustomerForm } from "./CustomerForm";
import { ImportCustomersButton } from "./ImportCustomersButton";
import { CustomersTable } from "./CustomersTable";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS } from "@/lib/customer-status";
import { CUSTOMER_SOURCES, type CustomerSource, type CustomerStatus, type CustomerWithAgent } from "@/types/database";

export const dynamic = "force-dynamic";

// Rows per table page the agent can pick (?limit=), first one is the
// default. Stat cards are counted over every matching customer, not just
// this page.
const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const STATUS_FILTERS = [
  { value: null, label: "All" },
  ...CUSTOMER_STATUSES.map((status) => ({ value: status, label: CUSTOMER_STATUS_LABELS[status] })),
];

const SOURCE_FILTERS = [
  { value: null, label: "All sources" },
  { value: "google_sheet", label: "Google Sheets" },
  { value: "csv", label: "CSV import" },
  { value: "manual", label: "Added manually" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    agent?: string;
    source?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const { q, status, agent: agentFilter, source } = params;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const requestedLimit = Number.parseInt(params.limit ?? "", 10);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedLimit)
    ? requestedLimit
    : DEFAULT_PAGE_SIZE;
  const validSource =
    source && (CUSTOMER_SOURCES as readonly string[]).includes(source)
      ? (source as CustomerSource)
      : null;

  // Same scope + filters for the table page and every stat card, so the
  // numbers always describe the whole filtered set, not just this page.
  function filtered(columns: string, options?: { count: "exact"; head?: boolean }) {
    let query = applyAgentScope(
      supabaseAdmin.from("customers").select(columns, options),
      session,
      { requestedAgentId: agentFilter }
    );
    if (status) query = query.eq("status", status as CustomerStatus);
    if (validSource) query = query.eq("source", validSource);
    if (q) {
      const term = `%${q.replaceAll("%", "")}%`;
      query = query.or(
        `name.ilike.${term},phone.ilike.${term},email.ilike.${term},company.ilike.${term}`
      );
    }
    return query;
  }

  // `id` tiebreaker: a CSV import gives hundreds of rows the same
  // created_at, which would otherwise shuffle rows between pages.
  function customersPage(page: number) {
    const start = (page - 1) * pageSize;
    return filtered("*, agent:sales_agents(id, name, email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + pageSize - 1);
  }

  // Export mirrors whatever's currently filtered — same status/agent/search
  // params, handled server-side in app/api/customers/export so it always
  // covers every matching customer, not just the rows rendered on this page.
  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (agentFilter) exportParams.set("agent", agentFilter);
  if (validSource) exportParams.set("source", validSource);
  if (q) exportParams.set("q", q);
  const exportHref = `/api/customers/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  // None of these queries depend on each other's results, so they're run
  // concurrently instead of sequentially.
  const agentsQuery = session.isAdmin
    ? supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : Promise.resolve({ data: null as { id: string; name: string }[] | null });

  const [
    firstPage,
    { count: followUpCount },
    { count: bookedCount },
    { data: agents },
    { data: numberRows },
    { data: routeRows },
  ] = await Promise.all([
    customersPage(requestedPage),
    filtered("id", { count: "exact", head: true }).in("status", ["follow_up", "no_answer"]),
    filtered("id", { count: "exact", head: true }).eq("status", "appointment_set"),
    agentsQuery,
    supabaseAdmin
      .from("agent_phone_numbers")
      .select("id, phone_number")
      .eq("agent_id", session.agent.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("agent_number_routes")
      .select("region, phone_number_id")
      .eq("agent_id", session.agent.id),
  ]);
  // A page past the end comes back as a PostgREST range error with no count
  // (e.g. a stale ?page= after deleting customers) — count separately then.
  const totalCustomers =
    firstPage.count ??
    (requestedPage > 1
      ? ((await filtered("id", { count: "exact", head: true })).count ?? 0)
      : 0);
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  // Clamp so a stale ?page= past the end (e.g. after deleting customers)
  // lands on the last page instead of an empty table.
  const page = Math.min(requestedPage, totalPages);
  const { data, error } = page === requestedPage ? firstPage : await customersPage(page);
  const customers = (data ?? []) as unknown as CustomerWithAgent[];
  const pageStart = (page - 1) * pageSize;

  // Changing the page size starts over from page 1 — the old page number
  // means different rows at a different size.
  function pageSizeHref(size: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page" && key !== "limit") next.set(key, value);
    }
    if (size !== DEFAULT_PAGE_SIZE) next.set("limit", String(size));
    const qs = next.toString();
    return qs ? `/customers?${qs}` : "/customers";
  }

  function pageHref(target: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `/customers?${qs}` : "/customers";
  }

  const numbers = (numberRows ?? []).map((row) => ({
    id: row.id,
    phoneNumber: row.phone_number,
  }));
  const routes = routeRows ?? [];

  // Compute the "will call from" preview from each customer's phone.
  const withDialPreview = customers.map((customer) => ({
    ...customer,
    dialFrom: dialFromPreview(customer.phone, numbers, routes),
  }));
  const customersForClient = redactCustomersForSession(withDialPreview, session);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={
          session.isAdmin
            ? "Every customer across the team, and which agent owns each one."
            : "Your book of business. Add a customer, then have Riley call them."
        }
        // Customers belong to the agent who works them — admins observe.
        action={
          <div className="flex flex-wrap items-center gap-3">
            <TimezoneClocks />
            {!session.isAdmin && (
              <div className="flex gap-2">
                <ImportCustomersButton />
                <CustomerForm />
              </div>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total customers" value={totalCustomers} icon={Users} />
        <StatCard
          label="Needs follow-up"
          value={followUpCount ?? 0}
          icon={PhoneMissed}
          tone={(followUpCount ?? 0) > 0 ? "warning" : "default"}
          hint="follow up or no answer"
        />
        <StatCard
          label="Booked"
          value={bookedCount ?? 0}
          icon={CalendarCheck}
          tone={(bookedCount ?? 0) > 0 ? "success" : "default"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SearchInput placeholder="Search name, phone, email or company…" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterPills paramKey="status" options={STATUS_FILTERS} />
          <LinkButton href={exportHref}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </LinkButton>
        </div>
        <FilterPills paramKey="source" options={SOURCE_FILTERS} />
        {session.isAdmin && agents && agents.length > 0 && (
          <FilterPills
            paramKey="agent"
            options={[
              { value: null, label: "All agents" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Failed to load customers: {error.message}
        </p>
      )}

      <CustomersTable
        customers={customersForClient}
        isAdmin={session.isAdmin}
        emptyTitle={q || status || source ? "No customers match those filters" : "No customers yet"}
        emptyDescription={
          q || status || source
            ? "Try a different search or clear the filters."
            : "Add your first customer to start booking appointments."
        }
      />

      {totalCustomers > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>
            Showing {(pageStart + 1).toLocaleString()}–
            {Math.min(pageStart + pageSize, totalCustomers).toLocaleString()} of{" "}
            {totalCustomers.toLocaleString()} customers
          </p>
          <div className="flex items-center gap-2">
            <span>Per page</span>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <PageLink key={size} href={pageSizeHref(size)} active={size === pageSize}>
                {size}
              </PageLink>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                Previous
              </PageLink>
              <span>
                Page {page} of {totalPages}
              </span>
              <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                Next
              </PageLink>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled = false,
  active = false,
  children,
}: {
  href: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "rounded-lg border border-border px-3 py-1.5 text-xs font-medium";
  if (active) {
    return (
      <span className={`${className} border-foreground text-foreground`} aria-current="true">
        {children}
      </span>
    );
  }
  if (disabled) {
    return (
      <span className={`${className} cursor-not-allowed opacity-40`} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={`${className} hover:text-foreground`}>
      {children}
    </Link>
  );
}

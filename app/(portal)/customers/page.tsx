import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { FilterPills, SearchInput } from "@/components/Filters";
import { CustomerForm } from "./CustomerForm";
import { ImportCustomersButton } from "./ImportCustomersButton";
import { CustomersTable } from "./CustomersTable";
import type { CustomerStatus, CustomerWithAgent } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: null, label: "All" },
  { value: "new", label: "New" },
  { value: "call_scheduled", label: "Call scheduled" },
  { value: "calling", label: "Calling" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment_set", label: "Booked" },
  { value: "follow_up", label: "Follow up" },
  { value: "no_answer", label: "No answer" },
  { value: "not_interested", label: "Not interested" },
  { value: "do_not_call", label: "Do not call" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; agent?: string }>;
}) {
  const session = await requireSession();
  const { q, status, agent: agentFilter } = await searchParams;

  let query = applyAgentScope(
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name, email)")
      .order("created_at", { ascending: false }),
    session,
    { requestedAgentId: agentFilter }
  );

  if (status) query = query.eq("status", status as CustomerStatus);
  if (q) {
    const term = `%${q.replaceAll("%", "")}%`;
    query = query.or(
      `name.ilike.${term},phone.ilike.${term},email.ilike.${term},company.ilike.${term}`
    );
  }

  const { data, error } = await query;
  const customers = (data ?? []) as CustomerWithAgent[];

  const { data: agents } = session.isAdmin
    ? await supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : { data: null };

  const [{ data: numberRows }, { data: routeRows }] = await Promise.all([
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

  const numbers = (numberRows ?? []).map((row) => ({
    id: row.id,
    phoneNumber: row.phone_number,
  }));
  const routes = routeRows ?? [];

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
          session.isAdmin ? undefined : (
            <div className="flex gap-2">
              <ImportCustomersButton />
              <CustomerForm />
            </div>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <SearchInput placeholder="Search name, phone, email or company…" />
        <FilterPills paramKey="status" options={STATUS_FILTERS} />
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
        customers={customers}
        numbers={numbers}
        routes={routes}
        isAdmin={session.isAdmin}
        emptyTitle={q || status ? "No customers match those filters" : "No customers yet"}
        emptyDescription={
          q || status
            ? "Try a different search or clear the filters."
            : "Add your first customer to start booking appointments."
        }
      />
    </div>
  );
}

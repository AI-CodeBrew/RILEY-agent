import { CalendarCheck, PhoneMissed, Users } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { dialFromPreview } from "@/lib/area-code-routing";
import { redactCustomersForSession } from "@/lib/customer-visibility";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
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
  { value: "sold", label: "Sold" },
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

  // Compute the "will call from" preview from the raw phone *before*
  // redacting it — agents never receive the customer's phone number itself
  // (see lib/customer-visibility.ts), only this derived, non-sensitive label.
  const withDialPreview = customers.map((customer) => ({
    ...customer,
    dialFrom: dialFromPreview(customer.phone, numbers, routes),
  }));
  const customersForClient = redactCustomersForSession(withDialPreview, session);

  const followUpCount = customers.filter(
    (c) => c.status === "follow_up" || c.status === "no_answer"
  ).length;
  const bookedCount = customers.filter((c) => c.status === "appointment_set").length;

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total customers" value={customers.length} icon={Users} />
        <StatCard
          label="Needs follow-up"
          value={followUpCount}
          icon={PhoneMissed}
          tone={followUpCount > 0 ? "warning" : "default"}
          hint="follow up or no answer"
        />
        <StatCard
          label="Booked"
          value={bookedCount}
          icon={CalendarCheck}
          tone={bookedCount > 0 ? "success" : "default"}
        />
      </div>

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
        customers={customersForClient}
        isAdmin={session.isAdmin}
        defaultVoiceGender={session.agent.default_voice_gender}
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

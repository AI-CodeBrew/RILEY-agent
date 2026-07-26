import { PhoneCall, Users } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { StatusBadge } from "@/lib/status-badge";
import { formatPhone, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { FilterPills, SearchInput } from "@/components/Filters";
import { CustomerForm } from "./CustomerForm";
import type { CustomerStatus, CustomerWithAgent } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: null, label: "All" },
  { value: "new", label: "New" },
  { value: "call_scheduled", label: "Call scheduled" },
  { value: "calling", label: "Calling" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment_set", label: "Booked" },
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={
          session.isAdmin
            ? "Every customer across the team. Assign one to an agent to let them call."
            : "Your book of business. Add a customer, then have Riley call them."
        }
        action={<CustomerForm agents={agents ?? undefined} />}
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

      <Card className="overflow-hidden">
        {customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  {session.isAdmin && <th className="px-4 py-3">Owner</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last contacted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={customer.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{customer.name}</p>
                          <p className="truncate text-xs text-muted">
                            {customer.company ?? customer.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatPhone(customer.phone)}
                    </td>
                    {session.isAdmin && (
                      <td className="px-4 py-3 text-muted">
                        {customer.agent?.name ?? (
                          <span className="text-amber-600 dark:text-amber-400">
                            unassigned
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={customer.status}
                        pulse={customer.status === "calling"}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {customer.last_contacted_at
                        ? formatRelative(customer.last_contacted_at)
                        : "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <LinkButton href={`/customers/${customer.id}`}>
                        <PhoneCall className="h-3.5 w-3.5" />
                        View / Call
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={q || status ? "No customers match those filters" : "No customers yet"}
            description={
              q || status
                ? "Try a different search or clear the filters."
                : "Add your first customer to start booking appointments."
            }
          />
        )}
      </Card>
    </div>
  );
}

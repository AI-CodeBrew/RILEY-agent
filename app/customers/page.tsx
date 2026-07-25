import { PhoneCall, Users } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { StatusBadge } from "@/lib/status-badge";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { CustomerForm } from "./CustomerForm";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { data: customers, error } = await supabaseAdmin
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Add customers and trigger outbound booking calls."
      />

      <Card className="p-4">
        <CustomerForm />
      </Card>

      {error && (
        <p className="text-sm text-red-600">
          Failed to load customers: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {customers && customers.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
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
                      <span className="font-medium">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{customer.phone}</td>
                  <td className="px-4 py-3 text-muted">
                    {customer.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={customer.status} />
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
        ) : (
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Add your first customer using the form above."
          />
        )}
      </Card>
    </div>
  );
}

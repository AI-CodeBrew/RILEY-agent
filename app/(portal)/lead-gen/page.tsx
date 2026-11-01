import Link from "next/link";
import { Target } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  GENDER_LABELS,
  ORDER_ACCEPTS_LEADS,
  ORDER_STATUS_LABELS,
  PRODUCT_LABELS,
  formatCents,
  regionList,
} from "@/lib/lead-gen";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LeadGenOrderForm } from "./LeadGenOrderForm";
import { OrderStatusActions } from "./OrderStatusActions";
import { CopyLinkButton } from "./CopyLinkButton";
import type { LeadGenLead, LeadGenOrder, LeadGenOrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

type OrderRow = LeadGenOrder & { agent: { name: string; email: string } | null };

const STATUS_STYLES: Record<LeadGenOrderStatus, string> = {
  pending_payment: "bg-background text-muted",
  paid: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  canceled: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function demographicsSummary(order: LeadGenOrder) {
  const parts = [
    order.cities,
    order.age_min || order.age_max ? `Age ${order.age_min ?? 18}–${order.age_max ?? 100}` : null,
    order.gender !== "any" ? GENDER_LABELS[order.gender] : null,
  ];
  return parts.filter(Boolean).join(" · ") || "Anyone";
}

export default async function LeadGenPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await requireSession();
  const { order: orderResult } = await searchParams;

  let query = supabaseAdmin
    .from("lead_gen_orders")
    .select("*, agent:sales_agents(name, email)")
    .order("created_at", { ascending: false });
  // Agents only ever see their own orders, minus checkouts they abandoned;
  // admins see every agent's, with the paid ones waiting on them to go live.
  if (!session.isAdmin) {
    query = query.eq("agent_id", session.agent.id).neq("status", "pending_payment");
  }

  const { data, error } = await query;
  const orders = (data ?? []) as OrderRow[];

  const { data: leadData } = orders.length
    ? await supabaseAdmin
        .from("lead_gen_leads")
        .select("*")
        .in("order_id", orders.map((o) => o.id))
        .order("created_at", { ascending: false })
    : { data: [] };
  const leadsByOrder = new Map<string, LeadGenLead[]>();
  for (const lead of (leadData ?? []) as LeadGenLead[]) {
    leadsByOrder.set(lead.order_id, [...(leadsByOrder.get(lead.order_id) ?? []), lead]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads Gen"
        description={
          session.isAdmin
            ? "Lead-gen orders from every agent. Paid orders wait here until you take them live."
            : "Order leads: choose the product, who the leads should be, where you're licensed and your budget."
        }
      />

      {orderResult === "success" && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Payment received. Our team will review your order and take it live shortly.
        </p>
      )}
      {orderResult === "canceled" && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          Checkout was canceled, so nothing was charged.
        </p>
      )}

      {!session.isAdmin && <LeadGenOrderForm agentName={session.agent.name} />}

      {error && <p className="text-sm text-red-600">Failed to load orders: {error.message}</p>}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{session.isAdmin ? "Orders" : "Your orders"}</h2>
        <Card className="overflow-hidden">
          {orders.length > 0 ? (
            <ul className="divide-y divide-border">
              {orders.map((order) => {
                const leads = leadsByOrder.get(order.id) ?? [];
                const formPath = `/quote/${order.id}`;
                return (
                  <li key={order.id} className="space-y-2 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {order.product ? PRODUCT_LABELS[order.product] : (order.package ?? "Lead gen")} ·{" "}
                            {formatCents(order.amount_cents)}
                          </p>
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[order.status])}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </div>
                        {session.isAdmin && order.agent && (
                          <p className="mt-0.5 text-sm text-muted">
                            {order.agent.name} · {order.agent.email}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted" title={formatDateTime(order.created_at)}>
                          Ordered {formatRelative(order.created_at)}
                          {order.live_at && <> · Live {formatRelative(order.live_at)}</>}
                        </p>
                      </div>
                      {session.isAdmin && <OrderStatusActions id={order.id} status={order.status} />}
                    </div>

                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted">Leads wanted</dt>
                      <dd>{demographicsSummary(order)}</dd>
                      {order.licensed_regions.length > 0 && (
                        <>
                          <dt className="text-muted">Licensed in</dt>
                          <dd>
                            {regionList(order.licensed_regions)}
                            {order.agency_name && <> · as {order.agency_name}</>}
                          </dd>
                        </>
                      )}
                      {ORDER_ACCEPTS_LEADS[order.status] && order.product && (
                        <>
                          <dt className="text-muted">Lead form</dt>
                          <dd className="flex flex-wrap items-center gap-2">
                            <Link href={formPath} target="_blank" className="text-accent hover:underline">
                              {formPath}
                            </Link>
                            <CopyLinkButton path={formPath} />
                          </dd>
                        </>
                      )}
                    </dl>

                    {leads.length > 0 && (
                      <details className="rounded-lg border border-border">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                          {leads.length} lead{leads.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="divide-y divide-border border-t border-border">
                          {leads.map((lead) => (
                            <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {lead.first_name} {lead.last_name}
                                </p>
                                <p className="text-xs text-muted">
                                  {formatPhone(lead.phone)} · {lead.email}
                                </p>
                              </div>
                              <p className="text-xs text-muted" title={formatDateTime(lead.created_at)}>
                                Calls OK{lead.consent_messages ? " · Texts/emails OK" : " · No texts/emails"} ·{" "}
                                {formatRelative(lead.created_at)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Target}
              title="No orders yet"
              description={
                session.isAdmin
                  ? "Agents' lead-gen orders will show up here."
                  : "Orders you place above will show up here."
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}

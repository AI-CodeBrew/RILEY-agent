import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LEAD_FORM_COMPANY, ORDER_ACCEPTS_LEADS, PRODUCT_LABELS, consentTexts } from "@/lib/lead-gen";
import type { LeadGenOrderStatus, LeadGenProduct } from "@/types/database";
import { QuoteForm } from "./QuoteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get an insurance quote",
  robots: { index: false },
};

/**
 * Public lead form for one lead-gen order — the page ad traffic is sent to.
 * The consent wording names the order's agent/agency and the provinces/states
 * they're licensed in; /api/lead-gen/leads rebuilds the same wording when it
 * saves the lead.
 */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Not a uuid → treat as missing instead of letting Postgres reject it.
  const { data: order } = /^[0-9a-f-]{36}$/i.test(id)
    ? await supabaseAdmin
        .from("lead_gen_orders")
        .select("id, status, product, agency_name, licensed_regions, agent:sales_agents(name)")
        .eq("id", id)
        .maybeSingle()
    : { data: null };

  const open = order && order.product && ORDER_ACCEPTS_LEADS[order.status as LeadGenOrderStatus];
  const agent = order?.agent as unknown as { name: string } | null;

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        {open ? (
          <>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Get a {PRODUCT_LABELS[order.product as LeadGenProduct].toLowerCase()} insurance quote
            </h1>
            <p className="mt-2 text-sm text-muted">
              Leave your details and a licensed agent will get in touch to find a time that suits you.
            </p>
            <div className="mt-8">
              <QuoteForm orderId={order.id} consent={consentTexts(order, agent?.name ?? "your agent")} />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">This form isn&apos;t available</h1>
            <p className="mt-2 text-sm text-muted">The link may be out of date. Please check with whoever sent it to you.</p>
          </>
        )}

        <footer className="mt-12 border-t border-border pt-4 text-xs text-muted">
          {[LEAD_FORM_COMPANY.legalName, LEAD_FORM_COMPANY.mailingAddress, LEAD_FORM_COMPANY.contact]
            .filter(Boolean)
            .join(" · ")}{" "}
          ·{" "}
          <Link href={LEAD_FORM_COMPANY.privacyPath} className="text-accent hover:underline">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </div>
  );
}

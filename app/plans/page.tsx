import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getBillingAccount } from "@/lib/billing";
import { PlansGrid } from "./PlansGrid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your plan · Dialcom" };

/**
 * The one place an agent picks a plan — for the very first time (redirected
 * here straight from login, see the dashboard page) or again later (trial
 * expired, subscription canceled, reached via Settings' "Choose a plan"
 * link). Settings only ever manages an *existing* subscription from here on.
 * Admins never subscribe (they don't place calls), and an agent who's
 * already active has nothing to pick — both get bounced to Settings instead
 * of a picker with nothing useful to click.
 */
export default async function PlansPage() {
  const session = await requireSession();
  if (session.isAdmin) redirect("/settings");

  const account = await getBillingAccount(session.agent.id);
  if (account?.status === "active") redirect("/settings");

  return (
    <div className="space-y-10">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {account ? "Pick a new plan" : `Welcome, ${session.agent.name.split(" ")[0]}`}
        </h1>
        <p className="mt-3 text-base text-muted">
          {account
            ? "Your previous plan isn't active anymore — choose one below to start calling again."
            : "One quick step before you start calling — pick the plan that fits how you sell."}
        </p>
      </div>

      <PlansGrid trialUsed={account?.trial_used ?? false} />
    </div>
  );
}

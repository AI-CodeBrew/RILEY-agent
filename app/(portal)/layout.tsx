import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { requireSession } from "@/lib/auth";
import { getAgentPhoneNumberCount } from "@/lib/agent-phone-count";
import type { SessionAgentSummary } from "@/components/UserMenu";

/**
 * Every screen behind the auth gate. proxy.ts already bounced anonymous
 * requests, but the real check happens here — next to the data — so a missing
 * or deactivated sales_agents row can never render the portal.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { agent } = await requireSession();

  const phoneNumberCount =
    agent.role === "admin" ? 0 : await getAgentPhoneNumberCount(agent.id);

  const summary: SessionAgentSummary = {
    name: agent.name,
    email: agent.email,
    role: agent.role,
    phoneNumberCount,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar agent={summary} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav agent={summary} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

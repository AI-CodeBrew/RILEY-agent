"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Phone, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";

export interface SessionAgentSummary {
  name: string;
  email: string;
  role: "agent" | "admin";
  phoneNumberCount: number;
}

/**
 * Bottom-of-sidebar identity block: who you're signed in as, which outbound
 * number your calls place from, and the way out.
 */
export function UserMenu({ agent }: { agent: SessionAgentSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) {
      setSigningOut(false);
      toast("Could not sign out — try again.", "error");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <Avatar name={agent.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground-active">
            {agent.name}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/70">
            {agent.email}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
          className="rounded-lg p-1.5 text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-sidebar-foreground-active disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2">
        {agent.role === "admin" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground-active">
            <ShieldCheck className="h-3 w-3" />
            Admin
          </span>
        )}
        {/* Admins don't sell, so they never have an outbound number — showing
            them "no number yet" reads as something they need to go fix. */}
        {agent.role !== "admin" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-sidebar-foreground/80">
            <Phone className="h-3 w-3" />
            {agent.phoneNumberCount > 0
              ? `${agent.phoneNumberCount} number${agent.phoneNumberCount > 1 ? "s" : ""} connected`
              : "no number yet"}
          </span>
        )}
      </div>
    </div>
  );
}

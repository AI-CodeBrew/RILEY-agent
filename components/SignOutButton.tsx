"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

/**
 * Bare sign-out control for screens outside the portal sidebar (which
 * already has this exact logic baked into UserMenu) — the standalone
 * /plans page is the first user of this, but anything else full-page and
 * chrome-less can reuse it too.
 */
export function SignOutButton({ className }: { className?: string }) {
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
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50",
        className
      )}
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}

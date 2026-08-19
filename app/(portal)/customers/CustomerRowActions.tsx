"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { CustomerStatus } from "@/types/database";

/** The "..." menu at the end of a customer row — currently just "Mark as sold". */
export function CustomerRowActions({
  customerId,
  status,
}: {
  customerId: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );

  function openMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 176;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function reposition() {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 176;
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menuOpen]);

  async function markSold() {
    setBusy(true);
    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sold" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMenuOpen(false);

    if (!res.ok) {
      toast(body.error ?? "Could not update this customer.", "error");
      return;
    }

    toast("Marked as sold.", "success");
    router.refresh();
  }

  return (
    <div className="relative">
      <Button
        ref={menuButtonRef}
        size="sm"
        variant="secondary"
        aria-label="More actions"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (menuOpen) setMenuOpen(false);
          else openMenu();
        }}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>

      {menuOpen && menuPosition && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || status === "sold"}
              onClick={markSold}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {status === "sold" ? "Already marked sold" : "Mark as sold"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

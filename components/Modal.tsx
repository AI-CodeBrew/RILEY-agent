"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Ref-counted scroll lock so nested modals (e.g. delete confirm) stay stable. */
let scrollLockCount = 0;
let savedScrollY = 0;

function lockPageScroll() {
  if (scrollLockCount === 0) {
    savedScrollY = window.scrollY;
    const { style } = document.body;
    style.overflow = "hidden";
    style.position = "fixed";
    style.top = `-${savedScrollY}px`;
    style.width = "100%";
  }
  scrollLockCount += 1;
}

function unlockPageScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    const { style } = document.body;
    style.overflow = "";
    style.position = "";
    style.top = "";
    style.width = "";
    window.scrollTo(0, savedScrollY);
  }
}

/**
 * Lightweight centred dialog. Deliberately not a native <dialog> — Vapi call
 * panels re-render underneath while a modal is open, and showModal()'s
 * imperative state fights React's.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;

    lockPageScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockPageScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 overflow-hidden overscroll-none touch-none">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="flex h-full items-end justify-center p-4 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "relative z-10 flex w-full max-w-lg max-h-[min(90dvh,calc(100%-2rem))] flex-col rounded-2xl border border-border bg-surface shadow-xl touch-auto",
            className
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5 pb-4">
            <div className="min-w-0 pr-2">
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-muted">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {(children || footer) && (
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-4">
              {children && <div className="space-y-3">{children}</div>}
              {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

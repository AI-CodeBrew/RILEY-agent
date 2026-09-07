"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ContactFormModal } from "./ContactFormModal";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <header className="relative z-20 border-b border-[var(--lp-border)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
        <img src="/logo-light.svg" alt="Dialcom" className="h-9 w-auto sm:h-11 md:h-12" />

        <div className="hidden items-center gap-6 md:flex">
          <nav className="flex items-center gap-6">
            <a
              href="#pricing"
              className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
            >
              Contact Us
            </button>
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
            >
              Login
            </Link>
          </nav>

          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-full bg-[var(--lp-blue)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--lp-blue-hover)]"
          >
            Demo →
          </a>
        </div>

        <button
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg border border-[var(--lp-border)] p-2 text-[var(--lp-text)] md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-[var(--lp-border)] bg-[var(--lp-bg-soft)] md:hidden">
          <nav className="flex flex-col gap-1 px-6 py-4">
            <a
              href="#pricing"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--lp-muted)] hover:bg-white/5 hover:text-[var(--lp-text)]"
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setContactOpen(true);
              }}
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--lp-muted)] hover:bg-white/5 hover:text-[var(--lp-text)]"
            >
              Contact Us
            </button>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--lp-muted)] hover:bg-white/5 hover:text-[var(--lp-text)]"
            >
              Login
            </Link>
            <a
              href="#how-it-works"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-[var(--lp-blue)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Demo →
            </a>
          </nav>
        </div>
      )}

      <ContactFormModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}

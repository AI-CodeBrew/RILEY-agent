import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

const PRODUCT_LINKS = [
  "Client Management",
  "Voice Agent",
  "Lead Pipeline",
  "Automation",
];

const CONTACT_EMAIL = "dialcomai@gmail.com";
const WHATSAPP_NUMBER = "+1 (647) 572-4353";
const WHATSAPP_DIGITS = "16475724353";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--lp-border)] bg-[var(--lp-navy)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div
          id="contact"
          className="scroll-mt-24 border-b border-[var(--lp-border)] pb-8"
        >
          <p className="text-sm font-semibold text-[var(--lp-text)]">Contact Us</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
            >
              <Mail className="h-4 w-4" />
              {CONTACT_EMAIL}
            </a>
            <a
              href={`https://wa.me/${WHATSAPP_DIGITS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
            >
              <MessageCircle className="h-4 w-4" />
              {WHATSAPP_NUMBER}
            </a>
          </div>
        </div>

        <div className="grid gap-8 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
            <img src="/logo-light.svg" alt="Dialcom" className="h-7 w-auto" />
            <p className="mt-3 max-w-xs text-sm text-[var(--lp-muted)]">
              The CRM and voice AI platform built for lending businesses that
              want to close more deals, faster.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--lp-text)]">Product</p>
            <ul className="mt-3 space-y-2">
              {PRODUCT_LINKS.map((item) => (
                <li key={item} className="text-sm text-[var(--lp-muted)]">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--lp-text)]">Company</p>
            <ul className="mt-3 space-y-2">
              <li className="text-sm text-[var(--lp-muted)]">Pricing</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--lp-text)]">Get Started</p>
            <Link
              href="/register"
              className="mt-3 inline-flex items-center rounded-full bg-[var(--lp-blue)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--lp-blue-hover)]"
            >
              Start Free Trial
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-[var(--lp-border)] pt-6 sm:flex-row">
          <p className="text-xs text-[var(--lp-muted)]">
            © {new Date().getFullYear()} Dialcom. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs text-[var(--lp-muted)]">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

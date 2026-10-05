import Link from "next/link";
import { Mail } from "lucide-react";

const PRODUCT_LINKS = [
  "Lead Generation",
  "Voice Agent",
  "Lead Pipeline",
  "Automation",
];

const CONTACT_EMAIL = "dialcomai@gmail.com";

// Official brand glyphs in their brand colors, inlined because lucide-react
// no longer ships brand icons.
// TODO: replace the hrefs with Dialcom's actual profile URLs.
const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/",
    fill: "url(#instagram-gradient)",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/",
    fill: "#0A66C2",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/",
    fill: "#1877F2",
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
];

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
            <div className="flex items-center gap-4">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="transition-transform hover:scale-110"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill={social.fill}
                    aria-hidden="true"
                    className="h-6 w-6"
                  >
                    {social.label === "Instagram" && (
                      <defs>
                        <linearGradient
                          id="instagram-gradient"
                          x1="0"
                          y1="1"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0" stopColor="#FEDA75" />
                          <stop offset="0.25" stopColor="#FA7E1E" />
                          <stop offset="0.5" stopColor="#D62976" />
                          <stop offset="0.75" stopColor="#962FBF" />
                          <stop offset="1" stopColor="#4F5BD5" />
                        </linearGradient>
                      </defs>
                    )}
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-8 pt-8 sm:grid-cols-2 lg:grid-cols-3">
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
              <li>
                <a
                  href="#pricing"
                  className="text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
                >
                  Pricing
                </a>
              </li>
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
            <Link href="/privacy" className="hover:text-[var(--lp-text)]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[var(--lp-text)]">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

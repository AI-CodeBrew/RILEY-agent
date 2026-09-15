import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Dialcom",
  description: "Terms governing use of the Dialcom platform.",
};

const EFFECTIVE_DATE = "September 9, 2026";
const CONTACT_EMAIL = "dialcomai@gmail.com";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Back to Dialcom
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Effective date: {EFFECTIVE_DATE}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern access to and use of
              Dialcom, a CRM and voice-AI platform for managing leads, calls,
              and appointments (the &quot;Service&quot;). By creating an account or
              using the Service, you agree to these Terms on behalf of
              yourself and, if applicable, the business you represent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">1. Accounts</h2>
            <p className="mt-2">
              Accounts are created for a business (&quot;Customer&quot;) by an
              administrator, who may then create logins for individual sales
              agents. You&apos;re responsible for the accuracy of information
              provided and for maintaining the confidentiality of login
              credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Acceptable use</h2>
            <p className="mt-2">You agree not to use the Service to:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Place calls or send communications without a lawful basis to contact the recipient, or in violation of applicable telemarketing, robocall, or do-not-call laws (e.g. TCPA).</li>
              <li>Upload or process personal data you are not authorized to hold or contact.</li>
              <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Service or connected third-party accounts (Twilio, Vapi, Calendly, Zoom, Google, Stripe).</li>
              <li>Use the Service for any unlawful, fraudulent, or abusive purpose.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Customer data</h2>
            <p className="mt-2">
              As between Dialcom and the Customer, the Customer owns the lead
              and customer data it enters or imports into the Service, and is
              responsible for having the necessary rights and consents to
              contact those individuals. Dialcom processes this data solely
              to provide the Service, as described in our{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Connected third-party accounts</h2>
            <p className="mt-2">
              The Service integrates with third-party providers, including
              Twilio, Vapi, Calendly, Zoom, Google, Stripe, and Resend. When
              you connect a third-party account (e.g. Zoom or Calendly) from
              Settings, you authorize Dialcom to act on your behalf within
              that provider solely to perform the specific actions described
              in-app (e.g. creating a meeting for a confirmed appointment).
              Your use of each third-party service is also subject to that
              provider&apos;s own terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Billing</h2>
            <p className="mt-2">
              Paid plans are billed in advance on a recurring basis through
              Stripe. Fees are non-refundable except where required by law.
              You can cancel a subscription at any time from Settings; access
              continues until the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Availability</h2>
            <p className="mt-2">
              We aim to keep the Service available and reliable but do not
              guarantee uninterrupted access. Features that depend on
              third-party providers (telephony, video, scheduling, payments)
              may be affected by outages or changes on those providers&apos; end.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Termination</h2>
            <p className="mt-2">
              Either party may terminate an account at any time. We may
              suspend or terminate access if these Terms are violated,
              including unlawful use of calling or messaging features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Disclaimer &amp; limitation of liability</h2>
            <p className="mt-2">
              The Service is provided &quot;as is&quot; without warranties of any kind.
              To the maximum extent permitted by law, Dialcom is not liable
              for indirect, incidental, or consequential damages arising from
              use of the Service, including outcomes of calls placed or
              appointments booked through it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Changes to these Terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. Material changes
              will be reflected by updating the effective date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p className="mt-2">
              Questions about these Terms can be sent to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

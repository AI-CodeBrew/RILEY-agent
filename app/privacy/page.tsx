import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Dialcom",
  description: "How Dialcom collects, uses, and protects data.",
};

const EFFECTIVE_DATE = "September 9, 2026";
const CONTACT_EMAIL = "dialcomai@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Back to Dialcom
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Effective date: {EFFECTIVE_DATE}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <p>
              Dialcom (&quot;Dialcom&quot;, &quot;we&quot;, &quot;us&quot;) provides a CRM and
              voice-AI platform that helps lending and sales businesses manage
              leads, place and receive calls, and book appointments. This
              policy explains what data we collect through the Dialcom portal
              and connected integrations, why we collect it, and how it&apos;s
              protected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">1. Who this applies to</h2>
            <p className="mt-2">
              This policy covers (a) businesses and their staff (&quot;agents&quot;)
              who sign up for and use Dialcom, and (b) the leads/customers
              those agents contact through the platform, whose information is
              entered or imported by our customers as data controllers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Data we collect</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Account data:</strong> name, email, and login
                credentials for agents and admins, managed via Supabase
                Authentication.
              </li>
              <li>
                <strong>Customer/lead records:</strong> name, phone number,
                email, mailing address, and notes that an agent or admin
                enters or imports (e.g. via CSV upload) into their own book of
                business.
              </li>
              <li>
                <strong>Call data:</strong> call metadata (time, duration,
                outcome), recordings, and transcripts of calls placed through
                the platform, generated via our telephony and voice-AI
                providers.
              </li>
              <li>
                <strong>Appointment &amp; meeting data:</strong> scheduled
                times, calendar availability, and video-meeting join links
                generated when a booking is confirmed.
              </li>
              <li>
                <strong>Connected-account tokens:</strong> if an agent
                connects a third-party account (Calendly, Zoom, Google, or
                their own Twilio account) from Settings, we store the OAuth
                access/refresh tokens needed to act on their behalf. These
                are encrypted at rest before storage.
              </li>
              <li>
                <strong>Billing data:</strong> subscription and payment
                information is processed by Stripe; we do not store full card
                numbers ourselves.
              </li>
              <li>
                <strong>Usage data:</strong> basic technical data (e.g.
                session cookies) needed to keep you signed in and the app
                functioning.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. How we use this data</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>To operate the core product: placing/receiving calls, scheduling appointments, and creating video-meeting links.</li>
              <li>To let an agent see and manage their own book of business, and let admins manage their team.</li>
              <li>To send appointment confirmation emails to the leads a customer is contacting.</li>
              <li>To process subscription payments.</li>
              <li>To maintain the security, integrity, and reliability of the service.</li>
            </ul>
            <p className="mt-2">We do not sell personal data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Third parties we share data with</h2>
            <p className="mt-2">
              We rely on the following service providers to operate Dialcom.
              Each only receives the data needed to perform its function:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li><strong>Supabase</strong> — database, authentication, and backend hosting.</li>
              <li><strong>Twilio</strong> — telephony (placing and receiving calls).</li>
              <li><strong>Vapi</strong> — voice-AI call handling, transcription, and recording.</li>
              <li><strong>Calendly</strong> — appointment scheduling and availability.</li>
              <li><strong>Zoom and Google Meet</strong> — creating video-meeting links for confirmed appointments, when an agent connects their own account.</li>
              <li><strong>Resend</strong> — transactional email (appointment confirmations).</li>
              <li><strong>Stripe</strong> — subscription billing and payment processing.</li>
              <li><strong>Vercel</strong> — application hosting.</li>
            </ul>
            <p className="mt-2">
              We do not share data with these providers for their own
              marketing purposes, and we do not sell or rent personal data to
              third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Zoom integration specifically</h2>
            <p className="mt-2">
              When an agent connects their Zoom account from Settings, we
              request only the minimum OAuth scopes needed to (a) confirm
              which Zoom account is connected, and (b) create a scheduled
              Zoom meeting when a customer confirms a booked appointment. We
              do not access an agent&apos;s existing meetings, recordings, contacts,
              or any other Zoom data beyond what&apos;s needed for these two
              actions. Access/refresh tokens are encrypted before storage, and
              an agent can disconnect Zoom from Settings at any time, which
              removes the stored tokens.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Data retention</h2>
            <p className="mt-2">
              We retain account, customer, call, and appointment data for as
              long as the related business account is active, or as needed to
              comply with legal obligations. A business can request deletion
              of their account and associated data at any time by contacting
              us below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Security</h2>
            <p className="mt-2">
              Access to customer data is scoped so agents only see their own
              book of business; admins see their whole team. Connected-account
              tokens (Calendly, Zoom, Twilio) are encrypted before they&apos;re
              stored. Data is transmitted over encrypted (HTTPS) connections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Your rights</h2>
            <p className="mt-2">
              Depending on your location, you may have the right to access,
              correct, or delete your personal data, or to object to certain
              processing. To make a request, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Children&apos;s privacy</h2>
            <p className="mt-2">
              Dialcom is a business tool and is not directed at children. We
              do not knowingly collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Changes to this policy</h2>
            <p className="mt-2">
              We may update this policy from time to time. Material changes
              will be reflected by updating the effective date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Contact us</h2>
            <p className="mt-2">
              Questions about this policy or your data can be sent to{" "}
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

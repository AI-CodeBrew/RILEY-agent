import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Dialcom",
  description: "How Dialcom collects, uses, and protects data.",
};

const EFFECTIVE_DATE = "September 26, 2026";
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
                enters or imports (e.g. via CSV upload or a connected Google
                Sheet) into their own book of business.
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
                <strong>Google user data:</strong> limited data from an
                agent&apos;s Google account when they connect Google Sheets or
                Google Meet. Exactly what we access, and how we use, share,
                protect, and delete it, is described in Section 6.
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
              <li>To import new leads from a Google Sheet the agent has selected, so the agent&apos;s AI assistant can call them.</li>
              <li>To create a Google Meet link for an appointment booked on the agent&apos;s behalf, when the agent has connected Google Meet.</li>
              <li>To let an agent see and manage their own book of business, and let admins manage their team.</li>
              <li>To send appointment confirmation emails and reminders to the leads a customer is contacting.</li>
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
              <li><strong>Twilio</strong> — telephony (placing and receiving calls) and SMS appointment reminders.</li>
              <li>
                <strong>Vapi</strong> — voice-AI call handling, transcription, and
                recording. Within a call, Vapi uses <strong>OpenAI</strong> (language
                model), <strong>Deepgram</strong> (speech-to-text), and{" "}
                <strong>Cartesia</strong> (text-to-speech) to run the conversation.
              </li>
              <li><strong>Calendly</strong> — appointment scheduling and availability.</li>
              <li><strong>Zoom</strong> — creating video-meeting links for confirmed appointments, when an agent connects their own account.</li>
              <li><strong>Resend</strong> — transactional email (appointment confirmations).</li>
              <li><strong>Stripe</strong> — subscription billing and payment processing.</li>
              <li><strong>Vercel</strong> — application hosting.</li>
            </ul>
            <p className="mt-2">
              We do not share data with these providers for their own
              marketing purposes, and we do not sell or rent personal data to
              third parties. How Google user data specifically flows through
              these providers is described in Section 6.
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
            <h2 className="text-lg font-semibold">6. Google user data</h2>
            <p className="mt-2">
              Dialcom offers two optional Google integrations, each connected
              separately by an agent from Settings: <strong>Google Sheets lead
              import</strong> and <strong>Google Meet</strong> video links. We never
              access Google user data unless the agent has connected the
              relevant integration.
            </p>

            <h3 className="mt-4 font-semibold">6.1 Scopes we request</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <code>https://www.googleapis.com/auth/drive.file</code> (Google
                Sheets lead import) — lets the agent choose one spreadsheet with
                Google Picker and lets Dialcom read only that file. We use this
                instead of broader Drive or Sheets scopes so that Dialcom cannot
                see, search, or open any other file in the agent&apos;s Drive.
              </li>
              <li>
                <code>https://www.googleapis.com/auth/meetings.space.created</code>{" "}
                (Google Meet) — lets Dialcom create a new Google Meet meeting space
                for a booked appointment. It only covers meeting spaces Dialcom
                itself creates.
              </li>
              <li>
                <code>https://www.googleapis.com/auth/userinfo.email</code> (both
                integrations) — lets us show the agent which Google account is
                connected.
              </li>
            </ul>

            <h3 className="mt-4 font-semibold">6.2 Data we access</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Google Sheets:</strong> the name and ID of the single
                spreadsheet the agent selects, its column headers (so the agent
                can map which column holds the lead&apos;s name, phone, email,
                and call type), and new rows added to it. We read the sheet
                periodically to pick up newly added rows. From each new row we
                store only the mapped values — the lead&apos;s name, phone
                number, email, and call type — as a lead in the agent&apos;s
                account. Our access is read-only: Dialcom never edits, creates,
                or deletes anything in the sheet or anywhere in Google Drive.
              </li>
              <li>
                <strong>Google Meet:</strong> when an appointment is booked, we
                create a new Meet meeting space and store its join link with that
                appointment. We do not access the agent&apos;s Google Calendar,
                contacts, existing meetings, recordings, or any other Google data.
              </li>
              <li>
                <strong>Both:</strong> the email address of the connected Google
                account, and the OAuth tokens needed to act on the agent&apos;s
                behalf.
              </li>
            </ul>

            <h3 className="mt-4 font-semibold">6.3 How we use it</h3>
            <p className="mt-2">
              Google user data is used only to provide the user-facing features
              the agent turned on: turning new sheet rows into leads that the
              agent&apos;s AI assistant calls, and giving booked appointments a
              Google Meet link. We do not use Google user data for advertising,
              for credit or lending decisions, or for any purpose unrelated to
              these features, and we do not sell it.
            </p>

            <h3 className="mt-4 font-semibold">6.4 Who we share it with</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Supabase</strong> stores leads, meeting links, and encrypted
                tokens as our database provider.
              </li>
              <li>
                When the agent&apos;s AI assistant calls a lead imported from Google
                Sheets, the lead&apos;s <strong>name, phone number, and email</strong>{" "}
                are sent to <strong>Vapi</strong> (and, through Vapi, to OpenAI,
                Deepgram, and Cartesia) and to <strong>Twilio</strong>, solely to
                place and conduct that call.
              </li>
              <li>
                A Google Meet join link is sent to the lead the appointment is with,
                by email through <strong>Resend</strong> and by SMS through{" "}
                <strong>Twilio</strong>.
              </li>
            </ul>
            <p className="mt-2">
              We do not share Google user data with anyone else, except where
              required by law. Our staff do not read Google user data unless the
              agent asks us to (for example, for support), it is needed for
              security purposes, or the law requires it.
            </p>

            <h3 className="mt-4 font-semibold">6.5 How we protect it</h3>
            <p className="mt-2">
              OAuth access and refresh tokens are encrypted at rest (AES-GCM)
              before storage, and all data is transmitted over encrypted (HTTPS)
              connections. Imported leads and meeting links are visible only to
              the agent who owns them and that agent&apos;s admins. Sheets access
              is limited to the one file the agent chose, and is read-only.
            </p>

            <h3 className="mt-4 font-semibold">6.6 Retention and deletion</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                When an agent disconnects Google Sheets or Google Meet in Settings,
                we immediately delete the stored OAuth tokens and Google account
                email for that integration. For Google Sheets, we keep the selected
                spreadsheet&apos;s ID and the agent&apos;s column mapping so that
                reconnecting doesn&apos;t require setting it up again; these are
                deleted on request.
              </li>
              <li>
                Leads already imported from a sheet become part of the agent&apos;s
                book of business. They stay until the agent deletes them in the
                portal, or until the account is deleted.
              </li>
              <li>
                Meeting links are kept with their appointment for as long as the
                appointment record exists.
              </li>
              <li>
                To have any of this deleted, including all data derived from Google,
                email {CONTACT_EMAIL}. We complete deletion requests within 30 days.
              </li>
              <li>
                Agents can also revoke Dialcom&apos;s access at any time from their
                Google Account at{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  myaccount.google.com/permissions
                </a>
                .
              </li>
            </ul>

            <h3 className="mt-4 font-semibold">6.7 Limited Use and AI/ML</h3>
            <p className="mt-2">
              Dialcom&apos;s use and transfer to any other app of information received from Google APIs will
              adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="mt-2">
              We do not use Google Workspace user data to develop, improve, or
              train generalized AI/ML models, and we do not transfer it to
              third-party AI services for their model training. The AI providers
              listed in Section 6.4 process a lead&apos;s name, phone number, and
              email only to conduct the call the agent requested.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Data retention</h2>
            <p className="mt-2">
              We retain account, customer, call, and appointment data for as
              long as the related business account is active, or as needed to
              comply with legal obligations. A business can request deletion
              of their account and associated data at any time by contacting
              us below. Google user data follows the more specific rules in
              Section 6.6.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Security</h2>
            <p className="mt-2">
              Access to customer data is scoped so agents only see their own
              book of business; admins see their whole team. Connected-account
              tokens (Calendly, Zoom, Google, Twilio) are encrypted before
              they&apos;re stored. Data is transmitted over encrypted (HTTPS)
              connections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Your rights</h2>
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
            <h2 className="text-lg font-semibold">10. Children&apos;s privacy</h2>
            <p className="mt-2">
              Dialcom is a business tool and is not directed at children. We
              do not knowingly collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Changes to this policy</h2>
            <p className="mt-2">
              We may update this policy from time to time. Material changes
              will be reflected by updating the effective date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">12. Contact us</h2>
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

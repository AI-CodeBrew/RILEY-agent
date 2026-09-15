import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Zoom Integration Guide — Dialcom",
  description: "How to add, use, and remove the Dialcom Zoom integration.",
};

export default function ZoomIntegrationDocsPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Back to Dialcom
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Zoom Integration Guide</h1>
        <p className="mt-2 text-sm text-muted">
          What the Dialcom + Zoom integration does, and how to add, use, and
          remove it.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-lg font-semibold">What it does</h2>
            <p className="mt-2">
              Dialcom is a CRM and voice-AI platform that books appointments
              for sales agents. When an agent uses local availability
              scheduling (Calendar &rarr; Availability, instead of Calendly)
              and a customer confirms an appointment, Dialcom can
              automatically create a scheduled Zoom meeting and attach the
              join link to that appointment, using the agent&apos;s own
              connected Zoom account.
            </p>
            <p className="mt-2">
              We request only two things from Zoom: the connected account&apos;s
              email (to show the agent which account is linked), and
              permission to create a scheduled meeting on that account. We do
              not read an agent&apos;s existing meetings, recordings, or
              contacts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Adding the integration</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Sign in to your Dialcom account at <code>dialcom.ai/login</code>.</li>
              <li>Go to <strong>Settings</strong>.</li>
              <li>Find the <strong>Zoom</strong> section (shows a &quot;Not connected&quot; badge).</li>
              <li>Click <strong>Connect with Zoom</strong>.</li>
              <li>You&apos;ll be taken to Zoom&apos;s own sign-in and consent screen. Sign in and approve access.</li>
              <li>You&apos;re redirected back to Dialcom Settings, where the Zoom section now shows a green <strong>Connected</strong> badge and the connected account&apos;s email.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Using the integration</h2>
            <p className="mt-2">
              Once connected, nothing further is required. When a customer
              confirms a locally-scheduled appointment with that agent,
              Dialcom automatically creates a Zoom meeting for the booked
              time and shows the join link on the appointment in{" "}
              <strong>Appointments</strong> and <strong>Calendar</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Removing the integration</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Sign in to your Dialcom account and go to <strong>Settings</strong>.</li>
              <li>In the <strong>Zoom</strong> section, click <strong>Disconnect Zoom</strong>.</li>
              <li>Dialcom deletes the stored Zoom access tokens immediately. The Zoom section reverts to &quot;Not connected&quot;, and future appointments will no longer get a Zoom link until reconnected.</li>
            </ol>
            <p className="mt-2">
              You can also remove Dialcom&apos;s access directly from your Zoom
              account under Zoom&apos;s{" "}
              <a
                href="https://marketplace.zoom.us/user/installed"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Installed Apps
              </a>{" "}
              settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Support</h2>
            <p className="mt-2">
              Questions about this integration can be sent to{" "}
              <a href="mailto:dialcomai@gmail.com" className="text-accent hover:underline">
                dialcomai@gmail.com
              </a>. See also our{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="text-accent hover:underline">
                Terms of Service
              </Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

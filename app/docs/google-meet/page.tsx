import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Google Meet Integration Guide — Dialcom",
  description: "How to add, use, and remove the Dialcom Google Meet integration.",
};

export default function GoogleMeetIntegrationDocsPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Back to Dialcom
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Google Meet Integration Guide</h1>
        <p className="mt-2 text-sm text-muted">
          What the Dialcom + Google Meet integration does, and how to add,
          use, and remove it.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-lg font-semibold">What it does</h2>
            <p className="mt-2">
              Dialcom is a CRM and voice-AI platform that books appointments
              for sales agents. When an agent uses local availability
              scheduling (Calendar &rarr; Availability, instead of Calendly)
              and a customer confirms an appointment, Dialcom can
              automatically create a Google Meet video call (via the Google
              Meet API) and show that join link on the appointment, using
              the agent&apos;s own connected Google account.
            </p>
            <p className="mt-2">
              We request only two things from Google: the connected
              account&apos;s email (to show the agent which account is
              linked), and permission to create a Google Meet call. We do
              not read an agent&apos;s Google Calendar, existing meetings,
              contacts, or any other Google data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Adding the integration</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Sign in to your Dialcom account at <code>dialcom.ai/login</code>.</li>
              <li>Go to <strong>Settings</strong>.</li>
              <li>Find the <strong>Google Meet</strong> section (shows a &quot;Not connected&quot; badge).</li>
              <li>Click <strong>Connect with Google</strong>.</li>
              <li>You&apos;ll be taken to Google&apos;s own sign-in and consent screen. Sign in and approve access.</li>
              <li>You&apos;re redirected back to Dialcom Settings, where the Google Meet section now shows a green <strong>Connected</strong> badge and the connected account&apos;s email.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Using the integration</h2>
            <p className="mt-2">
              Once connected, nothing further is required. When a customer
              confirms a locally-scheduled appointment with that agent,
              Dialcom automatically creates a Google Meet call and shows the
              join link on the appointment in <strong>Appointments</strong>{" "}
              and <strong>Calendar</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Removing the integration</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Sign in to your Dialcom account and go to <strong>Settings</strong>.</li>
              <li>In the <strong>Google Meet</strong> section, click <strong>Disconnect Google Meet</strong>.</li>
              <li>Dialcom deletes the stored Google access tokens immediately. The Google Meet section reverts to &quot;Not connected&quot;, and future appointments will no longer get a Meet link until reconnected.</li>
            </ol>
            <p className="mt-2">
              You can also remove Dialcom&apos;s access directly from your
              Google account under{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Google Account &rarr; Security &rarr; Third-party access
              </a>.
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

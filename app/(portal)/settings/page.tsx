import { CalendarCheck, Phone, ShieldCheck, User } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "./ProfileForm";
import { CalendlyConnection } from "./CalendlyConnection";
import { PasswordForm } from "./PasswordForm";
import { PhoneNumberPanel } from "./PhoneNumberPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const { agent } = session;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          session.isAdmin
            ? "Your profile and password. Calendly and outbound numbers belong to the agents who sell on them."
            : "Your profile, your outbound number, and the Calendly account Riley books into."
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-accent" />
            Profile
          </h2>
          <ProfileForm
            agent={{
              id: agent.id,
              name: agent.name,
              email: agent.email,
              phone: agent.phone,
              timezone: agent.timezone,
            }}
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Password
          </h2>
          <PasswordForm />
        </Card>

        {/* Admins observe the whole account; they don't sell, so they have no
            calendar to book into and no number to dial from. */}
        {!session.isAdmin && (
          <>
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck className="h-4 w-4 text-accent" />
                Calendly
              </h2>
              <CalendlyConnection
                agent={{
                  id: agent.id,
                  calendlyUrl: agent.calendly_url,
                  connected: Boolean(agent.calendly_user_uri),
                  webhooksActive: Boolean(agent.calendly_webhook_uri),
                }}
              />
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Phone className="h-4 w-4 text-accent" />
                Outbound number
              </h2>
              <PhoneNumberPanel
                agentId={agent.id}
                phoneNumber={agent.vapi_phone_number}
                connected={Boolean(agent.vapi_phone_number_id)}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

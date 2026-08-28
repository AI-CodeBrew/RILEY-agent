import { CalendarCheck, KeyRound, MapPinned, Phone, ShieldCheck, User, Video } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { syncAgentPhoneNumbers } from "@/lib/agent-vapi-phone";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "./ProfileForm";
import { CalendlyConnection } from "./CalendlyConnection";
import { PasswordForm } from "./PasswordForm";
import { PhoneNumberPanel } from "./PhoneNumberPanel";
import { NumberRoutingPanel } from "./NumberRoutingPanel";
import { TwilioConnection } from "./TwilioConnection";
import { ZoomConnection } from "./ZoomConnection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const { agent } = session;

  let connectedNumbers: { id: string; phoneNumber: string }[] = [];
  let numberRoutes: { region: string; phone_number_id: string }[] = [];
  if (!session.isAdmin) {
    await syncAgentPhoneNumbers(agent.id);
    const [{ data: numberRows }, { data: routeRows }] = await Promise.all([
      supabaseAdmin
        .from("agent_phone_numbers")
        .select("id, phone_number")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("agent_number_routes")
        .select("region, phone_number_id")
        .eq("agent_id", agent.id),
    ]);
    connectedNumbers = (numberRows ?? []).map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
    }));
    numberRoutes = routeRows ?? [];
  }

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
              <PhoneNumberPanel agentId={agent.id} numbers={connectedNumbers} />
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-accent" />
                Twilio account
              </h2>
              <TwilioConnection
                agent={{
                  id: agent.id,
                  connected: Boolean(agent.twilio_account_sid),
                  accountName: agent.twilio_account_name,
                  accountSid: agent.twilio_account_sid,
                }}
              />
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Video className="h-4 w-4 text-accent" />
                Zoom
              </h2>
              <ZoomConnection
                agent={{
                  id: agent.id,
                  connected: Boolean(agent.zoom_access_token),
                  accountEmail: agent.zoom_account_email,
                }}
              />
            </Card>
          </>
        )}
      </div>

      {!session.isAdmin && (
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <MapPinned className="h-4 w-4 text-accent" />
            Number routing by region
          </h2>
          <NumberRoutingPanel
            agentId={agent.id}
            numbers={connectedNumbers}
            initialRoutes={numberRoutes}
          />
        </Card>
      )}
    </div>
  );
}

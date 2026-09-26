import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { syncAgentPhoneNumbers } from "@/lib/agent-vapi-phone";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLandingPageContent } from "@/lib/landing-content";
import type { GoogleSheetConnection } from "@/types/database";
import {
  getBillingAccount,
  secondsUsedThisPeriod,
  listBillingOverview,
  PLAN_MINUTE_CAP,
  TRIAL_MINUTE_CAP,
} from "@/lib/billing";
import { PageHeader } from "@/components/PageHeader";
import { SettingsPanels } from "./SettingsPanels";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const { agent } = session;

  let connectedNumbers: { id: string; phoneNumber: string }[] = [];
  let numberRoutes: { region: string; phone_number_id: string }[] = [];
  let googleSheetsConnection: GoogleSheetConnection | null = null;
  if (!session.isAdmin) {
    await syncAgentPhoneNumbers(agent.id);
    const [{ data: numberRows }, { data: routeRows }, { data: sheetRow }] = await Promise.all([
      supabaseAdmin
        .from("agent_phone_numbers")
        .select("id, phone_number")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("agent_number_routes")
        .select("region, phone_number_id")
        .eq("agent_id", agent.id),
      supabaseAdmin
        .from("google_sheet_connections")
        .select("*")
        .eq("agent_id", agent.id)
        .maybeSingle(),
    ]);
    connectedNumbers = (numberRows ?? []).map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
    }));
    numberRoutes = routeRows ?? [];
    googleSheetsConnection = sheetRow;
  }

  const googleSheetsState = !googleSheetsConnection
    ? "not_connected"
    : googleSheetsConnection.status;

  const landingContent = session.isAdmin ? await getLandingPageContent() : null;

  const billingAccount = !session.isAdmin ? await getBillingAccount(agent.id) : null;
  const billingUsedSeconds = billingAccount ? await secondsUsedThisPeriod(billingAccount) : 0;
  const billingPlanForCap = billingAccount?.plan ?? "standard";
  const billingCapSeconds =
    billingPlanForCap === "trial"
      ? TRIAL_MINUTE_CAP * 60
      : PLAN_MINUTE_CAP[billingPlanForCap] * 60;
  const billingOverview = session.isAdmin ? await listBillingOverview() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          session.isAdmin
            ? "Your profile and password, plus a read-only view of each agent's subscription."
            : "Manage your profile and connect the apps Riley uses to call and book."
        }
      />

      <Suspense fallback={null}>
        <SettingsPanels
          isAdmin={session.isAdmin}
          agent={{
            id: agent.id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            timezone: agent.timezone,
            calendlyUrl: agent.calendly_url,
            calendlyConnected: Boolean(agent.calendly_user_uri),
            calendlyWebhooksActive: Boolean(agent.calendly_webhook_uri),
            twilioConnected: Boolean(agent.twilio_account_sid),
            twilioAccountName: agent.twilio_account_name,
            twilioAccountSid: agent.twilio_account_sid,
            zoomConnected: Boolean(agent.zoom_access_token),
            zoomAccountEmail: agent.zoom_account_email,
            googleMeetConnected: Boolean(agent.google_access_token),
            googleMeetAccountEmail: agent.google_account_email,
          }}
          connectedNumbers={connectedNumbers}
          numberRoutes={numberRoutes}
          googleSheets={{
            id: agent.id,
            state: googleSheetsState,
            accountEmail: googleSheetsConnection?.google_account_email ?? null,
            spreadsheetName: googleSheetsConnection?.spreadsheet_name ?? null,
            nameColumn: googleSheetsConnection?.name_column ?? null,
            phoneColumn: googleSheetsConnection?.phone_column ?? null,
            emailColumn: googleSheetsConnection?.email_column ?? null,
            lastSyncedAt: googleSheetsConnection?.last_synced_at ?? null,
          }}
          billing={
            session.isAdmin
              ? null
              : {
                  status: billingAccount?.status ?? "incomplete",
                  plan: billingAccount?.plan ?? null,
                  currentPeriodEnd: billingAccount?.current_period_end ?? null,
                  trialEndsAt: billingAccount?.trial_ends_at ?? null,
                  usedSeconds: billingUsedSeconds,
                  capSeconds: billingCapSeconds,
                  grantedByAdmin: billingAccount?.granted_by_admin ?? false,
                }
          }
          billingOverview={billingOverview}
          planMinuteCap={PLAN_MINUTE_CAP}
          trialMinuteCap={TRIAL_MINUTE_CAP}
          landingContent={landingContent}
        />
      </Suspense>
    </div>
  );
}

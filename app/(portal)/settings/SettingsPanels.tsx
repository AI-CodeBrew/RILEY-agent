"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  MapPinned,
  MonitorPlay,
  Phone,
  Puzzle,
  ShieldCheck,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/Card";
import { cn } from "@/lib/cn";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { CalendlyConnection } from "./CalendlyConnection";
import { TwilioConnection } from "./TwilioConnection";
import { PhoneNumberPanel } from "./PhoneNumberPanel";
import { NumberRoutingPanel } from "./NumberRoutingPanel";
import { ZoomConnection } from "./ZoomConnection";
import { GoogleMeetConnection } from "./GoogleMeetConnection";
import { GoogleSheetsConnection, type GoogleSheetsAgentInfo } from "./GoogleSheetsConnection";
import { BillingPanel } from "./BillingPanel";
import { AdminBillingOverview } from "./AdminBillingOverview";
import { LandingPagePanel } from "./LandingPagePanel";
import type { LandingPageContent } from "@/types/database";
import type { BillingAccount, BillingPlan, BillingStatus } from "@/types/database";

export type SettingsTab = "profile" | "integrations";

export type IntegrationId =
  | "calendly"
  | "twilio"
  | "zoom"
  | "google_meet"
  | "google_sheets";

type IntegrationMeta = {
  id: IntegrationId;
  name: string;
  description: string;
  icon: LucideIcon;
};

const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: "calendly",
    name: "Calendly",
    description: "Book appointments on your real calendar availability.",
    icon: CalendarCheck,
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Your Twilio account for outbound calling and SMS.",
    icon: KeyRound,
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Add Zoom meeting links to locally booked appointments.",
    icon: Video,
  },
  {
    id: "google_meet",
    name: "Google Meet",
    description: "Create Google Calendar events with Meet links attached.",
    icon: Video,
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Import leads from a spreadsheet into your customer list.",
    icon: FileSpreadsheet,
  },
];

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={
        connected
          ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-500"
      }
    >
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export function SettingsPanels({
  isAdmin,
  agent,
  connectedNumbers,
  numberRoutes,
  googleSheets,
  billing,
  billingOverview,
  planMinuteCap,
  trialMinuteCap,
  landingContent,
}: {
  isAdmin: boolean;
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    timezone: string;
    calendlyUrl: string | null;
    calendlyConnected: boolean;
    calendlyWebhooksActive: boolean;
    twilioConnected: boolean;
    twilioAccountName: string | null;
    twilioAccountSid: string | null;
    zoomConnected: boolean;
    zoomAccountEmail: string | null;
    googleMeetConnected: boolean;
    googleMeetAccountEmail: string | null;
  };
  connectedNumbers: { id: string; phoneNumber: string }[];
  numberRoutes: { region: string; phone_number_id: string }[];
  googleSheets: GoogleSheetsAgentInfo;
  billing: {
    status: BillingStatus;
    plan: BillingPlan | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    usedSeconds: number;
    capSeconds: number;
    grantedByAdmin: boolean;
  } | null;
  billingOverview: Array<{
    agent: { id: string; name: string; email: string };
    account: BillingAccount | null;
    usedHours: number;
  }> | null;
  planMinuteCap: Record<"standard" | "with_calendar", number>;
  trialMinuteCap: number;
  landingContent: LandingPageContent | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const connectedById = useMemo<Record<IntegrationId, boolean>>(
    () => ({
      calendly: agent.calendlyConnected,
      twilio: agent.twilioConnected,
      zoom: agent.zoomConnected,
      google_meet: agent.googleMeetConnected,
      google_sheets: googleSheets.state !== "not_connected",
    }),
    [agent, googleSheets.state]
  );

  const [tab, setTab] = useState<SettingsTab>("profile");
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationId | null>(null);

  // OAuth / billing redirects land on /settings with query flags — open the
  // right tab (and integration detail) so the toast/connect UI is visible.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const integrationParam = searchParams.get("integration") as IntegrationId | null;
    if (tabParam === "integrations" || tabParam === "profile") {
      setTab(tabParam);
    }
    if (
      integrationParam &&
      INTEGRATIONS.some((item) => item.id === integrationParam)
    ) {
      setTab("integrations");
      setSelectedIntegration(integrationParam);
    }
    if (searchParams.get("zoom")) {
      setTab("integrations");
      setSelectedIntegration("zoom");
    }
    if (searchParams.get("google_meet")) {
      setTab("integrations");
      setSelectedIntegration("google_meet");
    }
    if (searchParams.get("google_sheets")) {
      setTab("integrations");
      setSelectedIntegration("google_sheets");
    }
    if (searchParams.get("billing")) {
      setTab("profile");
    }
  }, [searchParams]);

  function selectTab(next: SettingsTab) {
    setTab(next);
    if (next === "profile") setSelectedIntegration(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    if (next === "profile") url.searchParams.delete("integration");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  function openIntegration(id: IntegrationId) {
    setSelectedIntegration(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "integrations");
    url.searchParams.set("integration", id);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  function backToIntegrationsList() {
    setSelectedIntegration(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "integrations");
    url.searchParams.delete("integration");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  const selectedMeta = INTEGRATIONS.find((item) => item.id === selectedIntegration);
  const SelectedIcon = selectedMeta?.icon;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(
          [
            { id: "profile" as const, label: "Profile", icon: User },
            { id: "integrations" as const, label: "Integrations", icon: Puzzle },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-background hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "profile" ? (
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

          {!isAdmin && billing && (
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-accent" />
                Billing
              </h2>
              <BillingPanel
                status={billing.status}
                plan={billing.plan}
                currentPeriodEnd={billing.currentPeriodEnd}
                trialEndsAt={billing.trialEndsAt}
                usedSeconds={billing.usedSeconds}
                capSeconds={billing.capSeconds}
                grantedByAdmin={billing.grantedByAdmin}
              />
            </Card>
          )}

          {!isAdmin && (
            <Card className="p-5 lg:col-span-2">
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

          {isAdmin && billingOverview && (
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-accent" />
                Billing — all agents
              </h2>
              <AdminBillingOverview
                accounts={billingOverview}
                planMinuteCap={planMinuteCap}
                trialMinuteCap={trialMinuteCap}
              />
            </Card>
          )}

          {isAdmin && landingContent && (
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <MonitorPlay className="h-4 w-4 text-accent" />
                Manage landing page
              </h2>
              <LandingPagePanel content={landingContent} />
            </Card>
          )}
        </div>
      ) : isAdmin ? (
        <Card className="p-8 text-center">
          <Puzzle className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm font-medium">Admins have no integrations of their own</p>
          <p className="mt-1 text-xs text-muted">
            Calendly, Twilio, Zoom, and the rest are connected per selling agent.
          </p>
        </Card>
      ) : selectedIntegration && selectedMeta && SelectedIcon ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={backToIntegrationsList}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All integrations
          </button>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <SelectedIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{selectedMeta.name}</h2>
                  <StatusPill connected={connectedById[selectedIntegration]} />
                </div>
                <p className="text-xs text-muted">{selectedMeta.description}</p>
              </div>
            </div>

            {selectedIntegration === "calendly" && (
              <CalendlyConnection
                agent={{
                  id: agent.id,
                  calendlyUrl: agent.calendlyUrl,
                  connected: agent.calendlyConnected,
                  webhooksActive: agent.calendlyWebhooksActive,
                }}
              />
            )}

            {selectedIntegration === "twilio" && (
              <div className="space-y-6">
                <TwilioConnection
                  agent={{
                    id: agent.id,
                    connected: agent.twilioConnected,
                    accountName: agent.twilioAccountName,
                    accountSid: agent.twilioAccountSid,
                  }}
                />
                <div className="border-t border-border pt-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Phone className="h-4 w-4 text-accent" />
                    Outbound number
                  </h3>
                  <PhoneNumberPanel
                    agentId={agent.id}
                    numbers={connectedNumbers}
                    twilioConnected={agent.twilioConnected}
                  />
                </div>
              </div>
            )}

            {selectedIntegration === "zoom" && (
              <ZoomConnection
                agent={{
                  id: agent.id,
                  connected: agent.zoomConnected,
                  accountEmail: agent.zoomAccountEmail,
                }}
              />
            )}

            {selectedIntegration === "google_meet" && (
              <GoogleMeetConnection
                agent={{
                  id: agent.id,
                  connected: agent.googleMeetConnected,
                  accountEmail: agent.googleMeetAccountEmail,
                }}
              />
            )}

            {selectedIntegration === "google_sheets" && (
              <GoogleSheetsConnection agent={googleSheets} />
            )}
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openIntegration(item.id)}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-accent/40 hover:bg-accent-soft/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <StatusPill connected={connectedById[item.id]} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

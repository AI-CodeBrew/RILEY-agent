export type CustomerStatus =
  | "new"
  | "call_scheduled"
  | "calling"
  | "contacted"
  | "appointment_set"
  | "follow_up"
  | "no_answer"
  | "not_interested"
  | "do_not_call"
  | "sold";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show";

export type CallOutcome =
  | "appointment_set"
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "call_back_later"
  | "error"
  | "sold"
  | null;

/** Manually-settable outcomes an agent can correct a call to from the portal — mirrors calls_outcome_check. */
export const CALL_OUTCOMES = [
  "appointment_set",
  "no_answer",
  "voicemail",
  "not_interested",
  "call_back_later",
  "error",
  "sold",
] as const satisfies readonly Exclude<CallOutcome, null>[];

/** Live state of the Vapi call, mirrored so the portal can cancel/hang up. */
export type CallStatus =
  | "scheduled"
  | "queued"
  | "ringing"
  | "in_progress"
  | "ended"
  | "canceled"
  | "failed";

/** Statuses where a call hasn't finished yet, so it can still be canceled. */
export const LIVE_CALL_STATUSES = [
  "scheduled",
  "queued",
  "ringing",
  "in_progress",
] as const satisfies readonly CallStatus[];

/** Which script a customer's call follows. Mirrors SalesAgent.default_script — see 00000000000015_agent_ai_integration_defaults.sql. */
export type CallType = "POS" | "UNION" | "WILL_KIT" | "ASSOCIATION";

export const CALL_TYPES = [
  "POS",
  "UNION",
  "WILL_KIT",
  "ASSOCIATION",
] as const satisfies readonly CallType[];

/** What the assistant calls itself on a call. Separate from the human agentName (the virtual director) — see 00000000000021_agent_bot_name.sql. */
export type BotName =
  | "Abby"
  | "Alex"
  | "Tom"
  | "Sarah"
  | "Emma"
  | "Rachel"
  | "Emily"
  | "Lauren"
  | "Ryan"
  | "Daniel"
  | "James"
  | "Michael";

export const BOT_NAMES = [
  "Abby",
  "Alex",
  "Tom",
  "Sarah",
  "Emma",
  "Rachel",
  "Emily",
  "Lauren",
  "Ryan",
  "Daniel",
  "James",
  "Michael",
] as const satisfies readonly BotName[];

export type AgentRole = "agent" | "admin";

/** Where a self-registered agent sits in the admin's approval queue. */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** Where a self-learned rebuttal sits in its owning agent's review queue. */
export type RebuttalStatus = "unreviewed" | "approved" | "rejected";

// NB: these are `type`, not `interface` — postgrest-js's generic type
// resolution (ParseQuery / Simplify chains) fails to match interface types
// here and silently collapses query results to `never`. Keep these as type
// aliases even though interfaces would normally be preferred.

export const CUSTOMER_SOURCES = ["manual", "csv", "google_sheet"] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];
export type CustomerPriority = "normal" | "high";

export type Customer = {
  id: string;
  /** Full/display name — used for the greeting, avatar, and everywhere else in the app. Independent of first_name/middle_name/last_name below; never auto-derived from them. */
  name: string;
  phone: string;
  /** UI label: "Email Address". */
  email: string | null;
  status: CustomerStatus;
  /** Where this customer came from — 'csv' (Customers → Import), 'google_sheet' (Lead Import), or 'manual' (Add Customer form, and anyone created before this column existed). */
  source: CustomerSource;
  /** 'high' customers with status 'new' are dialed ahead of a campaign's own members (see lib/campaign.ts nextPriorityCustomer). Google Sheets leads are created 'high'. */
  priority: CustomerPriority;
  agent_id: string | null;
  company: string | null;
  notes: string | null;
  timezone: string | null;
  last_contacted_at: string | null;
  /** UI label: "First name". Structured name field, kept separate from `name` and from middle_name/last_name. */
  first_name: string | null;
  /** UI label: "Middle name". */
  middle_name: string | null;
  /** UI label: "Last name". */
  last_name: string | null;
  /** Will-kit campaign: what the lead told us when they requested the kit.
   * Riley only states these back on a call when they're actually set. */
  /** UI label: "State/Province". */
  province: string | null;
  /** UI label: "Requested # of Kit(s)". */
  kit_count: number | null;
  /** UI label: "Home Address". */
  mailing_address: string | null;
  /** UI label: "City". */
  city: string | null;
  /** UI label: "Postal Code". */
  postal_code: string | null;
  /** Date only (YYYY-MM-DD) — when the online request came in. */
  request_date: string | null;
  /** Date only (YYYY-MM-DD). Confirmed by Abby near the top of the call. UI label: "Date of Birth". */
  date_of_birth: string | null;
  /** Confirmed by Abby near the top of the call. UI label: "Beneficiary". */
  beneficiary_name: string | null;
  /** UI label: "Relationship" — the beneficiary's relationship to the customer. Kept separate from beneficiary_name. */
  relationship: string | null;
  /** UI label: "Home Telephone". Separate from `phone` (the number actually dialed) and cellular_phone. */
  home_telephone: string | null;
  /** UI label: "Cellular Phone Number". Separate from `phone` and home_telephone. */
  cellular_phone: string | null;
  /** UI label: "Shift". */
  shift: string | null;
  /** Read out during the write-down close; generated by the database. */
  confirmation_code: string | null;
  spouse_name: string | null;
  employment_status: string | null;
  household_type: string | null;
  /** UI label: "Best Time to Call". Settable by hand on the form, and also auto-filled from AI call insights after a call (see supabase/functions/_shared/resolve-call-outcome.ts) — an agent's manual entry can be overwritten by that existing pipeline. */
  preferred_meeting_time: string | null;
  follow_up_at: string | null;
  call_insights: Record<string, unknown> | null;
  last_call_summary: string | null;
  /** Attempts used in the *current* retry cycle — resets to 0 when a cycle exhausts retry_max_attempts and backs off, or when a fresh non-retry outcome clears the whole chain. */
  retry_count: number;
  /** When the auto-retry cron (app/api/cron/process-retries) should next dial this customer, or null if none is armed. */
  next_retry_at: string | null;
  /** Which auto-dial campaign originally started this retry chain — its own windows/end_date are what clamp when a retry can fire (see lib/campaign-schedule.ts). Null means no campaign placed the original call, so no auto-retry is scheduled. */
  retry_campaign_id: string | null;
  /** When the current run of follow_up/no_answer retry cycles began. Anchors sales_agents.retry_max_days; cleared on any fresh non-retry outcome. */
  retry_cycle_started_at: string | null;
  /** When the scheduled-recontact cron (app/api/cron/process-scheduled-recontacts) should next dial this customer, or null if no "Contact again" period is armed. Manually set from any status via ScheduleRecontactPanel — independent of the follow_up/no_answer auto-retry chain above. */
  next_contact_at: string | null;
  /** When this person became a client — read out by the bot. Nullable: not every existing customer has this on file. */
  customer_since: string | null;
  /** Which script Riley should follow on this customer's call. Null on customers created before this field existed. */
  call_type: CallType | null;
  created_at: string;
};

export type CustomerWithAgent = Customer & {
  agent: Pick<SalesAgent, "id" | "name" | "email"> | null;
};

export type SalesAgent = {
  id: string;
  name: string;
  email: string;
  role: AgentRole;
  is_active: boolean;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  auth_user_id: string | null;
  phone: string | null;
  timezone: string;
  calendly_url: string | null;
  calendly_access_token: string | null;
  calendly_user_uri: string | null;
  calendly_webhook_uri: string | null;
  calendly_webhook_signing_key: string | null;
  /** Agent's own Twilio account, connected from Settings — the source for both their outbound numbers and SMS. */
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_account_name: string | null;
  twilio_connected_at: string | null;
  /** @deprecated superseded by agent_phone_numbers — an agent can connect several. */
  vapi_phone_number_id: string | null;
  /** @deprecated superseded by agent_phone_numbers — an agent can connect several. */
  vapi_phone_number: string | null;
  /** @deprecated superseded by agent_phone_numbers — an agent can connect several. */
  twilio_phone_number_sid: string | null;
  /** Set on the AI Integration page. Pre-fills the voice pick on Call panel/list/campaigns; still overridable per call. */
  default_voice_gender: "male" | "female" | null;
  /** Set on the AI Integration page. Falls back to this when a customer has no call_type of their own — see lib/trigger-call.ts. */
  default_script: "POS" | "UNION" | "WILL_KIT" | null;
  /** Set on the AI Integration page. Falls back to the script's default persona when null — see lib/vapi.ts::resolveBotName. */
  bot_name: BotName | null;
  /** Max immediate-retry attempts per cycle before backing off to retry_cycle_delay_minutes. Attempts within a cycle are spaced call_gap_seconds apart — the same cadence used between different customers. */
  retry_max_attempts: number;
  /** Minutes to wait before starting another retry cycle once retry_max_attempts is exhausted. */
  retry_cycle_delay_minutes: number;
  /** Max number of days (from a customer's retry_cycle_started_at) auto-retry cycles keep running before giving up for good. */
  retry_max_days: number;
  /** How long to let an outbound call ring before hanging up as no_answer (9 or 10). Enforced at place-call via Twilio hangup + reconcile backstop. */
  ring_timeout_seconds: number;
  /** Default gap (seconds) between dialing different customers in a new auto-dial campaign (dial_campaigns.gap_seconds), and the delay between immediate-retry attempts within one retry cycle. */
  call_gap_seconds: number;
  /** Which video provider a locally-booked appointment (see AgentAvailabilityHour) gets its join link from. Null until the agent connects one — auto-set to whichever provider they connect first. */
  video_provider: "zoom" | "google_meet" | null;
  /** Agent's own Zoom account, connected via OAuth from Settings — used to create a real Zoom meeting link on locally-booked appointments. */
  zoom_access_token: string | null;
  zoom_refresh_token: string | null;
  zoom_token_expires_at: string | null;
  zoom_account_email: string | null;
  zoom_connected_at: string | null;
  /** Agent's own Google account, connected via OAuth from Settings — used to create a Google Calendar event (with a Meet link attached) on locally-booked appointments. */
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  google_account_email: string | null;
  google_connected_at: string | null;
  created_at: string;
};

/** Short-lived CSRF state for the Zoom/Google Meet OAuth redirect — issued when the agent starts the flow, consumed once by the provider's callback. */
export type OAuthState = {
  id: string;
  agent_id: string;
  provider: "zoom" | "google_meet" | "google_sheets";
  state: string;
  created_at: string;
  expires_at: string;
};

/** One outbound number an agent has connected — an agent may have several. */
export type AgentPhoneNumber = {
  id: string;
  agent_id: string;
  phone_number: string;
  twilio_phone_number_sid: string;
  vapi_phone_number_id: string;
  created_at: string;
};

/** Maps one of the 7 fixed Canadian regions (or "default") to a connected number — see lib/area-code-routing.ts. */
export type AgentNumberRoute = {
  id: string;
  agent_id: string;
  region: string;
  phone_number_id: string;
  created_at: string;
};

export type Appointment = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link: string | null;
  calendly_event_uri: string | null;
  booking_url: string | null;
  cancel_url: string | null;
  reschedule_url: string | null;
  source: "voice_agent" | "manual";
  notes: string | null;
  canceled_reason: string | null;
  canceled_at: string | null;
  status: AppointmentStatus;
  /** Set once the 1-hour-before SMS reminder goes out — stops send-appointment-reminders from resending. */
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentWithRelations = Appointment & {
  customer: Pick<Customer, "id" | "name" | "phone" | "email"> | null;
  agent: Pick<SalesAgent, "id" | "name" | "email"> | null;
};

export type Call = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  vapi_call_id: string | null;
  status: CallStatus;
  control_url: string | null;
  ended_reason: string | null;
  duration_seconds: number | null;
  cost: number | null;
  summary: string | null;
  scheduled_for: string | null;
  canceled_at: string | null;
  triggered_by: string | null;
  transcript: string | null;
  recording_url: string | null;
  outcome: CallOutcome;
  campaign_id: string | null;
  call_insights: Record<string, unknown> | null;
  /** Which connected number actually placed this call — resolved by area-code region routing. */
  phone_number_id: string | null;
  created_at: string;
};

export type CallWithRelations = Call & {
  customer: Pick<Customer, "id" | "name" | "phone"> | null;
  agent: Pick<SalesAgent, "id" | "name"> | null;
};

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "stopped"
  | "completed";

export type DialCampaign = {
  id: string;
  agent_id: string;
  status: CampaignStatus;
  /** Bare YYYY-MM-DD — the campaign runs every date in [start_date, end_date], during whichever of its dial_campaign_windows are active. */
  start_date: string;
  end_date: string;
  gap_seconds: number;
  current_customer_id: string | null;
  /** @deprecated each call now resolves its own number via area-code region routing (lib/number-routing.ts). */
  phone_number_id: string | null;
  /** Picked once when the agent starts the campaign; every call it places uses this voice. */
  voice_gender: "male" | "female" | null;
  /** IANA zone the agent's browser reported when the campaign was created — the windows below (and "today") are interpreted in this zone, not the account's stored sales_agents.timezone, so what the agent picked matches their own clock. Null for campaigns created before this existed, which fall back to the agent's account timezone. */
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

/** One daily calling window (schedule) for a campaign — a campaign has one or more, e.g. 8-11am and 4-8pm, applied to every date in its start_date..end_date range. Each window carries its own customer list (dial_campaign_customers.window_id) and, optionally, its own call type. */
export type DialCampaignWindow = {
  id: string;
  campaign_id: string;
  /** "HH:MM" or "HH:MM:SS", interpreted in the campaign's own timezone. */
  start_time: string;
  end_time: string;
  /** Overrides each dialed customer's own call_type/agent's default_script for calls placed in this window. Null defers to the usual per-customer/per-agent resolution. */
  call_type: CallType | null;
};

export type DialCampaignCustomer = {
  id: string;
  campaign_id: string;
  /** Which of the campaign's windows this customer belongs to — determines which schedule dials them, and (via that window's call_type) what script is used. Null only for rows created before per-window scoping existed. */
  window_id: string | null;
  customer_id: string;
  sort_order: number;
  status: "pending" | "dialing" | "completed" | "skipped";
};

/** An agent's connected lead-gen Google Sheet — see lib/google-sheets.ts and app/api/cron/process-sheet-leads. */
export type GoogleSheetConnection = {
  id: string;
  agent_id: string;
  google_refresh_token: string | null;
  google_account_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  /** Spreadsheet column letters ("A", "B", ...), resolved from header names once at mapping time. */
  name_column: string | null;
  phone_column: string | null;
  email_column: string | null;
  /** Optional sheet column holding the lead's call type (will_kit, union, ...). */
  call_type_column: string | null;
  last_row_synced: number;
  last_modified_time: string | null;
  last_synced_at: string | null;
  status: "pending" | "connected" | "disconnected";
  created_at: string;
  updated_at: string;
};

/**
 * A self-learned objection/answer pair. Logged as 'unreviewed' by the
 * log-new-rebuttal tool whenever the assistant improvises a reply to an
 * objection lookup-rebuttal didn't recognize; `agent_id` is who the draft is
 * shown to for review on the portal's Rebuttals page — approving it is what
 * generates `embedding` and makes it eligible for reuse on ANY agent's
 * future calls on the same `script` (lookup-rebuttal never filters by
 * agent_id, only script + status = 'approved').
 */
export type Rebuttal = {
  id: string;
  script: CallType;
  objection_text: string;
  answer_text: string;
  status: RebuttalStatus;
  /** Populated only on approval — never present on an unreviewed draft. */
  embedding: number[] | null;
  agent_id: string;
  source_call_id: string | null;
  times_matched: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
};

export type BillingPlan = "trial" | "standard" | "with_calendar";

export type BillingStatus = "incomplete" | "active" | "past_due" | "canceled";

/** One row per agent (see 00000000000044_per_agent_billing.sql) mirroring that agent's own Stripe subscription — each agent pays for and owns their own calling. See lib/billing.ts. */
export type BillingAccount = {
  id: string;
  agent_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: BillingPlan | null;
  status: BillingStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  /** True forever once this agent has ever completed a trial checkout — see 00000000000045_billing_plans_and_trial.sql. Never resets, even after they later move to a paid plan. */
  trial_used: boolean;
  /** Fixed at trial subscription creation (Stripe's own `subscription.trial_end`), never moves on renewal — the actual cutoff callBlockReason checks, independent of current_period_end. Null for non-trial plans. */
  trial_ends_at: string | null;
  /** True when an admin unlocked this plan for free instead of the agent paying through Stripe — see lib/billing.ts::grantFreePlan. Pre-launch stopgap only; stripe_customer_id/stripe_subscription_id stay null on a row like this. */
  granted_by_admin: boolean;
  updated_at: string;
  created_at: string;
};

/** Processed Stripe webhook event ids, so a retried delivery doesn't get applied twice — see app/api/stripe/webhook/route.ts. */
export type StripeWebhookEvent = {
  id: string;
  type: string;
  created_at: string;
};

/** One submission of the public landing page's "Contact Us" form — see app/api/contact/route.ts. Admins follow up directly by email/phone from the Contact Requests page rather than the app sending anything on its own. */
export type ContactRequest = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string | null;
  comment: string | null;
  created_at: string;
};

/** Which media slot an upload on the landing-page CMS panel targets. Mirrors the *_url/*_path column pairs on LandingPageContent. */
export type LandingContentSlot = "hero_image" | "demo_video" | "live_call_audio";

/** Single-row table backing the public marketing page's admin-editable media — see 00000000000037_landing_page_content.sql. */
export type LandingPageContent = {
  id: string;
  hero_image_url: string | null;
  hero_image_path: string | null;
  demo_video_url: string | null;
  demo_video_path: string | null;
  live_call_audio_url: string | null;
  live_call_audio_path: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** One row per change made on the AI Integration page — powers its "recent changes" history. */
export type AgentAiPreferenceChange = {
  id: string;
  agent_id: string;
  field: "voice_gender" | "script" | "bot_name";
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
};

/**
 * One weekly working-hours block on Calendar → Availability — a local
 * portal preference, not the source of truth for real bookable slots (that's
 * still the agent's connected Calendly account, see
 * supabase/functions/check-agent-availability). Kept in its own table with
 * this shape so an in-house availability engine can read it later without a
 * data-model change.
 */
export type AgentAvailabilityHour = {
  id: string;
  agent_id: string;
  /** 0 (Sun) – 6 (Sat), matching calendar-dates.ts WEEKDAY_LABELS. */
  weekday: number;
  /** "HH:MM:SS" (Postgres `time`). */
  start_time: string;
  end_time: string;
  created_at: string;
};

/** Enough about a teammate to render their profile card — used anywhere a forum post or reply's author name opens a profile. */
export type AgentProfileSummary = Pick<
  SalesAgent,
  "id" | "name" | "email" | "role" | "timezone" | "created_at"
>;

export type ForumCategory = "general" | "scripts" | "tech_support" | "wins";

/** A staff discussion topic — any approved agent or admin can start one. */
export type ForumTopic = {
  id: string;
  agent_id: string;
  title: string;
  body: string;
  category: ForumCategory;
  created_at: string;
};

export type ForumTopicWithAuthor = ForumTopic & {
  agent: AgentProfileSummary | null;
  reply_count: number;
  last_activity_at: string;
};

export type ForumReply = {
  id: string;
  topic_id: string;
  agent_id: string;
  body: string;
  created_at: string;
};

export type ForumReplyWithAuthor = ForumReply & {
  agent: AgentProfileSummary | null;
};

/** One agent-to-agent message. A "conversation" is just every row where the two participants match, in either direction — there's no separate thread row. */
export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type InboundCallStatus = "rejected" | "missed";

export type InboundCall = {
  id: string;
  agent_id: string | null;
  vapi_phone_number_id: string | null;
  called_number: string;
  caller_phone: string;
  caller_name: string | null;
  vapi_call_id: string | null;
  is_repeat: boolean;
  repeat_count: number;
  status: InboundCallStatus;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: Customer;
        Insert: Partial<Customer> & Pick<Customer, "name" | "phone">;
        Update: Partial<Customer>;
        Relationships: [
          {
            foreignKeyName: "customers_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_agents: {
        Row: SalesAgent;
        Insert: Partial<SalesAgent> & Pick<SalesAgent, "name" | "email">;
        Update: Partial<SalesAgent>;
        Relationships: [];
      };
      appointments: {
        Row: Appointment;
        Insert: Partial<Appointment> &
          Pick<Appointment, "customer_id" | "scheduled_at">;
        Update: Partial<Appointment>;
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: Call;
        Insert: Partial<Call> & Pick<Call, "customer_id">;
        Update: Partial<Call>;
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      dial_campaigns: {
        Row: DialCampaign;
        Insert: Partial<DialCampaign> &
          Pick<DialCampaign, "agent_id" | "start_date" | "end_date">;
        Update: Partial<DialCampaign>;
        Relationships: [
          {
            foreignKeyName: "dial_campaigns_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dial_campaigns_phone_number_id_fkey";
            columns: ["phone_number_id"];
            isOneToOne: false;
            referencedRelation: "agent_phone_numbers";
            referencedColumns: ["id"];
          },
        ];
      };
      dial_campaign_windows: {
        Row: DialCampaignWindow;
        Insert: Partial<DialCampaignWindow> &
          Pick<DialCampaignWindow, "campaign_id" | "start_time" | "end_time">;
        Update: Partial<DialCampaignWindow>;
        Relationships: [
          {
            foreignKeyName: "dial_campaign_windows_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "dial_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_phone_numbers: {
        Row: AgentPhoneNumber;
        Insert: Partial<AgentPhoneNumber> &
          Pick<AgentPhoneNumber, "agent_id" | "phone_number" | "twilio_phone_number_sid" | "vapi_phone_number_id">;
        Update: Partial<AgentPhoneNumber>;
        Relationships: [
          {
            foreignKeyName: "agent_phone_numbers_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_number_routes: {
        Row: AgentNumberRoute;
        Insert: Partial<AgentNumberRoute> &
          Pick<AgentNumberRoute, "agent_id" | "region" | "phone_number_id">;
        Update: Partial<AgentNumberRoute>;
        Relationships: [
          {
            foreignKeyName: "agent_number_routes_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_number_routes_phone_number_id_fkey";
            columns: ["phone_number_id"];
            isOneToOne: false;
            referencedRelation: "agent_phone_numbers";
            referencedColumns: ["id"];
          },
        ];
      };
      dial_campaign_customers: {
        Row: DialCampaignCustomer;
        Insert: Partial<DialCampaignCustomer> &
          Pick<DialCampaignCustomer, "campaign_id" | "customer_id">;
        Update: Partial<DialCampaignCustomer>;
        Relationships: [];
      };
      agent_ai_preference_changes: {
        Row: AgentAiPreferenceChange;
        Insert: Partial<AgentAiPreferenceChange> &
          Pick<AgentAiPreferenceChange, "agent_id" | "field">;
        Update: Partial<AgentAiPreferenceChange>;
        Relationships: [
          {
            foreignKeyName: "agent_ai_preference_changes_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      inbound_calls: {
        Row: InboundCall;
        Insert: Partial<InboundCall> &
          Pick<InboundCall, "called_number" | "caller_phone">;
        Update: Partial<InboundCall>;
        Relationships: [
          {
            foreignKeyName: "inbound_calls_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_availability_hours: {
        Row: AgentAvailabilityHour;
        Insert: Partial<AgentAvailabilityHour> &
          Pick<AgentAvailabilityHour, "agent_id" | "weekday" | "start_time" | "end_time">;
        Update: Partial<AgentAvailabilityHour>;
        Relationships: [
          {
            foreignKeyName: "agent_availability_hours_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_states: {
        Row: OAuthState;
        Insert: Partial<OAuthState> & Pick<OAuthState, "agent_id" | "provider" | "state" | "expires_at">;
        Update: Partial<OAuthState>;
        Relationships: [
          {
            foreignKeyName: "oauth_states_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      google_sheet_connections: {
        Row: GoogleSheetConnection;
        Insert: Partial<GoogleSheetConnection> & Pick<GoogleSheetConnection, "agent_id">;
        Update: Partial<GoogleSheetConnection>;
        Relationships: [
          {
            foreignKeyName: "google_sheet_connections_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: true;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      forum_topics: {
        Row: ForumTopic;
        Insert: Partial<ForumTopic> & Pick<ForumTopic, "agent_id" | "title" | "body">;
        Update: Partial<ForumTopic>;
        Relationships: [
          {
            foreignKeyName: "forum_topics_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      forum_replies: {
        Row: ForumReply;
        Insert: Partial<ForumReply> & Pick<ForumReply, "topic_id" | "agent_id" | "body">;
        Update: Partial<ForumReply>;
        Relationships: [
          {
            foreignKeyName: "forum_replies_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "forum_topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "forum_replies_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_messages: {
        Row: DirectMessage;
        Insert: Partial<DirectMessage> & Pick<DirectMessage, "sender_id" | "recipient_id" | "body">;
        Update: Partial<DirectMessage>;
        Relationships: [
          {
            foreignKeyName: "direct_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "direct_messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      rebuttals: {
        Row: Rebuttal;
        Insert: Partial<Rebuttal> & Pick<Rebuttal, "script" | "objection_text" | "answer_text" | "agent_id">;
        Update: Partial<Rebuttal>;
        Relationships: [
          {
            foreignKeyName: "rebuttals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rebuttals_source_call_id_fkey";
            columns: ["source_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
        ];
      };
      landing_page_content: {
        Row: LandingPageContent;
        Insert: Partial<LandingPageContent>;
        Update: Partial<LandingPageContent>;
        Relationships: [
          {
            foreignKeyName: "landing_page_content_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_requests: {
        Row: ContactRequest;
        Insert: Partial<ContactRequest> &
          Pick<ContactRequest, "first_name" | "last_name" | "phone" | "email">;
        Update: Partial<ContactRequest>;
        Relationships: [];
      };
      billing_accounts: {
        Row: BillingAccount;
        Insert: Partial<BillingAccount> & Pick<BillingAccount, "agent_id">;
        Update: Partial<BillingAccount>;
        Relationships: [
          {
            foreignKeyName: "billing_accounts_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: true;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: StripeWebhookEvent;
        Insert: Partial<StripeWebhookEvent> & Pick<StripeWebhookEvent, "id" | "type">;
        Update: Partial<StripeWebhookEvent>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

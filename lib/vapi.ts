import { formatDateOnly, formatPhone } from "@/lib/format";
import {
  canadaTimezoneLabel,
  normalizeCanadaTimezone,
} from "@/lib/canada-timezones";
import type { CallStatus } from "@/types/database";

const VAPI_BASE_URL = "https://api.vapi.ai";

/** Vapi's own call lifecycle values, as they arrive on GET /call and webhooks. */
export type VapiCallStatus =
  | "scheduled"
  | "queued"
  | "ringing"
  | "in-progress"
  | "forwarding"
  | "ended";

export interface VapiCall {
  id: string;
  status?: VapiCallStatus;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  monitor?: { controlUrl?: string; listenUrl?: string };
  [key: string]: unknown;
}

function vapiApiKey() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("Missing VAPI_API_KEY environment variable.");
  return apiKey;
}

async function vapiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await vapiRequest(path, init);

  if (!res.ok) {
    throw new Error(`Vapi API error ${res.status} on ${path}: ${await res.text()}`);
  }

  return res.status === 204 ? null : res.json();
}

async function vapiRequest(path: string, init?: RequestInit) {
  return fetch(`${VAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${vapiApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * What the assistant is allowed to say the lead asked for. Anything missing
 * is sent as MISSING_VALUE rather than an empty string, because a blank
 * variable renders as nothing mid-sentence and reads like a confident claim;
 * the prompt tells Riley to ask for a "not on file" field instead.
 */
export const MISSING_VALUE = "not on file";

interface WillKitLead {
  customerEmail?: string | null;
  province?: string | null;
  kitCount?: number | null;
  mailingAddress?: string | null;
  /** Bare YYYY-MM-DD from customers.request_date. */
  requestDate?: string | null;
  confirmationCode?: string | null;
  /** Bare YYYY-MM-DD from customers.date_of_birth, confirmed near the top of the call. */
  dateOfBirth?: string | null;
  /** From customers.beneficiary_name, confirmed near the top of the call. */
  beneficiaryName?: string | null;
}

interface TriggerCallParams extends WillKitLead {
  customerName: string;
  customerPhone: string;
  customerId: string;
  agentId: string;
  agentName: string;
  customerTimezone?: string | null;
  agentTimezone?: string | null;
  /** The agent's own outbound number, read out in the write-down close. */
  agentNumber?: string | null;
  /** Agent's own Vapi phone number ID (see importTwilioPhoneNumber). Required for outbound calls. */
  phoneNumberId?: string | null;
  /** ISO 8601. When set, Vapi queues the call instead of dialling now. */
  scheduledFor?: string | null;
  /**
   * Echoed back in webhook metadata so vapi-webhook-handler's insert-fallback
   * path (when the webhook lands before the `calls` row exists) can still
   * link the row to its campaign for cleanup.
   */
  campaignId?: string | null;
}

/**
 * Starts (or schedules) an outbound call via Vapi, which places the call
 * through Twilio under the hood. `metadata` is echoed back on every Vapi
 * webhook event (including end-of-call), so vapi-webhook-handler can look up
 * the customer/agent without any extra state.
 */
export async function triggerOutboundCall({
  customerName,
  customerPhone,
  customerId,
  agentId,
  agentName,
  agentNumber,
  customerEmail,
  province,
  customerTimezone,
  agentTimezone,
  kitCount,
  mailingAddress,
  requestDate,
  confirmationCode,
  dateOfBirth,
  beneficiaryName,
  phoneNumberId,
  scheduledFor,
  campaignId,
}: TriggerCallParams): Promise<VapiCall> {
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!assistantId) {
    throw new Error("Missing VAPI_ASSISTANT_ID.");
  }
  if (!phoneNumberId) {
    throw new Error(
      "This agent needs their own outbound number — go to Settings → Outbound number and get one before calling."
    );
  }

  const metadata = { customerId, agentId, campaignId: campaignId ?? null };
  const customerTz = normalizeCanadaTimezone(customerTimezone);
  const agentTz = normalizeCanadaTimezone(agentTimezone);

  return (await vapiFetch("/call", {
    method: "POST",
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: {
        number: customerPhone,
        name: customerName,
      },
      assistantOverrides: {
        // Only variableValues reach the model — `metadata` below is sent to
        // our Edge Functions but never shown to the assistant, so the ids
        // have to be templated into the prompt as well or it has no way to
        // fill in the tool arguments.
        variableValues: {
          customerName,
          agentName,
          agentId,
          customerId,
          agentNumber: agentNumber ? formatPhone(agentNumber) : MISSING_VALUE,
          customerEmail: customerEmail || MISSING_VALUE,
          province: province || MISSING_VALUE,
          customerTimezone: customerTz,
          customerTimezoneLabel: canadaTimezoneLabel(customerTz),
          agentTimezone: agentTz,
          agentTimezoneLabel: canadaTimezoneLabel(agentTz),
          kitCount: kitCount ? String(kitCount) : MISSING_VALUE,
          mailingAddress: mailingAddress || MISSING_VALUE,
          requestDate: requestDate
            ? formatDateOnly(requestDate, "UTC")
            : MISSING_VALUE,
          confirmationCode: confirmationCode || MISSING_VALUE,
          dateOfBirth: dateOfBirth
            ? formatDateOnly(dateOfBirth, "UTC")
            : MISSING_VALUE,
          beneficiaryName: beneficiaryName || MISSING_VALUE,
        },
        metadata,
      },
      metadata,
      // Vapi holds the call and dials at `earliestAt`; until then it stays
      // in "scheduled" and can be canceled outright (see cancelVapiCall).
      ...(scheduledFor ? { schedulePlan: { earliestAt: scheduledFor } } : {}),
    }),
  })) as VapiCall;
}

export async function getVapiCall(callId: string): Promise<VapiCall> {
  return (await vapiFetch(`/call/${callId}`)) as VapiCall;
}

/**
 * Live transcript straight from Vapi, rather than whatever the end-of-call
 * webhook already wrote to `calls.transcript`. Vapi puts it at `transcript`
 * once the report lands, or under `artifact.transcript` while a call is
 * still being processed.
 */
export async function getVapiCallTranscript(callId: string): Promise<string | null> {
  const call = await getVapiCall(callId);
  const artifact = call.artifact as { transcript?: unknown } | undefined;
  const transcript = call.transcript ?? artifact?.transcript;
  return typeof transcript === "string" && transcript.trim().length > 0
    ? transcript
    : null;
}

/**
 * Hangs up / cancels a call from the portal.
 *
 * Two different things depending on how far along the call is:
 *   - Not dialled yet ("scheduled"/"queued"): DELETE removes it from Vapi's
 *     queue, so the customer's phone never rings.
 *   - Live ("ringing"/"in-progress"): Vapi exposes a per-call control URL
 *     (`monitor.controlUrl`) that accepts `{"type":"end-call"}` — the
 *     documented way to make the assistant hang up mid-conversation.
 *
 * The control URL is captured at trigger time, but is re-fetched here when
 * missing (calls placed before this column existed, or from outside the app).
 */
export async function cancelVapiCall({
  callId,
  controlUrl,
}: {
  callId: string;
  controlUrl?: string | null;
}): Promise<{ status: VapiCallStatus | "canceled"; endedByControlUrl: boolean }> {
  let call: VapiCall | null = null;
  try {
    call = await getVapiCall(callId);
  } catch {
    // Vapi doesn't know this call any more; fall through to the control URL.
  }

  if (call?.status === "ended") {
    return { status: "ended", endedByControlUrl: false };
  }

  const notStartedYet = call?.status === "scheduled" || call?.status === "queued";
  if (notStartedYet) {
    await vapiFetch(`/call/${callId}`, { method: "DELETE" });
    return { status: "canceled", endedByControlUrl: false };
  }

  const resolvedControlUrl = controlUrl ?? call?.monitor?.controlUrl;
  if (resolvedControlUrl) {
    const res = await fetch(resolvedControlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "end-call" }),
    });
    if (res.ok) {
      return { status: "ended", endedByControlUrl: true };
    }
    // Control URL expires the moment the call ends — fall through to DELETE
    // rather than reporting a failure for a call that's already over.
  }

  await vapiFetch(`/call/${callId}`, { method: "DELETE" });
  return { status: "canceled", endedByControlUrl: false };
}

export function normalizeE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export class VapiPhoneImportError extends Error {
  readonly code: "another_org" | "import_failed";

  constructor(message: string, code: "another_org" | "import_failed") {
    super(message);
    this.name = "VapiPhoneImportError";
    this.code = code;
  }
}

export async function listVapiPhoneNumbers(): Promise<
  Array<{ id: string; number: string; name?: string }>
> {
  const data = await vapiFetch("/phone-number");
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (
      typeof row === "object" &&
      row !== null &&
      "id" in row &&
      "number" in row &&
      typeof row.id === "string" &&
      typeof row.number === "string"
    ) {
      return [
        {
          id: row.id,
          number: row.number,
          name: typeof row.name === "string" ? row.name : undefined,
        },
      ];
    }
    return [];
  });
}

export async function findVapiPhoneNumberByNumber(phoneNumber: string) {
  const target = normalizeE164(phoneNumber);
  const all = await listVapiPhoneNumbers();
  return all.find((row) => normalizeE164(row.number) === target) ?? null;
}

/**
 * Registers a Twilio number in Vapi, or returns the existing resource if this
 * org already has it (retry-safe — no duplicate POST).
 */
export async function resolveOrImportTwilioPhoneNumber({
  agentName,
  phoneNumber,
  twilioAccountSid,
  twilioAuthToken,
}: {
  agentName: string;
  phoneNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}) {
  const normalized = normalizeE164(phoneNumber);
  const existing = await findVapiPhoneNumberByNumber(normalized);
  if (existing) {
    return { id: existing.id, number: existing.number };
  }

  const res = await vapiRequest("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      number: normalized,
      twilioAccountSid,
      twilioAuthToken,
      name: `${agentName} (Riley Booking)`,
    }),
  });

  if (res.ok) {
    return (await res.json()) as { id: string; number: string };
  }

  const text = await res.text();
  const lower = text.toLowerCase();

  const rediscovered = await findVapiPhoneNumberByNumber(normalized);
  if (rediscovered) {
    return { id: rediscovered.id, number: rediscovered.number };
  }

  if (lower.includes("another org")) {
    throw new VapiPhoneImportError(
      `${normalized} is locked to a different Vapi organization. You own it in Twilio, but Vapi still links it elsewhere — email support@vapi.ai and ask them to release it from the old org, then retry here. Do not buy another number.`,
      "another_org"
    );
  }

  throw new VapiPhoneImportError(
    `Vapi API error ${res.status} on /phone-number: ${text}`,
    "import_failed"
  );
}

export async function importTwilioPhoneNumber({
  agentName,
  phoneNumber,
  twilioAccountSid,
  twilioAuthToken,
}: {
  agentName: string;
  phoneNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}) {
  return resolveOrImportTwilioPhoneNumber({
    agentName,
    phoneNumber,
    twilioAccountSid,
    twilioAuthToken,
  });
}

/**
 * Returns null when Vapi no longer has this phone number resource (stale DB id).
 */
export async function getVapiPhoneNumber(
  phoneNumberId: string
): Promise<{ id: string; number: string } | null> {
  const res = await vapiRequest(`/phone-number/${phoneNumberId}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Vapi API error ${res.status} on /phone-number/${phoneNumberId}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string; number?: string };
  if (!data.id || !data.number) return null;
  return { id: data.id, number: data.number };
}

/**
 * Inbound calls hit vapi-inbound-handler (log + reject). Outbound still passes
 * assistantId on each POST /call — unaffected by assistantId null here.
 * Each agent's number is configured independently — one agent does not overwrite another.
 */
export async function configureInboundCallLogging(
  phoneNumberId: string
): Promise<{ ok: true } | { ok: false; notFound: true } | { ok: false; error: string }> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverSecret = process.env.VAPI_SERVER_SECRET;
  if (!supabaseUrl || !serverSecret) {
    return { ok: false, error: "Missing SUPABASE_URL or VAPI_SERVER_SECRET for inbound handler." };
  }
  const base = supabaseUrl.replace(/\/$/, "");
  const res = await vapiRequest(`/phone-number/${phoneNumberId}`, {
    method: "PATCH",
    body: JSON.stringify({
      assistantId: null,
      server: {
        url: `${base}/functions/v1/vapi-inbound-handler`,
        secret: serverSecret,
      },
    }),
  });
  if (res.status === 404) return { ok: false, notFound: true };
  if (!res.ok) {
    return { ok: false, error: `Vapi API error ${res.status}: ${await res.text()}` };
  }
  return { ok: true };
}

export async function releaseVapiPhoneNumber(phoneNumberId: string) {
  try {
    await vapiFetch(`/phone-number/${phoneNumberId}`, { method: "DELETE" });
  } catch (err) {
    console.error(`Failed to release Vapi phone number ${phoneNumberId}:`, err);
  }
}

/** Maps Vapi's status vocabulary onto the `calls.status` column. */
export function toCallStatus(status: VapiCallStatus | undefined) {
  return toCallStatusStrict(status) ?? ("queued" as const);
}

/**
 * Same mapping, but returns null instead of guessing "queued" for an
 * unrecognized status. Reconciliation code must use this — silently
 * defaulting to a *live* status would re-pin a stale call as still in
 * progress instead of leaving its current status alone.
 */
export function toCallStatusStrict(status: VapiCallStatus | undefined): CallStatus | null {
  switch (status) {
    case "scheduled":
      return "scheduled";
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "forwarding":
      return "in_progress";
    case "ended":
      return "ended";
    default:
      return null;
  }
}

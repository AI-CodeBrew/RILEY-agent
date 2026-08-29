/**
 * Server-rendered timestamps have to be formatted deterministically or React
 * hydration complains — every helper here takes an explicit time zone
 * (the agent's, from sales_agents.timezone) instead of the machine's locale.
 */
const DEFAULT_TIME_ZONE = "America/New_York";

export function formatDateTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(iso));
}

export function formatTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

/** "in 2 hours" / "3 days ago" — coarse on purpose, no seconds churn. */
export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return "just now";
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function formatCost(cost: number | null | undefined) {
  if (cost === null || cost === undefined) return "—";
  return `$${cost.toFixed(2)}`;
}

/** +15551234567 → +1 (555) 123-4567; anything unexpected passes through. */
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return "—";
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone.replace(/[\s()-]/g, ""));
  if (!match) return phone;
  return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
}

/**
 * Normalizes what an agent types into E.164, which is what Twilio/Vapi
 * require. Supports US/Canada, UK, and Pakistan local formats.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");

  // US/Canada — 10 digits, or 11 starting with 1.
  if (digits.length === 10 && !digits.startsWith("0")) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Pakistan local mobile: 03XX XXXXXXX (drop trunk 0 → +92).
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+92${digits.slice(1)}`;
  }
  // Pakistan mobile without trunk 0: 3XX XXXXXXX.
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+92${digits}`;
  }
  // Country code typed without +: 92XXXXXXXXXX.
  if (digits.length >= 12 && digits.startsWith("92")) {
    return `+${digits}`;
  }

  // UK local mobile: 07XXXXXXXXX (drop trunk 0 → +44).
  if (digits.length === 11 && digits.startsWith("07")) {
    return `+44${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("7")) {
    return `+44${digits}`;
  }
  if (digits.length >= 12 && digits.startsWith("44")) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Formats a bare `date` column (YYYY-MM-DD) without letting a time zone drag
 * it onto the previous day — midday UTC is the same calendar date everywhere
 * we call.
 */
export function formatDateOnly(
  date: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!date) return "—";
  return formatDate(`${date}T12:00:00Z`, timeZone);
}

/**
 * Same as `formatDateOnly`, but spells out the month ("December 5, 1990"
 * instead of "Dec 5, 1990") — for any date handed to Vapi as a template
 * variable the assistant reads aloud on a call. TTS pronounces the
 * abbreviated form of the `dateStyle: "medium"` used elsewhere as the literal
 * word "Dec", not the month, so voice-facing dates always need the
 * unabbreviated month name. UI display elsewhere keeps the compact form.
 */
export function formatDateOnlyForSpeech(
  date: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * Normalizes the "how many will kits did they request" field coming off a
 * form or an import. Returns null for blank (unknown, so Riley asks instead
 * of asserting) and "invalid" for anything outside the DB check constraint.
 */
export function parseKitCount(input: unknown): number | null | "invalid" {
  if (input === undefined || input === null || input === "") return null;
  const value = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isInteger(value) || value < 1 || value > 10) return "invalid";
  return value;
}

/** Buckets rows into per-day counts for the dashboard trend chart. */
export function dailyCounts(
  timestamps: string[],
  days: number,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
  const keyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone });

  const buckets = new Map<string, number>();
  const labels: { key: string; label: string }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000);
    const key = keyFormatter.format(date);
    buckets.set(key, 0);
    labels.push({ key, label: dayFormatter.format(date) });
  }

  for (const timestamp of timestamps) {
    const key = keyFormatter.format(new Date(timestamp));
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
  }

  return labels.map(({ key, label }) => ({
    label,
    fullLabel: label,
    value: buckets.get(key) ?? 0,
  }));
}

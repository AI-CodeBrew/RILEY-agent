/** Four Canadian time zones used across the portal and voice agent. */
export const CANADA_TIME_ZONES = [
  { id: "atlantic", label: "Atlantic", iana: "America/Halifax" },
  { id: "eastern", label: "Eastern", iana: "America/Toronto" },
  { id: "mountain", label: "Mountain", iana: "America/Edmonton" },
  { id: "pacific", label: "Pacific", iana: "America/Vancouver" },
] as const;

export type CanadaTimezoneIana = (typeof CANADA_TIME_ZONES)[number]["iana"];

export const DEFAULT_CANADA_TIMEZONE: CanadaTimezoneIana = "America/Halifax";

const IANA_SET = new Set<string>(CANADA_TIME_ZONES.map((zone) => zone.iana));

/** Maps legacy IANA values (pre-dropdown) to the nearest supported zone. */
const LEGACY_IANA: Record<string, CanadaTimezoneIana> = {
  "America/New_York": "America/Toronto",
  "America/Chicago": "America/Toronto",
  "America/Denver": "America/Edmonton",
  "America/Los_Angeles": "America/Vancouver",
  "America/Phoenix": "America/Edmonton",
  "America/St_Johns": "America/Halifax",
  "America/Winnipeg": "America/Toronto",
  UTC: "America/Toronto",
};

export function isCanadaTimezone(value: string | null | undefined): value is CanadaTimezoneIana {
  return Boolean(value && IANA_SET.has(value));
}

export function normalizeCanadaTimezone(value: string | null | undefined): CanadaTimezoneIana {
  if (isCanadaTimezone(value)) return value;
  if (value && value in LEGACY_IANA) return LEGACY_IANA[value];
  return DEFAULT_CANADA_TIMEZONE;
}

export function canadaTimezoneLabel(value: string | null | undefined): string {
  const iana = normalizeCanadaTimezone(value);
  return CANADA_TIME_ZONES.find((zone) => zone.iana === iana)?.label ?? "Atlantic";
}

export function parseCanadaTimezoneInput(value: unknown): CanadaTimezoneIana | "invalid" {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_CANADA_TIMEZONE;
  const trimmed = value.trim();
  if (isCanadaTimezone(trimmed)) return trimmed;
  const byLabel = CANADA_TIME_ZONES.find(
    (zone) => zone.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return byLabel.iana;
  return "invalid";
}

/** Plain-language slot for Abby to read aloud in the member's time zone. */
export function formatSlotInTimezone(isoUtc: string, iana: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeCanadaTimezone(iana),
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatShortTimeInTimezone(isoUtc: string, iana: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeCanadaTimezone(iana),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

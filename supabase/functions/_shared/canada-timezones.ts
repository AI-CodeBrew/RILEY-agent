/** Deno copy — keep in sync with lib/canada-timezones.ts */
export const CANADA_TIME_ZONES = [
  { id: "atlantic", label: "Atlantic", iana: "America/Halifax" },
  { id: "eastern", label: "Eastern", iana: "America/Toronto" },
  { id: "mountain", label: "Mountain", iana: "America/Edmonton" },
  { id: "pacific", label: "Pacific", iana: "America/Vancouver" },
] as const;

export type CanadaTimezoneIana = (typeof CANADA_TIME_ZONES)[number]["iana"];

export const DEFAULT_CANADA_TIMEZONE: CanadaTimezoneIana = "America/Halifax";

const IANA_SET = new Set<string>(CANADA_TIME_ZONES.map((zone) => zone.iana));

const LEGACY_IANA: Record<string, CanadaTimezoneIana> = {
  "America/New_York": "America/Toronto",
  "America/Chicago": "America/Toronto",
  "America/Denver": "America/Edmonton",
  "America/Los_Angeles": "America/Vancouver",
  "America/Phoenix": "America/Edmonton",
  "America/St_Johns": "America/Halifax",
  "America/Winnipeg": "America/Toronto",
};

export function normalizeCanadaTimezone(value: string | null | undefined): CanadaTimezoneIana {
  if (value && IANA_SET.has(value)) return value as CanadaTimezoneIana;
  if (value && value in LEGACY_IANA) return LEGACY_IANA[value];
  return DEFAULT_CANADA_TIMEZONE;
}

/** Best-guess zone for a province, keyed by short code and full name — see lib/canada-timezones.ts for the rationale/caveats. */
const PROVINCE_TIMEZONE: Record<string, CanadaTimezoneIana> = {
  AB: "America/Edmonton",
  ALBERTA: "America/Edmonton",
  BC: "America/Vancouver",
  "BRITISH COLUMBIA": "America/Vancouver",
  MB: "America/Toronto",
  MANITOBA: "America/Toronto",
  NB: "America/Halifax",
  "NEW BRUNSWICK": "America/Halifax",
  NL: "America/Halifax",
  "NEWFOUNDLAND AND LABRADOR": "America/Halifax",
  NS: "America/Halifax",
  "NOVA SCOTIA": "America/Halifax",
  NT: "America/Edmonton",
  "NORTHWEST TERRITORIES": "America/Edmonton",
  NU: "America/Toronto",
  NUNAVUT: "America/Toronto",
  ON: "America/Toronto",
  ONTARIO: "America/Toronto",
  PE: "America/Halifax",
  PEI: "America/Halifax",
  "PRINCE EDWARD ISLAND": "America/Halifax",
  QC: "America/Toronto",
  QUEBEC: "America/Toronto",
  SK: "America/Edmonton",
  SASKATCHEWAN: "America/Edmonton",
  YT: "America/Vancouver",
  YUKON: "America/Vancouver",
};

export function inferTimezoneFromProvince(
  province: string | null | undefined
): CanadaTimezoneIana | null {
  if (!province) return null;
  return PROVINCE_TIMEZONE[province.trim().toUpperCase()] ?? null;
}

/** An explicit timezone wins; otherwise fall back to province before the last-resort Atlantic default. */
export function resolveCustomerTimezone(
  timezone: string | null | undefined,
  province: string | null | undefined,
  fallback: CanadaTimezoneIana = DEFAULT_CANADA_TIMEZONE
): CanadaTimezoneIana {
  if (timezone && (IANA_SET.has(timezone) || timezone in LEGACY_IANA)) {
    return normalizeCanadaTimezone(timezone);
  }
  return inferTimezoneFromProvince(province) ?? fallback;
}

export function canadaTimezoneLabel(value: string | null | undefined): string {
  const iana = normalizeCanadaTimezone(value);
  return CANADA_TIME_ZONES.find((zone) => zone.iana === iana)?.label ?? "Atlantic";
}

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

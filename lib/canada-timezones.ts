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

/**
 * Best-guess zone for a province/territory, keyed by both the short code
 * and the full name since `province` is free text (CustomerForm, CSV
 * import, will-kit lead intake all accept either — see
 * lib/canada-provinces.ts). Provinces that straddle more than one real zone
 * (BC's northeast corner, western Ontario/Nunavut, Saskatchewan's
 * no-DST offset) are collapsed to whichever of the 4 supported zones covers
 * most of the population/area — an approximation, not a legal timezone map.
 */
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

/**
 * Resolves a customer's zone the way it should always be resolved: an
 * explicit timezone wins, otherwise fall back to their province, otherwise
 * the same last-resort default normalizeCanadaTimezone(null) would give.
 * Unlike normalizeCanadaTimezone(timezone), a missing/blank `timezone` here
 * doesn't jump straight to the Atlantic default when a province is on file.
 */
export function resolveCustomerTimezone(
  timezone: string | null | undefined,
  province: string | null | undefined,
  fallback: CanadaTimezoneIana = DEFAULT_CANADA_TIMEZONE
): CanadaTimezoneIana {
  if (timezone && (isCanadaTimezone(timezone) || timezone in LEGACY_IANA)) {
    return normalizeCanadaTimezone(timezone);
  }
  return inferTimezoneFromProvince(province) ?? fallback;
}

export function canadaTimezoneLabel(value: string | null | undefined): string {
  const iana = normalizeCanadaTimezone(value);
  return CANADA_TIME_ZONES.find((zone) => zone.iana === iana)?.label ?? "Atlantic";
}

export function parseCanadaTimezoneInput(
  value: unknown,
  province?: string | null
): CanadaTimezoneIana | "invalid" {
  if (typeof value !== "string" || !value.trim()) {
    return inferTimezoneFromProvince(province) ?? DEFAULT_CANADA_TIMEZONE;
  }
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

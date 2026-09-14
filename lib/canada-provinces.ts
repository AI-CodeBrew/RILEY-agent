/**
 * Expands a Canadian province/territory abbreviation into its full name for
 * speech — TTS reads "ON" as the letters "oh, en" rather than the word
 * "Ontario" (same class of bug as the date fields; see
 * formatDateOnlyForSpeech). `province` is free text (CustomerForm, CSV
 * import, will-kit lead intake all accept anything), so lead sources that
 * submit the short code need this before the value reaches {{province}}.
 * Anything that isn't a recognized code — including an already-full name
 * like "Ontario" — passes through unchanged.
 */
const PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  PEI: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

export function formatProvinceForSpeech(value: string): string {
  const trimmed = value.trim();
  return PROVINCE_NAMES[trimmed.toUpperCase()] ?? trimmed;
}

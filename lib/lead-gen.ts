import type { LeadGenGender, LeadGenOrderStatus, LeadGenProduct } from "@/types/database";

export const PRODUCT_LABELS: Record<LeadGenProduct, string> = {
  term_life: "Term life",
  whole_life: "Whole life",
  final_expense: "Final expense",
  mortgage_protection: "Mortgage protection",
  critical_illness: "Critical illness",
  health_dental: "Health and dental",
};

/**
 * Provinces/states an agent can be licensed in. Codes carry the country so
 * the two lists can never collide (US "CA" is California).
 */
export const LICENSE_REGIONS = [
  { code: "CA-AB", name: "Alberta" },
  { code: "CA-BC", name: "British Columbia" },
  { code: "CA-MB", name: "Manitoba" },
  { code: "CA-NB", name: "New Brunswick" },
  { code: "CA-NL", name: "Newfoundland and Labrador" },
  { code: "CA-NS", name: "Nova Scotia" },
  { code: "CA-NT", name: "Northwest Territories" },
  { code: "CA-NU", name: "Nunavut" },
  { code: "CA-ON", name: "Ontario" },
  { code: "CA-PE", name: "Prince Edward Island" },
  { code: "CA-QC", name: "Quebec" },
  { code: "CA-SK", name: "Saskatchewan" },
  { code: "CA-YT", name: "Yukon" },
  { code: "US-AL", name: "Alabama" },
  { code: "US-AK", name: "Alaska" },
  { code: "US-AZ", name: "Arizona" },
  { code: "US-AR", name: "Arkansas" },
  { code: "US-CA", name: "California" },
  { code: "US-CO", name: "Colorado" },
  { code: "US-CT", name: "Connecticut" },
  { code: "US-DE", name: "Delaware" },
  { code: "US-FL", name: "Florida" },
  { code: "US-GA", name: "Georgia" },
  { code: "US-HI", name: "Hawaii" },
  { code: "US-ID", name: "Idaho" },
  { code: "US-IL", name: "Illinois" },
  { code: "US-IN", name: "Indiana" },
  { code: "US-IA", name: "Iowa" },
  { code: "US-KS", name: "Kansas" },
  { code: "US-KY", name: "Kentucky" },
  { code: "US-LA", name: "Louisiana" },
  { code: "US-ME", name: "Maine" },
  { code: "US-MD", name: "Maryland" },
  { code: "US-MA", name: "Massachusetts" },
  { code: "US-MI", name: "Michigan" },
  { code: "US-MN", name: "Minnesota" },
  { code: "US-MS", name: "Mississippi" },
  { code: "US-MO", name: "Missouri" },
  { code: "US-MT", name: "Montana" },
  { code: "US-NE", name: "Nebraska" },
  { code: "US-NV", name: "Nevada" },
  { code: "US-NH", name: "New Hampshire" },
  { code: "US-NJ", name: "New Jersey" },
  { code: "US-NM", name: "New Mexico" },
  { code: "US-NY", name: "New York" },
  { code: "US-NC", name: "North Carolina" },
  { code: "US-ND", name: "North Dakota" },
  { code: "US-OH", name: "Ohio" },
  { code: "US-OK", name: "Oklahoma" },
  { code: "US-OR", name: "Oregon" },
  { code: "US-PA", name: "Pennsylvania" },
  { code: "US-RI", name: "Rhode Island" },
  { code: "US-SC", name: "South Carolina" },
  { code: "US-SD", name: "South Dakota" },
  { code: "US-TN", name: "Tennessee" },
  { code: "US-TX", name: "Texas" },
  { code: "US-UT", name: "Utah" },
  { code: "US-VT", name: "Vermont" },
  { code: "US-VA", name: "Virginia" },
  { code: "US-WA", name: "Washington" },
  { code: "US-WV", name: "West Virginia" },
  { code: "US-WI", name: "Wisconsin" },
  { code: "US-WY", name: "Wyoming" },
] as const;

export function regionName(code: string) {
  return LICENSE_REGIONS.find((region) => region.code === code)?.name ?? code;
}

/** "Ontario", "Ontario and Alberta", "Ontario, Alberta and Quebec". */
export function regionList(codes: string[]) {
  const names = codes.map(regionName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Budget bounds in cents. The agent types any amount in between and Stripe
 * charges exactly that — the server re-checks these, never trusting the client.
 */
export const MIN_BUDGET_CENTS = 1_000;
export const MAX_BUDGET_CENTS = 10_000_000;

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export const GENDER_LABELS: Record<LeadGenGender, string> = {
  any: "Any",
  male: "Male",
  female: "Female",
};

export const ORDER_STATUS_LABELS: Record<LeadGenOrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid — pending go-live",
  live: "Live",
  canceled: "Canceled",
};

/** Only paid or live orders accept leads on their public form. */
export const ORDER_ACCEPTS_LEADS: Record<LeadGenOrderStatus, boolean> = {
  pending_payment: false,
  paid: true,
  live: true,
  canceled: false,
};

/**
 * Footer of every public lead form. TODO: fill in the company's legal name
 * and mailing address — parts left null are just left out of the footer.
 */
export const LEAD_FORM_COMPANY = {
  legalName: "Dialcom",
  mailingAddress: null as string | null,
  contact: "support@dialcom.ai",
  privacyPath: "/privacy",
};

/**
 * The two consent statements on the public lead form. The API rebuilds these
 * server-side from the order and stores them with each lead, so the saved
 * wording is exactly what the form showed.
 */
export function consentTexts(order: { agency_name: string | null; licensed_regions: string[] }, fallbackName: string) {
  const name = order.agency_name?.trim() || fallbackName;
  return {
    calls: `Yes, I'd like ${name}, a licensed insurance agent in ${regionList(order.licensed_regions)}, and dialcom.ai on their behalf, to call me about insurance at the number I provided. Calls may be made by an AI assistant or automated system and may be recorded.`,
    messages: `Yes, I'd also like to receive texts, WhatsApp messages and emails about insurance from ${name} and dialcom.ai. I can unsubscribe at any time.`,
  };
}

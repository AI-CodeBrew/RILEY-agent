import { formatPhone } from "@/lib/format";

/**
 * Fixed Canadian region → NANP area-code mapping for outbound-number
 * routing. Pure and dependency-free so it can run both server-side (routing
 * resolution) and client-side (settings UI, call previews) unchanged.//
 */
export const NUMBER_ROUTING_REGIONS = [
  { key: "alberta", label: "Alberta", areaCodes: ["587"] },
  { key: "saskatchewan", label: "Saskatchewan", areaCodes: ["306"] },
  { key: "ontario", label: "Ontario", areaCodes: ["416", "905"] },
  { key: "nova_scotia_pei", label: "Nova Scotia / PEI", areaCodes: ["902"] },
  { key: "new_brunswick", label: "New Brunswick", areaCodes: ["506"] },
  { key: "newfoundland", label: "Newfoundland", areaCodes: ["709"] },
  { key: "manitoba", label: "Manitoba", areaCodes: ["584"] },
] as const;

export type NumberRoutingRegionKey = (typeof NUMBER_ROUTING_REGIONS)[number]["key"];

/** Every valid `agent_number_routes.region` value, including the catch-all. */
export type RoutingRegion = NumberRoutingRegionKey | "default";

const AREA_CODE_TO_REGION: Record<string, NumberRoutingRegionKey> = {};
for (const region of NUMBER_ROUTING_REGIONS) {
  for (const areaCode of region.areaCodes) {
    AREA_CODE_TO_REGION[areaCode] = region.key;
  }
}

/** The 3-digit NANP area code from an E.164 or loosely-formatted number, or null if it isn't a 10/11-digit NANP number. */
export function extractNanpAreaCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  return national ? national.slice(0, 3) : null;
}

/** Which of the 7 fixed regions a phone number's area code belongs to, or "default" if none match. */
export function regionForPhoneNumber(phone: string): RoutingRegion {
  const areaCode = extractNanpAreaCode(phone);
  if (!areaCode) return "default";
  return AREA_CODE_TO_REGION[areaCode] ?? "default";
}

export function routingRegionLabel(region: RoutingRegion): string {
  if (region === "default") return "Default";
  return NUMBER_ROUTING_REGIONS.find((r) => r.key === region)?.label ?? "Default";
}

/**
 * "Will call from +1 (403) 555-0100 (Alberta)" preview — computed from the
 * *customer's* phone number, but only ever returns the *agent's own*
 * connected number and region label, never the customer's digits. Meant to
 * be computed server-side (in a page/route handler that has the customer's
 * raw phone) and handed to client components as a plain string, so a
 * customer's phone number never has to reach the browser just to show this
 * hint — see lib/customer-visibility.ts.
 */
export function dialFromPreview(
  customerPhone: string,
  numbers: { id: string; phoneNumber: string }[],
  routes: { region: string; phone_number_id: string }[]
): string | null {
  const region = regionForPhoneNumber(customerPhone);
  const numberId =
    routes.find((r) => r.region === region)?.phone_number_id ??
    routes.find((r) => r.region === "default")?.phone_number_id ??
    null;
  const number = numberId ? numbers.find((n) => n.id === numberId)?.phoneNumber : null;
  return number ? `${formatPhone(number)} (${routingRegionLabel(region)})` : null;
}

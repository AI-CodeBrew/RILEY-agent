import { supabaseAdmin } from "@/lib/supabase-admin";
import { regionForPhoneNumber, routingRegionLabel, type RoutingRegion } from "@/lib/area-code-routing";

type RoutedNumber = { id: string; phone_number: string; vapi_phone_number_id: string };

async function routedNumber(agentId: string, region: RoutingRegion): Promise<RoutedNumber | null> {
  const { data } = await supabaseAdmin
    .from("agent_number_routes")
    .select("connected_number:agent_phone_numbers(id, phone_number, vapi_phone_number_id)")
    .eq("agent_id", agentId)
    .eq("region", region)
    .maybeSingle();

  return (data?.connected_number as unknown as RoutedNumber | null) ?? null;
}

export type ResolvedOutboundNumber =
  | { ok: true; region: RoutingRegion; number: string; vapiPhoneNumberId: string; phoneNumberId: string }
  | { ok: false; region: RoutingRegion; message: string };

/**
 * Deterministically picks which of the agent's connected numbers to call a
 * customer from, based on the customer's area code region — falling back to
 * the agent's Default number when the area code isn't one of the 7 mapped
 * regions, or when that region has no number configured. Never random; if
 * nothing is configured for either, calling is refused with a clear reason.
 */
export async function resolveOutboundNumberForCall(
  agentId: string,
  customerPhoneE164: string
): Promise<ResolvedOutboundNumber> {
  const region = regionForPhoneNumber(customerPhoneE164);

  let numberRow = await routedNumber(agentId, region);
  if (!numberRow && region !== "default") {
    numberRow = await routedNumber(agentId, "default");
  }

  if (!numberRow) {
    return {
      ok: false,
      region,
      message: `No outbound number configured for ${routingRegionLabel(region)} (or Default) — set one in Settings → Number routing.`,
    };
  }

  return {
    ok: true,
    region,
    number: numberRow.phone_number,
    vapiPhoneNumberId: numberRow.vapi_phone_number_id,
    phoneNumberId: numberRow.id,
  };
}

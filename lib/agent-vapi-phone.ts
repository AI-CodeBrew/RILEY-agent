import { supabaseAdmin } from "@/lib/supabase-admin";
import { configureInboundCallLogging } from "@/lib/vapi";

/**
 * Re-applies inbound call logging config to each of the agent's connected
 * numbers. Once a number is connected it stays connected for that agent —
 * this never removes a row. Disconnecting is only ever the explicit action
 * in DELETE /api/agents/[id]/phone-numbers/[numberId]; a single flaky/late
 * 404 from Vapi (e.g. right after connecting, before Vapi finishes indexing
 * the number) used to be enough to silently drop it here, which is the bug
 * this replaced.
 */
export async function syncAgentPhoneNumbers(agentId: string) {
  const { data: numbers } = await supabaseAdmin
    .from("agent_phone_numbers")
    .select("id, vapi_phone_number_id")
    .eq("agent_id", agentId);

  for (const row of numbers ?? []) {
    const configured = await configureInboundCallLogging(row.vapi_phone_number_id);
    if (!configured.ok) {
      const reason = "notFound" in configured ? "not found in Vapi" : configured.error;
      // warn, not error — this is tolerated and intentionally non-fatal (see
      // doc comment above), and console.error in a Server Component trips
      // Next's dev-mode overlay as if the page had crashed.
      console.warn(`Inbound logging setup failed for phone number ${row.vapi_phone_number_id}: ${reason}`);
    }
  }
}

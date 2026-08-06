import { supabaseAdmin } from "@/lib/supabase-admin";
import { configureInboundCallLogging, getVapiPhoneNumber } from "@/lib/vapi";

/** Verify each of the agent's connected numbers still exists in Vapi; drop the ones that don't. */
export async function syncAgentPhoneNumbers(agentId: string) {
  const { data: numbers } = await supabaseAdmin
    .from("agent_phone_numbers")
    .select("id, vapi_phone_number_id")
    .eq("agent_id", agentId);

  for (const row of numbers ?? []) {
    const exists = await getVapiPhoneNumber(row.vapi_phone_number_id);
    if (!exists) {
      await supabaseAdmin.from("agent_phone_numbers").delete().eq("id", row.id);
      continue;
    }

    const configured = await configureInboundCallLogging(row.vapi_phone_number_id);
    if (!configured.ok) {
      if ("notFound" in configured && configured.notFound) {
        await supabaseAdmin.from("agent_phone_numbers").delete().eq("id", row.id);
      } else if ("error" in configured) {
        console.error("Inbound logging setup failed:", configured.error);
      }
    }
  }
}

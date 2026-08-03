import { supabaseAdmin } from "@/lib/supabase-admin";
import { configureInboundCallLogging, getVapiPhoneNumber } from "@/lib/vapi";

/** Verify the agent's Vapi phone number exists; clear stale ids from the DB. */
export async function syncAgentVapiPhone(agent: {
  id: string;
  vapi_phone_number_id: string | null;
}) {
  if (!agent.vapi_phone_number_id) return;

  const exists = await getVapiPhoneNumber(agent.vapi_phone_number_id);
  if (exists) {
    const configured = await configureInboundCallLogging(agent.vapi_phone_number_id);
    if (configured.ok) return;
    if ("notFound" in configured && configured.notFound) {
      await supabaseAdmin
        .from("sales_agents")
        .update({ vapi_phone_number_id: null })
        .eq("id", agent.id);
    } else if ("error" in configured) {
      console.error("Inbound logging setup failed:", configured.error);
    }
    return;
  }

  await supabaseAdmin
    .from("sales_agents")
    .update({ vapi_phone_number_id: null })
    .eq("id", agent.id);
}

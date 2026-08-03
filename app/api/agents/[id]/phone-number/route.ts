import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  findAvailableTwilioNumber,
  findTwilioNumberSid,
  listTwilioOwnedNumbers,
  purchaseTwilioNumber,
  releaseTwilioNumber,
} from "@/lib/twilio";
import {
  configureInboundCallLogging,
  findVapiPhoneNumberByNumber,
  getVapiPhoneNumber,
  normalizeE164,
  releaseVapiPhoneNumber,
  resolveOrImportTwilioPhoneNumber,
  VapiPhoneImportError,
} from "@/lib/vapi";
import { requireApiSession } from "@/lib/auth";

async function phoneUsedByOtherAgent(agentId: string, phoneNumber: string) {
  const normalized = normalizeE164(phoneNumber);
  const { data } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name, vapi_phone_number_id")
    .eq("vapi_phone_number", normalized)
    .neq("id", agentId)
    .maybeSingle();

  if (!data) return null;
  if (data.vapi_phone_number_id) {
    return data.name as string;
  }
  return null;
}

/** Twilio numbers on the account that this agent can connect (not fully linked to another agent). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 500 });
  }

  const [{ data: agents }, twilioNumbers] = await Promise.all([
    supabaseAdmin
      .from("sales_agents")
      .select("id, name, vapi_phone_number, vapi_phone_number_id"),
    listTwilioOwnedNumbers(accountSid, authToken),
  ]);

  const numbers = await Promise.all(
    twilioNumbers.map(async ({ sid, phoneNumber }: { sid: string; phoneNumber: string }) => {
      const owner = (agents ?? []).find(
        (row) =>
          row.vapi_phone_number &&
          normalizeE164(row.vapi_phone_number) === normalizeE164(phoneNumber)
      );
      const inVapi = await findVapiPhoneNumberByNumber(phoneNumber);
      const connectedToOther =
        owner && owner.id !== id && Boolean(owner.vapi_phone_number_id);

      return {
        phoneNumber,
        twilioSid: sid,
        inVapi: Boolean(inVapi),
        vapiPhoneNumberId: inVapi?.id ?? null,
        assignedTo: owner?.name ?? null,
        available: !connectedToOther,
      };
    })
  );

  return NextResponse.json({ numbers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only request a number for your own account" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const area_code = body.area_code as string | undefined;
  const requestedPhone = body.phone_number as string | undefined;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not configured" },
      { status: 500 }
    );
  }

  const { data: agentRow, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name, vapi_phone_number_id, vapi_phone_number, twilio_phone_number_sid")
    .eq("id", id)
    .single();

  if (agentError || !agentRow) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  let agent = agentRow;

  if (agent.vapi_phone_number_id) {
    const stillInVapi = await getVapiPhoneNumber(agent.vapi_phone_number_id);
    if (stillInVapi) {
      return NextResponse.json(
        { error: "agent already has a phone number" },
        { status: 409 }
      );
    }
    await supabaseAdmin
      .from("sales_agents")
      .update({ vapi_phone_number_id: null })
      .eq("id", id);
    agent = { ...agent, vapi_phone_number_id: null };
  }

  let phoneNumber = agent.vapi_phone_number;
  let twilioSid = agent.twilio_phone_number_sid;

  if (requestedPhone) {
    const normalized = normalizeE164(requestedPhone);
    const otherAgent = await phoneUsedByOtherAgent(id, normalized);
    if (otherAgent) {
      return NextResponse.json(
        { error: `${normalized} is already connected to ${otherAgent}. Each agent needs their own number.` },
        { status: 409 }
      );
    }

    const owned = (await listTwilioOwnedNumbers(accountSid, authToken)).find(
      (row: { sid: string; phoneNumber: string }) =>
        normalizeE164(row.phoneNumber) === normalized
    );
    if (!owned) {
      return NextResponse.json(
        { error: `${normalized} is not on your Twilio account.` },
        { status: 400 }
      );
    }

    phoneNumber = owned.phoneNumber;
    twilioSid = owned.sid;

    await supabaseAdmin
      .from("sales_agents")
      .update({ vapi_phone_number: phoneNumber, twilio_phone_number_sid: twilioSid })
      .eq("id", id);
  }

  if (!phoneNumber || !twilioSid) {
    try {
      const numberToBuy = await findAvailableTwilioNumber(accountSid, authToken, area_code);
      const purchased = await purchaseTwilioNumber(accountSid, authToken, numberToBuy);
      phoneNumber = purchased.phoneNumber;
      twilioSid = purchased.sid;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to purchase Twilio number" },
        { status: 502 }
      );
    }

    await supabaseAdmin
      .from("sales_agents")
      .update({ vapi_phone_number: phoneNumber, twilio_phone_number_sid: twilioSid })
      .eq("id", id);
  }

  const otherAgent = await phoneUsedByOtherAgent(id, phoneNumber);
  if (otherAgent) {
    return NextResponse.json(
      { error: `${phoneNumber} is already connected to ${otherAgent}. Pick a different Twilio number.` },
      { status: 409 }
    );
  }

  let vapiNumber;
  try {
    vapiNumber = await resolveOrImportTwilioPhoneNumber({
      agentName: agent.name,
      phoneNumber,
      twilioAccountSid: accountSid,
      twilioAuthToken: authToken,
    });
  } catch (err) {
    const message =
      err instanceof VapiPhoneImportError
        ? err.message
        : `Connecting ${phoneNumber} to Vapi failed: ${
            err instanceof Error ? err.message : "unknown error"
          }. Retry — it will reuse this Twilio number, not buy another.`;

    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const configured = await configureInboundCallLogging(vapiNumber.id);
    if (!configured.ok && "error" in configured) {
      console.error("Inbound logging setup failed:", configured.error);
    }
  } catch (err) {
    console.error("Inbound logging setup failed:", err);
  }

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update({ vapi_phone_number_id: vapiNumber.id })
    .eq("id", id)
    .select("id, name, email, calendly_url, calendly_user_uri, vapi_phone_number, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only release a number on your own account" },
      { status: 403 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not configured" },
      { status: 500 }
    );
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("id, vapi_phone_number_id, vapi_phone_number, twilio_phone_number_sid")
    .eq("id", id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  if (!agent.vapi_phone_number_id && !agent.vapi_phone_number && !agent.twilio_phone_number_sid) {
    return NextResponse.json({ error: "no phone number to release" }, { status: 404 });
  }

  if (agent.vapi_phone_number_id) {
    await releaseVapiPhoneNumber(agent.vapi_phone_number_id);
  }

  let twilioSid = agent.twilio_phone_number_sid;
  if (!twilioSid && agent.vapi_phone_number) {
    try {
      twilioSid = await findTwilioNumberSid(accountSid, authToken, agent.vapi_phone_number);
    } catch {
      // Best-effort — still clear our record even if Twilio lookup fails.
    }
  }
  if (twilioSid) {
    await releaseTwilioNumber(accountSid, authToken, twilioSid);
  }

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update({
      vapi_phone_number_id: null,
      vapi_phone_number: null,
      twilio_phone_number_sid: null,
    })
    .eq("id", id)
    .select("id, name, email, calendly_url, calendly_user_uri, vapi_phone_number, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data });
}

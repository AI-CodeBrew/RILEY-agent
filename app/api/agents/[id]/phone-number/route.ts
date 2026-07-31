import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  findAvailableTwilioNumber,
  findTwilioNumberSid,
  purchaseTwilioNumber,
  releaseTwilioNumber,
} from "@/lib/twilio";
import { importTwilioPhoneNumber, releaseVapiPhoneNumber } from "@/lib/vapi";
import { requireApiSession } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // This spends money on a Twilio number, and the number becomes the caller ID
  // the agent dials from — so only the agent themselves can buy it. Admins are
  // read-only and never provision on someone else's behalf.
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only request a number for your own account" },
      { status: 403 }
    );
  }

  const { area_code } = await request.json().catch(() => ({ area_code: undefined }));

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
    .select("id, name, vapi_phone_number_id, vapi_phone_number, twilio_phone_number_sid")
    .eq("id", id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }
  if (agent.vapi_phone_number_id) {
    return NextResponse.json(
      { error: "agent already has a phone number" },
      { status: 409 }
    );
  }

  // A prior call may have already bought a Twilio number and only failed on
  // the Vapi import step — resume from there instead of buying another one.
  let phoneNumber = agent.vapi_phone_number;
  let twilioSid = agent.twilio_phone_number_sid;

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

    // Twilio charges the moment purchaseTwilioNumber succeeds, so persist the
    // SID/number right away — an import failure below shouldn't orphan a
    // number we're already paying for.
    await supabaseAdmin
      .from("sales_agents")
      .update({ vapi_phone_number: phoneNumber, twilio_phone_number_sid: twilioSid })
      .eq("id", id);
  }

  let vapiNumber;
  try {
    vapiNumber = await importTwilioPhoneNumber({
      agentName: agent.name,
      phoneNumber,
      twilioAccountSid: accountSid,
      twilioAuthToken: authToken,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Bought ${phoneNumber} from Twilio, but importing it into Vapi failed: ${
          err instanceof Error ? err.message : "unknown error"
        }. Retry — it'll reuse this number instead of buying another one.`,
      },
      { status: 502 }
    );
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

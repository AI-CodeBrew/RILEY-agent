import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  findAvailableTwilioNumber,
  listTwilioOwnedNumbers,
  purchaseTwilioNumber,
} from "@/lib/twilio";
import {
  configureInboundCallLogging,
  findVapiPhoneNumberByNumber,
  normalizeE164,
  resolveOrImportTwilioPhoneNumber,
  VapiPhoneImportError,
} from "@/lib/vapi";
import { requireApiSession } from "@/lib/auth";

/** Twilio numbers on the account, annotated with who (if anyone) already has them connected. */
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

  const [{ data: connected }, twilioNumbers] = await Promise.all([
    supabaseAdmin
      .from("agent_phone_numbers")
      .select("id, agent_id, phone_number, agent:sales_agents(name)"),
    listTwilioOwnedNumbers(accountSid, authToken),
  ]);

  const numbers = await Promise.all(
    twilioNumbers.map(async ({ sid, phoneNumber }: { sid: string; phoneNumber: string }) => {
      const owner = (connected ?? []).find(
        (row) => normalizeE164(row.phone_number) === normalizeE164(phoneNumber)
      );
      const inVapi = await findVapiPhoneNumberByNumber(phoneNumber);
      const connectedToOther = owner && owner.agent_id !== id;

      return {
        phoneNumber,
        twilioSid: sid,
        inVapi: Boolean(inVapi),
        vapiPhoneNumberId: inVapi?.id ?? null,
        assignedTo: connectedToOther ? (owner?.agent?.name ?? null) : null,
        connectedToMe: Boolean(owner && owner.agent_id === id),
        connectedId: owner && owner.agent_id === id ? owner.id : null,
        available: !connectedToOther,
      };
    })
  );

  return NextResponse.json({ numbers });
}

/** Connects (adds) one more number for this agent — never touches numbers already connected. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only connect a number to your own account" },
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

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name")
    .eq("id", id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  let phoneNumber: string | undefined;
  let twilioSid: string | undefined;

  if (requestedPhone) {
    const normalized = normalizeE164(requestedPhone);
    const { data: existingOwner } = await supabaseAdmin
      .from("agent_phone_numbers")
      .select("agent_id, agent:sales_agents(name)")
      .eq("phone_number", normalized)
      .maybeSingle();

    if (existingOwner && existingOwner.agent_id !== id) {
      return NextResponse.json(
        {
          error: `${normalized} is already connected to ${existingOwner.agent?.name ?? "another agent"}. Each connected number can only belong to one agent.`,
        },
        { status: 409 }
      );
    }
    if (existingOwner && existingOwner.agent_id === id) {
      return NextResponse.json(
        { error: `${normalized} is already connected to your account.` },
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
  } else {
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
  }

  if (!phoneNumber || !twilioSid) {
    return NextResponse.json({ error: "Failed to resolve a Twilio number" }, { status: 502 });
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
    .from("agent_phone_numbers")
    .upsert(
      {
        agent_id: id,
        phone_number: phoneNumber,
        twilio_phone_number_sid: twilioSid,
        vapi_phone_number_id: vapiNumber.id,
      },
      { onConflict: "phone_number" }
    )
    .select("id, phone_number")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ number: data }, { status: 201 });
}

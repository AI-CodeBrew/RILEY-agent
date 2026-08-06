import { NextResponse } from "next/server";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { getVapiCallTranscript } from "@/lib/vapi";
import type { Call } from "@/types/database";

/** Always re-fetches the transcript from Vapi rather than trusting the DB copy. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Call>("calls", id, auth.session);
  if ("error" in authorized) return authorized.error;
  const call = authorized.row;

  if (!call.vapi_call_id) {
    return NextResponse.json({ transcript: call.transcript ?? null });
  }

  try {
    const transcript = await getVapiCallTranscript(call.vapi_call_id);
    return NextResponse.json({ transcript: transcript ?? call.transcript ?? null });
  } catch {
    return NextResponse.json({ transcript: call.transcript ?? null });
  }
}

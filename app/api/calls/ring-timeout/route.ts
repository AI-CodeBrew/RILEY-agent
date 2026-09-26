import { NextResponse } from "next/server";
import {
  runRingTimeoutCut,
  ringTimeoutWorkerSecret,
  type RingTimeoutCutParams,
} from "@/lib/ring-timeout";

/**
 * Dedicated production worker for the unanswered-ring cut.
 *
 * Triggered by scheduleRingTimeoutCut via server-to-server fetch so the
 * hangup has its own maxDuration budget and is not killed when the portal
 * /campaign trigger request finishes (Next `after()` alone was unreliable
 * on production for James CA dials — no dial_timeline, voicemail at ~25s).
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = ringTimeoutWorkerSecret();
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RingTimeoutCutParams | null;
  if (
    !body?.callId ||
    !body?.vapiCallId ||
    !body?.agentId ||
    typeof body.ringTimeoutSeconds !== "number"
  ) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  await runRingTimeoutCut({
    callId: body.callId,
    vapiCallId: body.vapiCallId,
    controlUrl: body.controlUrl ?? null,
    agentId: body.agentId,
    ringTimeoutSeconds: body.ringTimeoutSeconds,
  });

  return NextResponse.json({ ok: true });
}

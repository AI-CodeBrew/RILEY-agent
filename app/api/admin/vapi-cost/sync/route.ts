import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { syncVapiCosts } from "@/lib/vapi-cost";

// Downloads full call objects from Vapi for the window, which can take tens
// of seconds on a busy day.
export const maxDuration = 60;

const MAX_WINDOW_MS = 2 * 86_400_000;

/**
 * Admin-only: re-reads one window of calls from Vapi and corrects their saved
 * cost. The Costs page's "Sync from Vapi" button walks back a day at a time
 * through everything Vapi still keeps, one request per day, so no single
 * request has to outlast `maxDuration`.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { fromMs, toMs } = await request.json().catch(() => ({}));
  if (
    typeof fromMs !== "number" ||
    typeof toMs !== "number" ||
    !(fromMs < toMs) ||
    toMs - fromMs > MAX_WINDOW_MS
  ) {
    return NextResponse.json(
      { error: "fromMs and toMs must be timestamps at most 2 days apart" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await syncVapiCosts({ fromMs, toMs }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync costs from Vapi." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import { ZOOM_AUTHORIZE_URL, zoomRedirectUri } from "@/lib/zoom";

/** Kicks off "connect your Zoom account" — a real top-level redirect, not a fetch, since OAuth needs the browser to actually navigate to Zoom. */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!process.env.ZOOM_CLIENT_ID) {
    return NextResponse.json(
      { error: "Zoom isn't configured yet — ZOOM_CLIENT_ID is missing." },
      { status: 500 }
    );
  }

  const state = await createOAuthState(auth.session.agent.id, "zoom");

  const url = new URL(ZOOM_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.ZOOM_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", zoomRedirectUri(request.url));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import {
  GOOGLE_MEET_AUTHORIZE_URL,
  GOOGLE_MEET_SCOPES,
  googleMeetRedirectUri,
} from "@/lib/google-meet";

/** Kicks off "connect your Google account for Meet" — a real top-level redirect, not a fetch, since OAuth needs the browser to actually navigate to Google. */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!process.env.GOOGLE_MEET_CLIENT_ID) {
    return NextResponse.json(
      { error: "Google Meet isn't configured yet — GOOGLE_MEET_CLIENT_ID is missing." },
      { status: 500 }
    );
  }

  const state = await createOAuthState(auth.session.agent.id, "google_meet");

  const url = new URL(GOOGLE_MEET_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_MEET_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", googleMeetRedirectUri(request.url));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_MEET_SCOPES);
  url.searchParams.set("state", state);
  // access_type=offline gets us a refresh_token; prompt=consent forces Google
  // to reissue one even on a reconnect, when it would otherwise omit it.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import {
  GOOGLE_SHEETS_AUTHORIZE_URL,
  GOOGLE_SHEETS_SCOPES,
  googleSheetsRedirectUri,
} from "@/lib/google-sheets";

/** Kicks off "connect your Google account for lead-sheet import" — see app/api/oauth/google-meet/start for the same pattern. */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!process.env.GOOGLE_MEET_CLIENT_ID) {
    return NextResponse.json(
      { error: "Google isn't configured yet — GOOGLE_MEET_CLIENT_ID is missing." },
      { status: 500 }
    );
  }

  const state = await createOAuthState(auth.session.agent.id, "google_sheets");

  const url = new URL(GOOGLE_SHEETS_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_MEET_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", googleSheetsRedirectUri(request.url));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SHEETS_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}

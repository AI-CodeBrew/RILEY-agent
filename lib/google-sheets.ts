/**
 * Google Sheets lead-import — OAuth connection flow plus the Drive/Sheets
 * REST calls used by the picker-token/select-sheet/mapping routes and the
 * process-sheet-leads poller. Same shape as lib/google-meet.ts (own OAuth
 * client, plain fetch calls, no googleapis dependency — this codebase
 * doesn't use the Google Node SDK anywhere).
 *
 * Scope is deliberately just `drive.file`: the app never sees anything in
 * an agent's Drive except the one spreadsheet they explicitly pick via the
 * Google Picker. That same drive.file grant is enough to also call the
 * Sheets API on that file (Sheets API accepts drive.file as an authorized
 * scope for a file opened through it) — no separate `spreadsheets` scope
 * needed.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_SHEETS_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

export { AUTHORIZE_URL as GOOGLE_SHEETS_AUTHORIZE_URL };

/** Must resolve identically in /start and /callback. */
export function googleSheetsRedirectUri(requestUrl: string): string {
  return new URL("/api/oauth/google-sheets/callback", requestUrl).toString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

/** Same OAuth client as Google Meet — one Cloud Console project/client, scopes vary per flow. */
function googleClientCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: requireEnv("GOOGLE_MEET_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_MEET_CLIENT_SECRET"),
  };
}

export interface GoogleSheetsTokens {
  access_token: string;
  /** Only present when Google actually issues one (prompt=consent forces this even on reconnect). */
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeGoogleSheetsCode(
  code: string,
  redirectUri: string
): Promise<GoogleSheetsTokens> {
  const { clientId, clientSecret } = googleClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** Google does not rotate the refresh token on use — callers keep the existing one. */
export async function refreshGoogleSheetsAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = googleClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Google token refresh failed (${res.status}): ${detail}`);
    (err as Error & { invalidGrant?: boolean }).invalidGrant = detail.includes("invalid_grant");
    throw err;
  }
  return res.json();
}

export async function getGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

/** Drive file name + modifiedTime, for the picker result and for the poller's skip-if-unchanged check. */
export async function getDriveFileMeta(
  fileId: string,
  accessToken: string
): Promise<{ name: string; modifiedTime: string }> {
  const url = new URL(`${DRIVE_FILES_URL}/${fileId}`);
  url.searchParams.set("fields", "name,modifiedTime");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive files.get failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** First sheet's tab name (Picker only returns the spreadsheet's own file id, not a tab). */
export async function getFirstSheetTitle(spreadsheetId: string, accessToken: string): Promise<string> {
  const url = new URL(`${SHEETS_URL}/${spreadsheetId}`);
  url.searchParams.set("fields", "sheets.properties.title");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets get failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("Spreadsheet has no sheets");
  return title;
}

/** 0-based column index -> spreadsheet letter ("A", "B", ..., "AA", ...). */
export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Inverse of columnIndexToLetter — "A" -> 0, "B" -> 1, ..., "AA" -> 26. */
export function letterToColumnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Reads row 1 (header) of a sheet tab. */
export async function readSheetHeaders(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<string[]> {
  const range = encodeURIComponent(`${sheetTitle}!1:1`);
  const url = `${SHEETS_URL}/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets values.get failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values?.[0] ?? [];
}

/** Reads every row strictly after `afterRow` (1-based: afterRow=1 skips just the header). */
export async function readSheetRowsAfter(
  spreadsheetId: string,
  sheetTitle: string,
  afterRow: number,
  accessToken: string
): Promise<{ rows: string[][]; totalRowCount: number }> {
  const startRow = afterRow + 1;
  const range = encodeURIComponent(`${sheetTitle}!A${startRow}:ZZ`);
  const url = `${SHEETS_URL}/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets values.get failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  return { rows, totalRowCount: afterRow + rows.length };
}

/** Current total row count (used to set the "only new rows from now on" baseline at connect time). */
export async function getSheetRowCount(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<number> {
  const range = encodeURIComponent(`${sheetTitle}!A:A`);
  const url = `${SHEETS_URL}/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets values.get failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values?.length ?? 1;
}

/**
 * Mints a fresh access token from a stored (encrypted) refresh token. No
 * access_token/expires_at is cached on the connection row — this app's own
 * usage (a handful of agents, polled every 15s only when something changed)
 * doesn't need that optimization, and skipping it avoids another column to
 * keep in sync. Throws with `.invalidGrant = true` when the refresh token
 * itself has been revoked, so callers can tell "disconnect this agent" apart
 * from a transient network/API error.
 */
export async function getValidAccessToken(encryptedRefreshToken: string): Promise<string> {
  const { decryptToken } = await import("@/lib/token-crypto");
  const refreshToken = await decryptToken(encryptedRefreshToken);
  if (!refreshToken) throw new Error("No refresh token on file");
  const { access_token } = await refreshGoogleSheetsAccessToken(refreshToken);
  return access_token;
}

/**
 * Pushes vapi/assistant.json to Vapi.
 *
 *   npm run vapi:sync            # PATCH VAPI_ASSISTANT_ID, or create if unset
 *   npm run vapi:sync -- --create # always create a new assistant
 *   npm run vapi:sync -- --dry    # print the resolved payload, send nothing
 *
 * <SUPABASE_PROJECT_URL> and <VAPI_SERVER_SECRET> in the JSON are substituted
 * from .env.local here, which is why neither is committed to the repo.
 */
import { readFile } from "node:fs/promises";

const dryRun = process.argv.includes("--dry");
const forceCreate = process.argv.includes("--create");

const apiKey = process.env.VAPI_API_KEY;
const assistantId = process.env.VAPI_ASSISTANT_ID;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverSecret = process.env.VAPI_SERVER_SECRET;

if (!apiKey) {
  console.error("Missing VAPI_API_KEY in .env.local");
  process.exit(1);
}
if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL in .env.local — the tool/webhook URLs need it.");
  process.exit(1);
}
if (!serverSecret) {
  console.error(
    "Missing VAPI_SERVER_SECRET in .env.local — the Edge Functions reject calls without it.\n" +
      "Pick any long random string, put it here and in `supabase secrets set VAPI_SERVER_SECRET=…`."
  );
  process.exit(1);
}

const raw = await readFile(new URL("../vapi/assistant.json", import.meta.url), "utf8");
const resolved = raw
  .replaceAll("<SUPABASE_PROJECT_URL>", supabaseUrl.replace(/\/$/, ""))
  .replaceAll("<VAPI_SERVER_SECRET>", serverSecret);

const payload = JSON.parse(resolved);
delete payload._comment;

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const create = forceCreate || !assistantId;
const res = await fetch(
  create ? "https://api.vapi.ai/assistant" : `https://api.vapi.ai/assistant/${assistantId}`,
  {
    method: create ? "POST" : "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
);

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Vapi rejected the assistant (${res.status}):`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (create) {
  console.log(`Created assistant ${body.id}.`);
  console.log(`Add it to .env.local:  VAPI_ASSISTANT_ID=${body.id}`);
} else {
  console.log(`Updated assistant ${body.id ?? assistantId}.`);
}

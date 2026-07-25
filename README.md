# Riley Booking

Internal portal for an outbound voice-agent appointment-booking system.
Next.js (App Router) + Supabase (Postgres/Auth/Edge Functions) + Vapi
(voice AI over Twilio) + Calendly (agent scheduling).

Single-tenant, no auth/roles yet — customers are added manually through the
form. Everything talks to Supabase through the service role key from
server-side code only (API routes, Server Components, Edge Functions).

## Architecture

```
Next.js portal (/customers, /agents, /dashboard)
        │  (service role key, server-side only)
        ▼
   Supabase Postgres  ◄──────────────────────────────┐
        ▲                                            │
        │ writes                                    │ writes
        │                                            │
Edge Fn: vapi-webhook-handler                Edge Fn: calendly-webhook-handler
        ▲ (end-of-call-report,                       ▲ (invitee.created/canceled,
        │  incl. transcript + recording url)         │  fires once the customer clicks
        │                                            │  the confirmation link)
      Vapi call ──── places call via Twilio ──── customer's phone
        │
        │ (function/tool calls mid-call)
        ▼
Edge Fn: check-agent-availability ──► Calendly API (free/busy)
Edge Fn: book-appointment ───────────► Calendly API (single-use scheduling link)
                                └─────► Resend (confirmation emails)
```

Each sales agent gets **their own** phone number — one click on `/agents`
buys a Twilio number under the business's Twilio account and imports it
into Vapi (`lib/twilio.ts` + `lib/vapi.ts::importTwilioPhoneNumber`) — and,
once they paste a Calendly personal access token, their own webhook
subscription so `calendly-webhook-handler` knows which agent a Calendly
event belongs to. Agents never need their own Vapi or Twilio login.

## 1. Database setup

Run the migrations in `supabase/migrations/` against your Supabase project,
in order — either:

- Paste each file into the Supabase Dashboard → SQL Editor → Run, or
- With the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:
  ```bash
  supabase login
  supabase link --project-ref <your-project-ref>
  supabase db push
  ```

This creates `customers`, `sales_agents`, `appointments`, `calls` (with RLS
locked to `service_role`), plus columns for call recordings and per-agent
Vapi/Calendly connections.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- **Supabase**: project URL + service role key (Dashboard → Settings → API).
- **Vapi**: API key and assistant ID (after creating the assistant, step 4).
  `VAPI_PHONE_NUMBER_ID` is just a fallback — normally each agent gets their
  own number, see §3. Also set `VAPI_SERVER_SECRET` (verifies incoming
  tool-call/webhook requests actually came from Vapi) — same value as the
  `supabase secrets set` call in step 4.
- **Twilio**: `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` for the one business
  account that purchases agent numbers (Console → Account → API keys &
  tokens — the main Account SID/Auth Token, not a sub-key). Trial accounts
  can buy numbers but can only call caller-verified destinations until
  upgraded.
- **Resend**: API key for confirmation emails (or swap
  `supabase/functions/_shared/email.ts` for your own provider).

Calendly access tokens are **not** set as env vars — they're entered
per-agent on the `/agents` page and stored in `sales_agents`, since each
agent connects their own Calendly account.

## 3. Run the portal

```bash
npm install
npm run dev
```

- `/customers` — add customers, view status, jump to a customer to call them.
- `/agents` — add sales agents, click **Get phone number** to buy them a
  Twilio number and connect it to Vapi, and paste their Calendly personal
  access token
  (Calendly → Integrations → API & Webhooks → Generate New Token). The
  token is validated against `/users/me` and a webhook subscription is
  created automatically (needs a Calendly plan that supports webhooks —
  Standard tier or above; if it's not available the agent still saves, it
  just won't auto-confirm appointments, see §6).
- `/customers/[id]` — trigger an outbound call, assigned to a chosen agent;
  call history shows transcript + a recording player once the call ends.
- `/dashboard` — appointments, filterable by agent.

## 4. Deploy Edge Functions

```bash
supabase functions deploy check-agent-availability
supabase functions deploy book-appointment
supabase functions deploy vapi-webhook-handler
supabase functions deploy calendly-webhook-handler

# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
# Set the rest:
supabase secrets set VAPI_SERVER_SECRET=<same value as .env.local>
supabase secrets set RESEND_API_KEY=<your resend key>
supabase secrets set EMAIL_FROM_ADDRESS=bookings@yourdomain.com
```

## 5. Vapi assistant setup

1. Fill in `vapi/assistant.json`: replace `<PASTE APPOINTMENT-SETTING
   SCRIPT HERE>` with your script, `<SUPABASE_PROJECT_URL>` with your
   project URL, `<VAPI_SERVER_SECRET>` with the same secret from step 4, and
   `<ELEVENLABS_VOICE_ID>` with a voice.
2. Create the assistant:
   ```bash
   curl -X POST https://api.vapi.ai/assistant \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -H "Content-Type: application/json" \
     -d @vapi/assistant.json
   ```
   Copy the returned `id` into `VAPI_ASSISTANT_ID`.
3. Phone numbers are per-agent (`/agents` → **Get phone number**): the app
   searches Twilio for an available local number, buys it under your
   `TWILIO_ACCOUNT_SID`, then registers it with Vapi
   (`lib/twilio.ts` + `lib/vapi.ts::importTwilioPhoneNumber`). If the Vapi
   import step fails after the Twilio purchase succeeds, the number's SID is
   saved (`sales_agents.twilio_phone_number_sid`) and retrying resumes from
   there instead of buying a second number.

## 6. How appointment confirmation actually closes the loop

Calendly's public API has no endpoint to create a booking headlessly —
booking always happens on a Calendly-hosted page. So `book-appointment`
creates a **single-use scheduling link**, pre-filled with the customer's
name/email, and emails it to them to confirm with one click; the
`appointments` row is written immediately with status `scheduled` so it
shows up on the dashboard right away.

When the customer clicks through and picks the time, Calendly fires an
`invitee.created` webhook at `calendly-webhook-handler` (subscribed
per-agent when they connect Calendly — see `lib/calendly.ts`), which flips
that appointment to `confirmed`, fills in the real `calendly_event_uri`,
and captures the Zoom/Meet join link if the agent's event type has one.
`invitee.canceled` flips it to `canceled` the same way.

If an agent's Calendly plan doesn't support webhooks, appointments just
stay at `scheduled` — everything else still works.

## Repo layout

```
app/                       Next.js App Router pages + API routes
lib/                        Supabase admin client, Vapi + Calendly clients, shared UI bits
components/                 Shared UI primitives (Button, Card, Sidebar, ...)
types/database.ts           Row types matching the schema
supabase/migrations/        SQL schema
supabase/functions/         Edge Functions (Deno)
vapi/assistant.json         Vapi assistant config template
```

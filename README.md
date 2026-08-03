# Riley Booking

Portal for an outbound voice-agent appointment-booking system.
Next.js (App Router) + Supabase (Postgres/Auth/Edge Functions) + Vapi
(voice AI over Twilio) + Calendly (agent scheduling).

Every sales agent signs in with their own account and sees only their own
customers, calls and appointments. Admins see the whole team and provision
new agents. Data access always goes through the service role key from
server-side code (Route Handlers, Server Components, Edge Functions) — the
signed-in agent's scope is applied in `lib/auth.ts`.

## Architecture

```
                    ┌──────────────────────────────┐
   browser ────────►│ proxy.ts (session refresh +  │
                    │ redirect anonymous → /login) │
                    └──────────────┬───────────────┘
                                   ▼
Next.js portal (/dashboard, /customers, /appointments, /calls, /agents, /settings)
        │  lib/auth.ts: who is this, and what are they allowed to see
        │  (service role key, server-side only)
        ▼
   Supabase Postgres  ◄──────────────────────────────┐
        ▲                                            │
        │ writes                                     │ writes
        │                                            │
Edge Fn: vapi-webhook-handler                Edge Fn: calendly-webhook-handler
        ▲ (status-update → live call state;          ▲ (invitee.created/canceled,
        │  end-of-call-report → transcript,          │  fires once the customer clicks
        │  recording, duration, cost)                │  the confirmation link)
        │                                            │
      Vapi call ──── places call via Twilio ──── customer's phone
        │  ▲
        │  └── POST monitor.controlUrl {"type":"end-call"}  ← "Hang up" in the portal
        │
        │ (function/tool calls mid-call)
        ▼
Edge Fn: check-agent-availability ──► Calendly API (free/busy)
Edge Fn: book-appointment ───────────► Calendly API (single-use scheduling link)
                                └─────► Resend (confirmation emails)
```

Each sales agent gets **their own** phone number — one click under
Settings → Outbound number buys a Twilio number under the business's Twilio
account and imports it into Vapi (`lib/twilio.ts` +
`lib/vapi.ts::importTwilioPhoneNumber`) — and, once they paste a Calendly
personal access token, their own webhook subscription so
`calendly-webhook-handler` knows which agent a Calendly event belongs to.
Agents never need their own Vapi or Twilio login.

## What's in the portal

| Screen | What it does |
|---|---|
| `/login` | Email + password. Rejects logins with no active `sales_agents` row. |
| `/dashboard` | KPIs, 14-day booking trend, call-outcome breakdown, live-call strip with hang-up, next 5 appointments. |
| `/customers` | Your book of business — search, status filters, add/edit, do-not-call. |
| `/customers/[id]` | Trigger a call now or schedule one, watch it go ringing → connected → ended, hang up mid-call, read transcripts and play recordings. |
| `/appointments` | Everything Riley booked plus manual entries: upcoming/past filters, mark completed / no-show, cancel (which cancels the Calendly event too), reschedule links, join links. |
| `/calls` | Call log with live calls at the top, talk time and spend, cancel buttons. |
| `/agents` | **Admins only.** Create agent logins, reset passwords, promote to admin, deactivate, buy numbers, connect Calendly. |
| `/settings` | Each agent's own profile, time zone, password, Calendly connection and outbound number. |

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

This creates `customers`, `sales_agents`, `appointments`, `calls`, then
(migration 5) links agents to Supabase Auth users, adds customer ownership,
live call state, and the appointment fields the portal manages. Migration 7
adds the will-kit request fields Riley confirms on the call (province, kit
count, mailing address, request date, confirmation code).

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- **Supabase**: project URL, **anon key** (needed for sign-in) and service
  role key (Dashboard → Settings → API).
- **Vapi**: API key and assistant ID, plus `VAPI_SERVER_SECRET` — any long
  random string; it's what proves an incoming tool-call/webhook really came
  from Vapi, and it must match the Edge Function secret in step 5.
- **Twilio**: `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` for the one business
  account that purchases agent numbers. Trial accounts can buy numbers but
  can only call caller-verified destinations until upgraded.
- **Resend**: API key for confirmation emails (or swap
  `supabase/functions/_shared/email.ts` for your own provider).

Calendly access tokens are **not** env vars — each agent connects their own
Calendly account from Settings, and the token is stored on `sales_agents`.

## 3. Create the first admin

Agents can't self-register; an admin creates their logins. Bootstrap the
first one:

```bash
npm install
npm run create-admin -- --email you@company.com --password "a-long-password" --name "Your Name"
```

Safe to re-run — it reuses an existing Supabase user and resets the password.

## 4. Run the portal

```bash
npm run dev
```

Sign in at `/login`, then:

1. **Settings** → connect your Calendly and click **Get my number**.
2. **Customers** → add a customer.
3. Open the customer → **Call now** (or **Schedule for later**).
4. Watch it on **Calls**; hang up from there or the dashboard strip if needed.
5. Booked meetings land on **Appointments**, where they can be completed,
   marked no-show, rescheduled or canceled without opening Calendly.

Admins add the rest of the team under **Sales Agents** — each gets a login,
their own customers, their own number and their own calendar.

## 5. Deploy Edge Functions

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

## 6. Vapi assistant

`vapi/assistant.json` mirrors the stack shown in the Vapi dashboard:
Deepgram **Flux** transcription, OpenAI **GPT-4o mini**, Vapi **Savannah** voice
(Ultra Fast preset — lowest latency), `assistant-speaks-first`, plus the two tools
(`check_agent_availability`, `book_appointment`) and the webhook that records
call state.

```bash
npm run vapi:sync -- --create   # first time: creates it, prints the id
npm run vapi:sync               # after that: PATCHes VAPI_ASSISTANT_ID
npm run vapi:sync -- --dry      # print the resolved payload, send nothing
```

The script substitutes `<SUPABASE_PROJECT_URL>` and `<VAPI_SERVER_SECRET>`
from `.env.local`, which is why no secret is committed in the JSON.

> If you already created this assistant by hand in the dashboard, put its id
> in `VAPI_ASSISTANT_ID` before running `npm run vapi:sync` — otherwise
> you'll end up with two. The system prompt in the JSON is the one to edit.
>
> **Model names move.** If Vapi rejects `gpt-4o-mini`, `flux-general-en`, or `Savannah`,
> copy the exact ids from the dashboard's Ultra Fast preset (or model/voice pickers) into
> `vapi/assistant.json`. You can also set the preset in the dashboard and run
> `npm run vapi:sync -- --dry` to compare.

### The script and its variables

The system prompt is a will-kit appointment setter: Riley calls a lead who
requested a free Last Will & Testament kit online, confirms the details of
that request, and books the screen-share walkthrough onto the agent's
Calendly. The greeting is a literal `firstMessage` ("Hi, is this
{{customerName}}?") so it plays instantly with no model latency, and every
lead detail is a Vapi variable filled in per call by
`lib/vapi.ts::triggerOutboundCall`:

| Variable | Source |
|---|---|
| `customerName`, `customerEmail` | `customers.name` / `.email` |
| `province`, `kitCount`, `mailingAddress`, `requestDate` | the will-kit fields on `customers` |
| `confirmationCode` | `customers.confirmation_code`, generated by the DB, read out in the write-down close |
| `agentName`, `agentNumber` | the calling agent and their own outbound number |
| `agentId`, `customerId` | ids the tools need as arguments |

Anything the lead's record doesn't have is sent as the literal string
**`not on file`**, never a blank. The prompt treats that as "you don't know
this" — Riley asks the lead instead of asserting it, and the prompt forbids
claiming any delivery, prior contact, policy or benefit, since the portal
holds no such record. Leaving a field empty in the portal is therefore safe;
it turns a statement into a question. `/customers/[id]` shows which fields
are missing.

### Rehearsing the script without a phone call

`vapi/assistant-sandbox.json` is a standalone copy for practising the script
in the browser — **"Riley (rehearsal)"** in the Vapi dashboard:

```bash
npm run vapi:sync:sandbox -- --create   # first time
npm run vapi:sync:sandbox               # after that (VAPI_SANDBOX_ASSISTANT_ID)
```

It has no tools, no webhook, no Calendly and no `{{variables}}` — one fake
lead (Michael Brown, Ontario, 2 kits, code 4B7C2E) and a fixed list of
calendar openings are written into the prompt, so **Talk to assistant** in
the dashboard works with nothing else configured. Nothing it does is
recorded in the portal; it books nothing. To rehearse the "not on file"
branch, replace a detail in its prompt with the literal `not on file` and
re-sync. Keep `VAPI_ASSISTANT_ID` pointed at the real assistant — the portal
should never dial this one.

`serverMessages` includes `status-update` as well as `end-of-call-report` —
that's what drives the live "ringing / on the call" state in the portal. If
you edit the assistant in the dashboard instead, keep both.

## 7. How appointment confirmation actually closes the loop

Calendly's public API has no endpoint to create a booking headlessly —
booking always happens on a Calendly-hosted page. So `book-appointment`
creates a **single-use scheduling link**, pre-filled with the customer's
name/email, and emails it to them to confirm with one click; the
`appointments` row is written immediately with status `scheduled` (the link
itself is kept in `booking_url`) so it shows up in the portal right away.

When the customer clicks through and picks the time, Calendly fires an
`invitee.created` webhook at `calendly-webhook-handler`, which flips that
appointment to `confirmed`, fills in the real `calendly_event_uri`, the
Zoom/Meet join link, and Calendly's own cancel/reschedule URLs — which is
what makes the portal's cancel and reschedule buttons work.
`invitee.canceled` flips it to `canceled` the same way.

If an agent's Calendly plan doesn't support webhooks, appointments stay at
"awaiting confirmation" — everything else still works, and Settings shows an
"Auto-confirm off" badge so it's not a mystery.

## Canceling calls

Two different things, handled in `lib/vapi.ts::cancelVapiCall`:

- **Not dialled yet** (scheduled or queued) — `DELETE /call/{id}` drops it
  from Vapi's queue; the customer's phone never rings.
- **Live** (ringing or connected) — POST `{"type":"end-call"}` to the call's
  `monitor.controlUrl`, captured on `calls.control_url` when the call was
  created because it isn't retrievable afterwards.

Either way the row lands on `canceled`, and the customer comes out of
"calling" so they can be redialled.

## Roles

| | Agent | Admin |
|---|---|---|
| See their own customers/calls/appointments | ✅ | ✅ |
| See everyone's | — | ✅ |
| Call on another agent's behalf | — | ✅ |
| Reassign a customer to another agent | — | ✅ |
| Create logins, reset passwords, deactivate | — | ✅ |
| Connect their own Calendly + get a number | ✅ | ✅ |

## Repo layout

```
app/(auth)/                 Sign-in screen
app/(portal)/               Everything behind the auth gate
app/api/                    Route handlers (all gated by requireApiSession)
proxy.ts                    Session refresh + anonymous redirect (Next 16 renamed middleware → proxy)
lib/auth.ts                 Who's signed in, and the scope every query gets
lib/supabase-admin.ts       Service-role client (server only)
lib/supabase-server.ts      Session-bound client (auth only)
lib/vapi.ts                 Trigger, schedule, poll and cancel calls
lib/calendly.ts             Connect an agent, subscribe webhooks, cancel events
components/                 Shared UI (Button, Modal, Toast, Charts, ...)
types/database.ts           Row types matching the schema
supabase/migrations/        SQL schema
supabase/functions/         Edge Functions (Deno)
vapi/assistant.json         Vapi assistant config (synced with npm run vapi:sync)
scripts/                    create-admin, sync-assistant
```

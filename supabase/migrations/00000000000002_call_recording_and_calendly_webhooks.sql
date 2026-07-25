-- Adds call recording playback and the plumbing needed for
-- calendly-webhook-handler to confirm appointments automatically once a
-- customer completes the Calendly booking link.

alter table calls
  add column if not exists recording_url text;

alter table sales_agents
  add column if not exists calendly_webhook_uri text,
  add column if not exists calendly_webhook_signing_key text;

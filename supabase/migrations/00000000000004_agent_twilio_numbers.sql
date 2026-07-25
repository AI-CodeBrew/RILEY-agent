-- Numbers are now purchased from Twilio (one business Twilio account) per
-- agent, then imported into Vapi as a "twilio" provider phone number.
-- sales_agents.vapi_phone_number_id / vapi_phone_number (added in migration
-- 00000000000003) still hold the Vapi-side id/number; this adds the
-- Twilio-side incoming phone number SID so it can be released later if an
-- agent is removed.

alter table sales_agents
  add column if not exists twilio_phone_number_sid text;

-- Lets an agent connect their own Twilio account from Settings (Connect
-- Twilio / Disconnect Twilio), alongside the existing shared business
-- account used for number provisioning. Mirrors the calendly_* columns
-- added in 00000000000001_initial_schema.sql.

alter table sales_agents
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token text,
  add column if not exists twilio_account_name text,
  add column if not exists twilio_connected_at timestamptz;

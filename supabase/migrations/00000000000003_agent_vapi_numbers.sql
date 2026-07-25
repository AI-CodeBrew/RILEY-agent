-- Each sales agent gets their own outbound caller ID, provisioned from
-- Vapi directly (POST /phone-number, provider "vapi") from the /agents
-- page instead of sharing one global VAPI_PHONE_NUMBER_ID.

alter table sales_agents
  add column if not exists vapi_phone_number_id text,
  add column if not exists vapi_phone_number text;

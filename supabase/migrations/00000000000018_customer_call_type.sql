-- Which script a customer's call follows: POS, Union, or Will Kit. Same
-- three values as sales_agents.default_script (see
-- 00000000000015_agent_ai_integration_defaults.sql), but per-customer so a
-- future call-routing step can pick the right assistant/script per lead
-- instead of per agent.
--
-- Nullable — existing customers predate this field, so it's left unset
-- until someone assigns one rather than defaulting it to a guess.

alter table customers
  add column if not exists call_type text
    check (call_type in ('POS', 'UNION', 'WILL_KIT'));

-- Adds WILL_KIT_PRO as a 4th allowed call_type/default_script value, for the
-- new Riley assistant (see vapi/assistant-willkitpro.json). Postgres can't
-- alter a check constraint in place, so each is dropped and recreated with
-- the new value included — same auto-generated name Postgres gave the
-- original inline `check (...)` in 00000000000018/00000000000015.

alter table customers
  drop constraint if exists customers_call_type_check,
  add constraint customers_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'WILL_KIT_PRO'));

alter table sales_agents
  drop constraint if exists sales_agents_default_script_check,
  add constraint sales_agents_default_script_check
    check (default_script in ('POS', 'UNION', 'WILL_KIT', 'WILL_KIT_PRO'));

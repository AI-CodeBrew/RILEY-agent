-- Adds ASSOCIATION as a 4th allowed call_type/default_script/script value,
-- for the new Tom/association-card assistant (see
-- vapi/assistant-association.json — a copy of the Union script with
-- "union"/"union card" swapped for "association"/"association card").
-- Postgres can't alter a check constraint in place, so each is dropped and
-- recreated with the new value included — same pattern as
-- 00000000000024_will_kit_pro_call_type.sql.

alter table customers
  drop constraint if exists customers_call_type_check,
  add constraint customers_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION'));

alter table sales_agents
  drop constraint if exists sales_agents_default_script_check,
  add constraint sales_agents_default_script_check
    check (default_script in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION'));

alter table dial_campaign_windows
  drop constraint if exists dial_campaign_windows_call_type_check,
  add constraint dial_campaign_windows_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION') or call_type is null);

alter table rebuttals
  drop constraint if exists rebuttals_script_check,
  add constraint rebuttals_script_check
    check (script in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION'));

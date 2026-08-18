-- Reverts 00000000000024_will_kit_pro_call_type.sql — the WILL_KIT_PRO
-- script/assistant was removed, so the 4th allowed value is dropped again.
-- No existing rows can hold 'WILL_KIT_PRO' (nothing was ever set to it), so
-- narrowing the constraint back is safe.

alter table customers
  drop constraint if exists customers_call_type_check,
  add constraint customers_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT'));

alter table sales_agents
  drop constraint if exists sales_agents_default_script_check,
  add constraint sales_agents_default_script_check
    check (default_script in ('POS', 'UNION', 'WILL_KIT'));

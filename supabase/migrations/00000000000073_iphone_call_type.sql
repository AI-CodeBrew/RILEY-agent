-- Adds IPHONE as an 8th allowed call_type/default_script/script value, for the
-- SmartGadgets iPhone 18 sales assistant (see vapi/assistant-iphone.json).
-- Same drop-and-recreate pattern as 00000000000070_recpaz_call_type.sql.

alter table customers
  drop constraint if exists customers_call_type_check,
  add constraint customers_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION', 'POS_LIBERTY', 'RECRUITMENT', 'RECPAZ', 'IPHONE'));

alter table sales_agents
  drop constraint if exists sales_agents_default_script_check,
  add constraint sales_agents_default_script_check
    check (default_script in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION', 'POS_LIBERTY', 'RECRUITMENT', 'RECPAZ', 'IPHONE'));

alter table dial_campaign_windows
  drop constraint if exists dial_campaign_windows_call_type_check,
  add constraint dial_campaign_windows_call_type_check
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION', 'POS_LIBERTY', 'RECRUITMENT', 'RECPAZ', 'IPHONE') or call_type is null);

alter table rebuttals
  drop constraint if exists rebuttals_script_check,
  add constraint rebuttals_script_check
    check (script in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION', 'POS_LIBERTY', 'RECRUITMENT', 'RECPAZ', 'IPHONE'));

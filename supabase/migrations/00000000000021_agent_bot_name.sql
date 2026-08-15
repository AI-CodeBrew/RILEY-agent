-- Per-agent bot persona name, settable from the AI Integration page like
-- default_voice_gender/default_script. Null means "not chosen yet" — the
-- assistant falls back to the script's existing default persona (Abby for
-- POS, Tom for Union, Alex for Will Kit); see lib/vapi.ts::resolveBotName.

alter table sales_agents
  add column if not exists bot_name text
    check (bot_name in ('Abby','Alex','Tom','Sarah','Emma','Rachel','Emily','Lauren','Ryan','Daniel','James','Michael'));

alter table agent_ai_preference_changes
  drop constraint if exists agent_ai_preference_changes_field_check;
alter table agent_ai_preference_changes
  add constraint agent_ai_preference_changes_field_check
    check (field in ('voice_gender', 'script', 'bot_name'));

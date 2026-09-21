-- Team-wide chat channels, alongside the existing 1:1 direct_messages —
-- "Chat" (nested under Forum, see app/(portal)/forum/chat) now shows both a
-- Channels section and a Direct messages section, same split as the
-- reference design. Any approved agent/admin can read and post to any
-- channel — same permissive, non-customer-data model as forum_topics.

create table if not exists chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists chat_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels (id) on delete cascade,
  agent_id uuid not null references sales_agents (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_channel_messages_channel_id_idx
  on chat_channel_messages (channel_id, created_at);

insert into chat_channels (name, description) values
  ('general', 'Team-wide chat — anything that does not need its own channel.'),
  ('tech-support', 'Dialer, Vapi and portal issues — ask here before opening a ticket.'),
  ('wins', 'Celebrate booked appointments and closed sales.')
on conflict (name) do nothing;

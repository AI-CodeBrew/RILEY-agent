-- Internal staff forum (topics + replies) and agent-to-agent direct
-- messages ("inbox") — a place for agents (and admins) to discuss things
-- outside of any one customer/call, and to ping a specific teammate
-- directly. Independent of the customer-facing tables; scoped only by
-- sales_agents.id.

create table if not exists forum_topics (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists forum_topics_created_at_idx on forum_topics (created_at desc);

create table if not exists forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references forum_topics (id) on delete cascade,
  agent_id uuid not null references sales_agents (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists forum_replies_topic_id_idx on forum_replies (topic_id, created_at);

-- Direct messages between two agents. No separate "conversation" row — a
-- conversation is just every message where the two participants match,
-- in either direction.
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references sales_agents (id) on delete cascade,
  recipient_id uuid not null references sales_agents (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists direct_messages_sender_idx on direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_recipient_idx on direct_messages (recipient_id, created_at desc);

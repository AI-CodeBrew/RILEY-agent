-- Self-learning rebuttals: when the voice agent hits an objection that isn't
-- one of the hardcoded categories in the script prompt, it improvises an
-- answer and logs it here (status 'unreviewed') via the log-new-rebuttal
-- Edge Function tool, tagged with the agent whose call produced it. That
-- agent reviews it on the portal's Rebuttals page (app/(portal)/rebuttals) —
-- never admin, by design. Approving generates an embedding (Supabase's
-- built-in gte-small inference, no external API key — see
-- supabase/functions/_shared/embeddings.ts and lib/embeddings.ts) and makes
-- it eligible for reuse by ANY agent's future calls on the same script —
-- approval by one agent promotes it into the shared, script-scoped pool.
-- See lookup-rebuttal, which only filters on script + status = 'approved',
-- never agent_id.

create extension if not exists "vector" with schema extensions;

create table rebuttals (
  id uuid primary key default gen_random_uuid(),
  -- Mirrors CallType (types/database.ts) / sales_agents.default_script.
  script text not null check (script in ('POS', 'UNION', 'WILL_KIT')),
  objection_text text not null,
  answer_text text not null,
  status text not null default 'unreviewed' check (status in ('unreviewed', 'approved', 'rejected')),
  -- 384 dims = Supabase's built-in gte-small model. Only populated on
  -- approval — never generated for an unreviewed draft.
  embedding extensions.vector(384),
  -- Who this draft is shown to for review. Not a matching filter once
  -- approved: lookup-rebuttal ignores agent_id entirely.
  agent_id uuid not null references sales_agents(id) on delete cascade,
  source_call_id uuid references calls(id) on delete set null,
  times_matched integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references sales_agents(id)
);

create index rebuttals_script_status_idx on rebuttals (script, status);
create index rebuttals_agent_status_idx on rebuttals (agent_id, status);

-- Partial HNSW index — only approved rows ever get searched by lookup-rebuttal.
create index rebuttals_embedding_idx on rebuttals
  using hnsw (embedding extensions.vector_cosine_ops)
  where status = 'approved';

-- PostgREST can't express a `<=>` ORDER BY, so lookup-rebuttal calls this via
-- supabase.rpc(). Restricted to approved rows in the requested script, same
-- filter the index above is built for.
create or replace function match_rebuttal(
  p_script text,
  p_embedding extensions.vector(384),
  p_match_count int default 1
)
returns table (
  id uuid,
  answer_text text,
  distance float
)
language sql
stable
set search_path = public, extensions
as $$
  select id, answer_text, embedding <=> p_embedding as distance
  from rebuttals
  where status = 'approved'
    and script = p_script
  order by embedding <=> p_embedding
  limit p_match_count;
$$;

-- Atomic usage counter, bumped by lookup-rebuttal on every match — a plain
-- .update() would need a read-then-write round trip and risk lost updates
-- under concurrent calls.
create or replace function increment_rebuttal_match(p_id uuid)
returns void
language sql
as $$
  update rebuttals set times_matched = times_matched + 1 where id = p_id;
$$;

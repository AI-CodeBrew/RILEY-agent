-- Submissions from the public landing page's "Contact Us" form (see
-- app/api/contact/route.ts) — admin reaches out directly by email/phone
-- rather than the app sending anything on its own.

create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  address text,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists contact_requests_created_idx
  on contact_requests (created_at desc);

alter table contact_requests enable row level security;

create policy "service role full access - contact_requests" on contact_requests
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

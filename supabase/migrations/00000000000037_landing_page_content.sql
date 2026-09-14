-- Landing page CMS: lets an admin swap the public marketing site's hero
-- screenshot, "Watch Voice Agent Demo" video, and "Hear a Live Call" audio
-- clip from Settings, without a code deploy. Media itself lives in the
-- public landing-assets Storage bucket; this table just tracks which
-- object is currently live for each of the three slots. See
-- lib/landing-content.ts for the slot definitions both the admin panel and
-- the public app/page.tsx read from.
insert into storage.buckets (id, name, public)
values ('landing-assets', 'landing-assets', true)
on conflict (id) do nothing;

create table landing_page_content (
  -- Single-row table — every slot the marketing site can show lives on
  -- this one 'main' row rather than a key/value table, since the set of
  -- slots is small and fixed (hero image, demo video, live-call audio).
  id text primary key default 'main',
  hero_image_url text,
  hero_image_path text,
  demo_video_url text,
  demo_video_path text,
  live_call_audio_url text,
  live_call_audio_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references sales_agents(id) on delete set null,
  constraint landing_page_content_singleton check (id = 'main')
);

insert into landing_page_content (id) values ('main');

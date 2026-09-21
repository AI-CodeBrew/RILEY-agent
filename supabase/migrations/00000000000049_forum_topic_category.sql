-- Lets a topic be tagged with a category (General / Scripts & Objections /
-- Tech Support / Wins) so the forum can be filtered the same way the
-- Customers page filters by status — see lib/forum-category.ts for the
-- matching labels/colors used client-side.

alter table forum_topics
  add column if not exists category text not null default 'general';

alter table forum_topics
  drop constraint if exists forum_topics_category_check,
  add constraint forum_topics_category_check
    check (category in ('general', 'scripts', 'tech_support', 'wins'));

-- Per-campaign voice pick for auto-dial, set once when the agent starts the
-- campaign and reused for every call it places (mirrors the per-call voice
-- override already supported for manual dials).

alter table dial_campaigns
  add column if not exists voice_gender text
    check (voice_gender in ('male', 'female'));

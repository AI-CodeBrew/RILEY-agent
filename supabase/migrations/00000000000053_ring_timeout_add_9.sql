-- Adds 9 seconds as a selectable ring_timeout_seconds option, alongside the
-- existing 10/15 (see 00000000000047_ring_timeout_10_15.sql). Requested to
-- hang up before voicemail typically picks up (~16s observed on this
-- account's carrier), which was previously costing money for a call nobody
-- ever answers — reconcile-live-calls only hangs up a call still sitting in
-- `ringing`/`queued`, so a call actually answered before the timeout is
-- unaffected (see app/(portal)/campaigns/AutoDialSettingsPanel.tsx and
-- supabase/functions/reconcile-live-calls/index.ts).
alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (ring_timeout_seconds in (9, 10, 15));

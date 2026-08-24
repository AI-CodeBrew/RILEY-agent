-- Multi-schedule campaigns: each daily window now carries its own customer
-- list and call-type override, and the campaign records the browser
-- timezone it was created in (instead of borrowing the agent's account
-- timezone setting) so the windows an agent picks match their own clock.
-- See lib/campaign.ts (advanceCampaign) and lib/campaign-schedule.ts.

alter table dial_campaigns
  add column if not exists timezone text;

alter table dial_campaign_windows
  add column if not exists call_type text
    check (call_type in ('POS', 'UNION', 'WILL_KIT') or call_type is null);

alter table dial_campaign_customers
  add column if not exists window_id uuid references dial_campaign_windows (id) on delete cascade;

create index if not exists dial_campaign_customers_window_idx
  on dial_campaign_customers (window_id);

-- A customer can now appear once per window (different schedules of the same
-- campaign can dial the same customer), not just once per campaign.
alter table dial_campaign_customers
  drop constraint if exists dial_campaign_customers_campaign_id_customer_id_key;
alter table dial_campaign_customers
  add constraint dial_campaign_customers_campaign_window_customer_key
  unique (campaign_id, window_id, customer_id);

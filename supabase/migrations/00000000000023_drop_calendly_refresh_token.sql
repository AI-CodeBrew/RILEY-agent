-- calendly_refresh_token has never been read or written anywhere in the
-- app (the Calendly connection flow uses a pasted personal access token,
-- not OAuth refresh) — dead column, drop it.

alter table sales_agents
  drop column if exists calendly_refresh_token;

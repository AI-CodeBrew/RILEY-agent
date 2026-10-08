-- How many days ahead Riley may book for an agent who books off their own
-- weekly hours (agent_availability_hours) rather than Calendly: 0 = today
-- only, 2 = today, tomorrow and the day after, and so on. It's a rolling
-- window — counted from "today" in the agent's own time zone at the moment
-- of each call, so the agent sets it once instead of moving it every day.
-- A customer who wants a later day isn't booked; the assistant offers what's
-- inside the window or arranges a call back (see check-agent-availability
-- and book-appointment). Null = no limit, i.e. the behaviour before this
-- column existed. Calendly-mode agents and appointments added by hand in
-- the portal are not limited by it.

alter table sales_agents
  add column if not exists booking_window_days int
    check (booking_window_days is null or booking_window_days between 0 and 30);

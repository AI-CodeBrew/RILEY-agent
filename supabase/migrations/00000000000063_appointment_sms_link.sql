-- Link texted to the customer in the confirmation + reminder SMS in place of
-- zoom_link. Set at booking time for the Resume script (RECRUITMENT), whose
-- texts carry the careers link rather than the agent's Zoom/Google Meet link
-- — see _shared/sms-link.ts. Stored on the row rather than re-derived by
-- send-appointment-reminders because the script a call ran under (a campaign
-- window can override it) isn't recoverable from the appointment later.
-- Null means "text zoom_link as usual".

alter table appointments
  add column if not exists sms_link text;

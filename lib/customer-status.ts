import type { CustomerStatus } from "@/types/database";

/**
 * Single source of truth for every customer status, in display order.
 * Shared by the Customers page's filter pills and the auto-dial campaign
 * builder's "select this category" buttons, so the two stay in sync.
 */
export const CUSTOMER_STATUSES: CustomerStatus[] = [
  "new",
  "call_scheduled",
  "calling",
  "contacted",
  "appointment_set",
  "follow_up",
  "no_answer",
  "not_interested",
  "do_not_call",
  "sold",
];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  new: "New",
  call_scheduled: "Call scheduled",
  calling: "Calling",
  contacted: "Contacted",
  appointment_set: "Booked",
  follow_up: "Follow up",
  no_answer: "No answer",
  not_interested: "Not interested",
  do_not_call: "Do not call",
  sold: "Sold",
};

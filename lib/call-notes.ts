/** Fields Abby extracts at end-of-call via Vapi structuredDataPlan. */
export type CallInsights = {
  outcome?: string;
  call_received?: boolean | null;
  letter_received?: boolean | null;
  mailing_address_confirmed?: boolean | null;
  mailing_address_correction?: string | null;
  spouse_name?: string | null;
  household_type?: string | null;
  employment_status?: string | null;
  preferred_meeting_time?: string | null;
  slots_offered?: string | null;
  meeting_locked_time?: string | null;
  appointment_with?: string | null;
  appointment_at?: string | null;
  email_confirmed?: boolean | null;
  email_same_as_file?: boolean | null;
  /** Exact spelled-out email from the call, whenever one was given — never a guess from how it sounded. Notes only, never auto-applied to customers.email (see resolve-call-outcome.ts). */
  email_correction?: string | null;
  pre_meeting_call_agreed?: boolean | null;
  follow_up_needed?: boolean;
  key_notes?: string | null;
};

export type NoteField = {
  label: string;
  value: string | null | undefined;
};

export function parseCallInsights(raw: unknown): CallInsights {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  return {
    outcome: typeof data.outcome === "string" ? data.outcome : undefined,
    call_received: typeof data.call_received === "boolean" ? data.call_received : null,
    letter_received: typeof data.letter_received === "boolean" ? data.letter_received : null,
    mailing_address_confirmed:
      typeof data.mailing_address_confirmed === "boolean"
        ? data.mailing_address_confirmed
        : null,
    mailing_address_correction:
      typeof data.mailing_address_correction === "string"
        ? data.mailing_address_correction
        : null,
    spouse_name: typeof data.spouse_name === "string" ? data.spouse_name : null,
    household_type: typeof data.household_type === "string" ? data.household_type : null,
    employment_status: typeof data.employment_status === "string" ? data.employment_status : null,
    preferred_meeting_time:
      typeof data.preferred_meeting_time === "string" ? data.preferred_meeting_time : null,
    slots_offered: typeof data.slots_offered === "string" ? data.slots_offered : null,
    meeting_locked_time:
      typeof data.meeting_locked_time === "string" ? data.meeting_locked_time : null,
    appointment_with: typeof data.appointment_with === "string" ? data.appointment_with : null,
    appointment_at: typeof data.appointment_at === "string" ? data.appointment_at : null,
    email_confirmed: typeof data.email_confirmed === "boolean" ? data.email_confirmed : null,
    email_same_as_file:
      typeof data.email_same_as_file === "boolean" ? data.email_same_as_file : null,
    email_correction: typeof data.email_correction === "string" ? data.email_correction : null,
    pre_meeting_call_agreed:
      typeof data.pre_meeting_call_agreed === "boolean"
        ? data.pre_meeting_call_agreed
        : typeof data.tyler_callback_agreed === "boolean"
          ? data.tyler_callback_agreed
          : null,
    follow_up_needed: data.follow_up_needed === true,
    key_notes: typeof data.key_notes === "string" ? data.key_notes : null,
  };
}

function formatBool(value: boolean | null | undefined, yes = "Yes", no = "No") {
  if (value === true) return yes;
  if (value === false) return no;
  return null;
}

/** Human-readable rows for the portal notes UI. */
export function noteFieldsFromInsights(insights: CallInsights): NoteField[] {
  return [
    { label: "Letter received", value: formatBool(insights.letter_received) },
    {
      label: "Mailing address confirmed",
      value: formatBool(insights.mailing_address_confirmed),
    },
    { label: "Address correction noted", value: insights.mailing_address_correction },
    { label: "Still working", value: insights.employment_status },
    { label: "Household", value: insights.household_type },
    { label: "Spouse / partner name", value: insights.spouse_name },
    { label: "Usually together (time of day)", value: insights.preferred_meeting_time },
    { label: "Slots offered", value: insights.slots_offered },
    { label: "Time they picked", value: insights.meeting_locked_time },
    { label: "Meeting with", value: insights.appointment_with },
    { label: "Appointment time", value: insights.appointment_at },
    { label: "Email confirmed", value: formatBool(insights.email_confirmed) },
    {
      label: "Same email as file",
      value: formatBool(insights.email_same_as_file, "Same as on file", "Different email"),
    },
    { label: "Email correction noted", value: insights.email_correction },
    {
      label: "Pre-meeting call OK (10 min before)",
      value: formatBool(insights.pre_meeting_call_agreed),
    },
  ].filter((row) => row.value);
}

export function hasCallNotes(
  insights: CallInsights,
  summary?: string | null,
  transcript?: string | null
) {
  return Boolean(
    summary?.trim() ||
      transcript?.trim() ||
      noteFieldsFromInsights(insights).length > 0 ||
      insights.key_notes
  );
}

export function notePreview(
  insights: CallInsights,
  summary?: string | null,
  maxLen = 120,
  transcript?: string | null
) {
  if (insights.key_notes) {
    return insights.key_notes.length > maxLen
      ? `${insights.key_notes.slice(0, maxLen)}…`
      : insights.key_notes;
  }
  const parts = noteFieldsFromInsights(insights)
    .slice(0, 3)
    .map((f) => `${f.label}: ${f.value}`);
  if (parts.length) return parts.join(" · ");
  if (summary) return summary.length > maxLen ? `${summary.slice(0, maxLen)}…` : summary;
  if (transcript) {
    const trimmed = transcript.replace(/\s+/g, " ").trim();
    return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
  }
  return null;
}

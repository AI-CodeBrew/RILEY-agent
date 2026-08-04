import type { CalendlyCustomQuestion } from "./calendly.ts";

export function buildVoiceBookingDescription(params: {
  customer: {
    name: string;
    phone: string;
    company?: string | null;
    spouse_name?: string | null;
  };
  agent: { name: string };
  scheduledAtIso: string;
  bookingNotes?: string;
}): string {
  const lines = [
    "AIL Canada member appointment — booked via Abby (voice agent).",
    `Member: ${params.customer.name}`,
    `Phone: ${params.customer.phone}`,
    `Virtual director: ${params.agent.name}`,
    `Scheduled (UTC): ${params.scheduledAtIso}`,
  ];
  if (params.customer.company) lines.push(`Company: ${params.customer.company}`);
  if (params.customer.spouse_name) lines.push(`Spouse/partner: ${params.customer.spouse_name}`);
  if (params.bookingNotes?.trim()) lines.push(`Call notes: ${params.bookingNotes.trim()}`);
  return lines.join("\n");
}

export function buildQuestionsAndAnswers(
  customQuestions: CalendlyCustomQuestion[] | undefined,
  context: {
    customer: {
      name: string;
      phone: string;
      email: string | null;
      company?: string | null;
      spouse_name?: string | null;
    };
    agent: { name: string };
    description: string;
    inviteeEmail: string;
  }
): Array<{ question: string; position: number; answer: string }> {
  const enabled = (customQuestions ?? []).filter((question) => question.enabled !== false);
  if (enabled.length === 0) return [];

  return enabled.map((question) => ({
    question: question.name,
    position: question.position,
    answer: answerForCustomQuestion(question, context).slice(0, 2000),
  }));
}

function answerForCustomQuestion(
  question: CalendlyCustomQuestion,
  context: {
    customer: {
      name: string;
      phone: string;
      email: string | null;
      company?: string | null;
      spouse_name?: string | null;
    };
    agent: { name: string };
    description: string;
    inviteeEmail: string;
  }
): string {
  const label = question.name.toLowerCase();

  if (question.type === "phone_number" || label.includes("phone")) {
    return context.customer.phone;
  }
  if (label.includes("email")) {
    return context.customer.email ?? context.inviteeEmail;
  }
  if (label.includes("company") || label.includes("organization")) {
    return context.customer.company ?? "AIL Canada Member";
  }
  if (
    label.includes("spouse") ||
    label.includes("partner") ||
    label.includes("significant other")
  ) {
    return context.customer.spouse_name ?? "Not provided on call";
  }
  if (label.includes("name") && !label.includes("company")) {
    return context.customer.name;
  }
  if (question.type === "single_select" && question.answer_choices?.length) {
    return question.answer_choices[0];
  }

  return context.description;
}

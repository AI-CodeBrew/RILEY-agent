/** Careers link the Resume script (RECRUITMENT) texts to candidates. */
export const RECRUITMENT_SMS_LINK = "https://hmgcareers.com/?utm_source=IMRNRMS";

/**
 * Link to text in place of the appointment's video link, or null to text the
 * video link as usual. Recruitment candidates always get the careers link,
 * even when the agent has Zoom/Google Meet connected — every other script
 * keeps its join link.
 */
export function resolveSmsLinkOverride(script: string | null | undefined): string | null {
  return script === "RECRUITMENT" ? RECRUITMENT_SMS_LINK : null;
}

/** " Join here: …" / " Details here: …" tail shared by the confirmation and reminder texts. */
export function smsLinkSuffix(smsLink: string | null | undefined, zoomLink: string | null | undefined) {
  if (smsLink) return ` Details here: ${smsLink}`;
  return zoomLink ? ` Join here: ${zoomLink}` : "";
}

/** Careers link the Resume script (RECRUITMENT) texts to candidates. */
export const RECRUITMENT_SMS_LINK = "https://hmgcareers.com/?utm_source=IMRNRMS";

/** Career-session link the RECPAZ script (Globe Life A.O.) texts to candidates. */
export const RECPAZ_SMS_LINK = "https://globelifepaz.webinargeek.com/globe-life-online-career-session?cst=bot";

/**
 * Link to text in place of the appointment's video link, or null to text the
 * video link as usual. Recruitment and RECPAZ candidates always get their careers link,
 * even when the agent has Zoom/Google Meet connected — every other script
 * keeps its join link.
 */
export function resolveSmsLinkOverride(script: string | null | undefined): string | null {
  if (script === "RECRUITMENT") return RECRUITMENT_SMS_LINK;
  if (script === "RECPAZ") return RECPAZ_SMS_LINK;
  return null;
}

/** " Join here: …" / " Details here: …" tail shared by the confirmation and reminder texts. */
export function smsLinkSuffix(smsLink: string | null | undefined, zoomLink: string | null | undefined) {
  if (smsLink) return ` Details here: ${smsLink}`;
  return zoomLink ? ` Join here: ${zoomLink}` : "";
}

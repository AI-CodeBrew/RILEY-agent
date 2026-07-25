/**
 * Minimal transactional email sender using Resend's HTTP API. Swap this out
 * for whatever provider you actually use — it's a single function so
 * there's nothing else to change.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "bookings@example.com";

  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping email to ${params.to}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    console.error(`Failed to send email to ${params.to}: ${await res.text()}`);
  }
}

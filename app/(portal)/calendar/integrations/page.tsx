import { redirect } from "next/navigation";

/** Integrations moved to Settings → Integrations. Keep this route as a redirect. */
export default function IntegrationsPage() {
  redirect("/settings?tab=integrations");
}

import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ForumSubNav } from "./ForumSubNav";

export const dynamic = "force-dynamic";

/** Every /forum/* screen (discussions and, nested under it, chat) shares this vertical icon switcher — same left-column pattern as /calendar's CalendarSubNav. */
export default async function ForumLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const { count } = await supabaseAdmin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", session.agent.id)
    .is("read_at", null);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <ForumSubNav unreadChatCount={count ?? 0} />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}

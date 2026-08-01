import { StickyNote } from "lucide-react";
import {
  noteFieldsFromInsights,
  parseCallInsights,
  type CallInsights,
} from "@/lib/call-notes";

export function CallNotesCard({
  summary,
  callInsights,
  title = "Call notes",
  compact = false,
}: {
  summary?: string | null;
  callInsights?: unknown;
  title?: string;
  compact?: boolean;
}) {
  const insights: CallInsights = parseCallInsights(callInsights);
  const fields = noteFieldsFromInsights(insights);

  if (!summary && fields.length === 0 && !insights.key_notes) return null;

  return (
    <div className={compact ? "mt-3 space-y-2" : "space-y-3"}>
      {!compact && (
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4 text-accent" />
          {title}
        </h3>
      )}

      {summary && (
        <p className={`text-sm whitespace-pre-wrap ${compact ? "text-foreground" : ""}`}>
          {summary}
        </p>
      )}

      {fields.length > 0 && (
        <dl
          className={`grid gap-3 text-sm ${
            compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {fields.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {insights.key_notes && (
        <p className="rounded-lg bg-background p-3 text-sm">
          <span className="text-xs font-medium text-muted">Additional notes: </span>
          {insights.key_notes}
        </p>
      )}
    </div>
  );
}

"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

/** Footer row for a table/list that's collapsed to a handful of rows by default — toggles between "Show N more" and "Show less". Renders nothing once there's nothing to collapse. */
export function ShowMoreButton({
  totalCount,
  visibleCount,
  expanded,
  onClick,
}: {
  totalCount: number;
  visibleCount: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (totalCount <= visibleCount && !expanded) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-accent hover:bg-background"
    >
      {expanded ? (
        <>
          Show less
          <ChevronUp className="h-3.5 w-3.5" />
        </>
      ) : (
        <>
          Show {totalCount - visibleCount} more
          <ChevronDown className="h-3.5 w-3.5" />
        </>
      )}
    </button>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * All list filtering lives in the URL so a filtered view is linkable and the
 * server component can do the filtering in SQL rather than shipping every
 * row to the browser.
 */
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return { setParam, pending, searchParams };
}

export function SearchInput({
  paramKey = "q",
  placeholder = "Search…",
}: {
  paramKey?: string;
  placeholder?: string;
}) {
  const { setParam, pending, searchParams } = useSetParam();
  const initial = searchParams.get(paramKey) ?? "";
  const [value, setValue] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);

  // Adjust during render (React's documented pattern for state derived from
  // props) when the URL changes from elsewhere — back button, a pill click.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setValue(initial);
  }

  useEffect(() => {
    if (value === initial) return;
    const timeout = setTimeout(() => setParam(paramKey, value.trim() || null), 300);
    return () => clearTimeout(timeout);
    // setParam is recreated per render; the debounce is keyed on the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        value && (
          <button
            onClick={() => setValue("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )
      )}
    </div>
  );
}

export interface FilterOption {
  value: string | null;
  label: string;
  count?: number;
}

export function FilterPills({
  paramKey,
  options,
  className,
}: {
  paramKey: string;
  options: FilterOption[];
  className?: string;
}) {
  const { setParam, searchParams } = useSetParam();
  const current = searchParams.get(paramKey);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((option) => {
        const active = (option.value ?? null) === (current ?? null);
        return (
          <button
            key={option.value ?? `${paramKey}:all`}
            onClick={() => setParam(paramKey, option.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn("ml-1.5", active ? "opacity-80" : "opacity-60")}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

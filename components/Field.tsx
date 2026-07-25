import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, className, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-medium text-muted"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft",
          className
        )}
        {...props}
      />
    </div>
  );
}

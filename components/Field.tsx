import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const controlStyles =
  "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60";

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

function Hint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-muted">{children}</p>;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
}

export function Field({ label, hint, className, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <input id={inputId} className={cn(controlStyles, className)} {...props} />
      <Hint>{hint}</Hint>
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: React.ReactNode;
}

export function SelectField({
  label,
  hint,
  className,
  id,
  children,
  ...props
}: SelectFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <select id={inputId} className={cn(controlStyles, className)} {...props}>
        {children}
      </select>
      <Hint>{hint}</Hint>
    </div>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: React.ReactNode;
}

export function TextareaField({
  label,
  hint,
  className,
  id,
  ...props
}: TextareaFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <textarea
        id={inputId}
        className={cn(controlStyles, "min-h-20 resize-y", className)}
        {...props}
      />
      <Hint>{hint}</Hint>
    </div>
  );
}

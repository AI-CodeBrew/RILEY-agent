"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Password/secret input with an eye button that toggles the value between
 * hidden and visible. `Field` renders this whenever `type="password"`, so
 * every password and token field gets the toggle without opting in.
 */
export function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { wrapperClassName?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <input {...props} type={visible ? "text" : "password"} className={cn(className, "pr-10")} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={props.disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide" : "Show"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:opacity-60"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

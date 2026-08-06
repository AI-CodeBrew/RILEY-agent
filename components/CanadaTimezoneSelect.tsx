"use client";

import { CANADA_TIME_ZONES, DEFAULT_CANADA_TIMEZONE } from "@/lib/canada-timezones";
import { SelectField } from "@/components/Field";

export function CanadaTimezoneSelect({
  label = "Time zone",
  hint,
  value,
  onChange,
  required,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (iana: string) => void;
  required?: boolean;
}) {
  return (
    <SelectField
      label={label}
      hint={hint}
      required={required}
      value={value || DEFAULT_CANADA_TIMEZONE}
      onChange={(e) => onChange(e.target.value)}
    >
      {CANADA_TIME_ZONES.map((zone) => (
        <option key={zone.iana} value={zone.iana}>
          {zone.label}
        </option>
      ))}
    </SelectField>
  );
}

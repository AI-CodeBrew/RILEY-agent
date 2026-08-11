"use client";

import { CANADA_TIME_ZONES, DEFAULT_CANADA_TIMEZONE, type CanadaTimezoneIana } from "@/lib/canada-timezones";
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
  value: CanadaTimezoneIana | string;
  onChange: (iana: CanadaTimezoneIana) => void;
  required?: boolean;
}) {
  return (
    <SelectField
      label={label}
      hint={hint}
      required={required}
      value={value || DEFAULT_CANADA_TIMEZONE}
      onChange={(e) => onChange(e.target.value as CanadaTimezoneIana)}
    >
      {CANADA_TIME_ZONES.map((zone) => (
        <option key={zone.iana} value={zone.iana}>
          {zone.label}
        </option>
      ))}
    </SelectField>
  );
}

import { CALL_TYPES, type CallType } from "@/types/database";

/**
 * Any spelling of a call type — "will_kit", "Will Kit", "WILL-KIT", "willkit"
 * — maps to the canonical value ("WILL_KIT"). Case, spaces, dashes and
 * underscores are all ignored; anything that isn't a known call type is null.
 */
export function parseCallType(value: string): CallType | null {
  const compact = value.toUpperCase().replace(/[^A-Z]/g, "");
  return CALL_TYPES.find((type) => type.replace(/_/g, "") === compact) ?? null;
}

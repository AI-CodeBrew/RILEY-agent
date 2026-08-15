"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { RETRY_DELAY_OPTIONS } from "@/lib/retry-delay";

type VoiceGender = "male" | "female";
type Script = "POS" | "UNION" | "WILL_KIT";
type BotName =
  | "Abby"
  | "Alex"
  | "Tom"
  | "Sarah"
  | "Emma"
  | "Rachel"
  | "Emily"
  | "Lauren"
  | "Ryan"
  | "Daniel"
  | "James"
  | "Michael";

const SCRIPT_LABELS: Record<Script, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

const BOT_NAME_OPTIONS: BotName[] = [
  "Abby",
  "Alex",
  "Tom",
  "Sarah",
  "Emma",
  "Rachel",
  "Emily",
  "Lauren",
  "Ryan",
  "Daniel",
  "James",
  "Michael",
];

/**
 * Voice saves immediately and takes effect on new calls right away (Call
 * panel, customer list, and campaign setup all pre-fill from it). Script
 * picks which Vapi assistant places the call (Abby/POS, Tom/Union, or
 * Alex/Will Kit) — it's only the fallback though: a customer's own
 * call_type, if set, wins over this default (see lib/trigger-call.ts).
 */
export function AIIntegrationPanel({
  agent,
}: {
  agent: {
    id: string;
    default_voice_gender: VoiceGender | null;
    default_script: Script | null;
    bot_name: BotName | null;
    retry_delay_minutes: number;
    retry_max_attempts: number;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [voiceGender, setVoiceGender] = useState<VoiceGender | "">(
    agent.default_voice_gender ?? ""
  );
  const [script, setScript] = useState<Script | "">(agent.default_script ?? "");
  const [botName, setBotName] = useState<BotName | "">(agent.bot_name ?? "");
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(agent.retry_delay_minutes);
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(String(agent.retry_max_attempts));
  const [savingField, setSavingField] = useState<
    "voice" | "script" | "botName" | "retryDelay" | "retryAttempts" | null
  >(null);

  async function save(
    field: "default_voice_gender" | "default_script" | "bot_name" | "retry_delay_minutes" | "retry_max_attempts",
    value: string | number,
    which: "voice" | "script" | "botName" | "retryDelay" | "retryAttempts"
  ) {
    setSavingField(which);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value === "" ? null : value }),
    });

    setSavingField(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save.", "error");
      return;
    }

    toast("Saved.", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <SelectField
        label="Voice"
        hint="Default voice for your outbound calls. Still changeable per call."
        value={voiceGender}
        disabled={savingField === "voice"}
        onChange={(e) => {
          const next = e.target.value as VoiceGender;
          setVoiceGender(next);
          save("default_voice_gender", next, "voice");
        }}
      >
        <option value="female">Female</option>
        <option value="male">Male</option>
      </SelectField>

      <SelectField
        label="Script"
        hint="Which assistant places your calls by default — Abby (POS), Tom (Union), or Alex (Will Kit). A customer's own call type, if set, overrides this."
        value={script}
        disabled={savingField === "script"}
        onChange={(e) => {
          const next = e.target.value as Script;
          setScript(next);
          save("default_script", next, "script");
        }}
      >
        <option value="POS">{SCRIPT_LABELS.POS}</option>
        <option value="UNION">{SCRIPT_LABELS.UNION}</option>
        <option value="WILL_KIT">{SCRIPT_LABELS.WILL_KIT}</option>
      </SelectField>

      <SelectField
        label="Bot Name"
        hint="What the assistant calls itself on your calls — separate from your own name. Leave unset to use the script's default (Abby for POS, Tom for Union, Alex for Will Kit)."
        value={botName}
        disabled={savingField === "botName"}
        onChange={(e) => {
          const next = e.target.value as BotName | "";
          setBotName(next);
          save("bot_name", next, "botName");
        }}
      >
        <option value="">Select Bot Name</option>
        {BOT_NAME_OPTIONS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Redial follow-up / no-answer after"
        hint="How long Abby waits before auto-redialing. Only applies to leads reached through an auto-dial campaign — it fires inside that campaign's own Start/Stop window, resuming the same time the next day if the window closes first."
        value={retryDelayMinutes}
        disabled={savingField === "retryDelay"}
        onChange={(e) => {
          const next = Number(e.target.value);
          setRetryDelayMinutes(next);
          save("retry_delay_minutes", next, "retryDelay");
        }}
      >
        {RETRY_DELAY_OPTIONS.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <Field
        label="Max auto-retry attempts"
        type="number"
        min={0}
        hint="Stops auto-redialing after this many tries and leaves the lead for you to call manually."
        value={retryMaxAttempts}
        disabled={savingField === "retryAttempts"}
        onChange={(e) => setRetryMaxAttempts(e.target.value)}
        onBlur={() => {
          const next = Number(retryMaxAttempts);
          if (!Number.isFinite(next) || next < 0) {
            setRetryMaxAttempts(String(agent.retry_max_attempts));
            return;
          }
          save("retry_max_attempts", next, "retryAttempts");
        }}
      />
    </div>
  );
}

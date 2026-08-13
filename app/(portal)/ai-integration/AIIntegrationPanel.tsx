"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { RETRY_DELAY_OPTIONS, formatWindowTime } from "@/lib/retry-delay";

type VoiceGender = "male" | "female";
type Script = "POS" | "UNION" | "WILL_KIT";

const SCRIPT_LABELS: Record<Script, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

/**
 * Voice saves immediately and takes effect on new calls right away (Call
 * panel, customer list, and campaign setup all pre-fill from it). Script is
 * storage-only for now — only the POS flow is actually built into Abby's
 * prompt, so picking Union or Will Kit here doesn't change call behavior yet.
 */
export function AIIntegrationPanel({
  agent,
}: {
  agent: {
    id: string;
    default_voice_gender: VoiceGender | null;
    default_script: Script | null;
    retry_delay_minutes: number;
    retry_window_start: string;
    retry_window_end: string;
    retry_max_attempts: number;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [voiceGender, setVoiceGender] = useState<VoiceGender | "">(
    agent.default_voice_gender ?? ""
  );
  const [script, setScript] = useState<Script | "">(agent.default_script ?? "");
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(agent.retry_delay_minutes);
  const [savingField, setSavingField] = useState<"voice" | "script" | "retry" | null>(null);

  async function save(
    field: "default_voice_gender" | "default_script" | "retry_delay_minutes",
    value: string | number
  ) {
    setSavingField(
      field === "default_voice_gender" ? "voice" : field === "default_script" ? "script" : "retry"
    );

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
          save("default_voice_gender", next);
        }}
      >
        <option value="female">Female</option>
        <option value="male">Male</option>
      </SelectField>

      <SelectField
        label="Script"
        hint="Which pitch Abby follows. Union and Will Kit aren't built yet — POS is the only live script."
        value={script}
        disabled={savingField === "script"}
        onChange={(e) => {
          const next = e.target.value as Script;
          setScript(next);
          save("default_script", next);
        }}
      >
        <option value="POS">{SCRIPT_LABELS.POS}</option>
        <option value="UNION">{SCRIPT_LABELS.UNION}</option>
        <option value="WILL_KIT">{SCRIPT_LABELS.WILL_KIT}</option>
      </SelectField>

      <SelectField
        label="Redial follow-up / no-answer after"
        hint={`How long Abby waits before auto-redialing. Only happens inside your calling window (${formatWindowTime(agent.retry_window_start)}–${formatWindowTime(agent.retry_window_end)}), and stops after ${agent.retry_max_attempts} attempts — both set by your admin.`}
        value={retryDelayMinutes}
        disabled={savingField === "retry"}
        onChange={(e) => {
          const next = Number(e.target.value);
          setRetryDelayMinutes(next);
          save("retry_delay_minutes", next);
        }}
      >
        {RETRY_DELAY_OPTIONS.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

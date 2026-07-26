"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { formatPhone } from "@/lib/format";

/**
 * Buys this agent a Twilio number and registers it with Vapi — that number
 * is the caller ID customers see, and without one outbound calls fall back
 * to the shared VAPI_PHONE_NUMBER_ID (or fail).
 */
export function PhoneNumberPanel({
  agentId,
  phoneNumber,
  connected,
}: {
  agentId: string;
  phoneNumber: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [areaCode, setAreaCode] = useState("");
  const [working, setWorking] = useState(false);

  async function handleRequest() {
    setWorking(true);

    const res = await fetch(`/api/agents/${agentId}/phone-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area_code: areaCode || undefined }),
    });
    const body = await res.json().catch(() => ({}));

    setWorking(false);

    if (!res.ok) {
      toast(body.error ?? "Could not get a number.", "error");
      return;
    }

    toast(`You'll call from ${body.agent?.vapi_phone_number}.`, "success");
    router.refresh();
  }

  if (connected) {
    return (
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Phone className="h-4 w-4" />
          {formatPhone(phoneNumber)}
        </p>
        <p className="text-xs text-muted">
          This is the caller ID on every call Riley places for you. To change
          it, ask an admin — releasing a number is a billing action.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {phoneNumber
          ? `${formatPhone(phoneNumber)} was purchased but isn't connected to Vapi yet — retry to finish setup.`
          : "You don't have an outbound number yet. Getting one buys a Twilio number under the business account and connects it to Vapi."}
      </p>

      <Field
        label="Preferred area code"
        value={areaCode}
        onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
        placeholder="e.g. 415 — optional"
        inputMode="numeric"
      />

      <Button onClick={handleRequest} loading={working}>
        {!working && <Phone className="h-4 w-4" />}
        {phoneNumber ? "Retry connecting number" : "Get my number"}
      </Button>
    </div>
  );
}

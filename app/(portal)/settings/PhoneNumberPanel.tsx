"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { formatPhone } from "@/lib/format";

type TwilioOption = {
  phoneNumber: string;
  twilioSid: string;
  inVapi: boolean;
  assignedTo: string | null;
  available: boolean;
};

/**
 * Buys this agent a Twilio number and registers it with Vapi — that number
 * is the caller ID customers see. Each agent gets their own number; outbound
 * calls fail until one is provisioned here.
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
  const [replacing, setReplacing] = useState(false);
  const [replaceAreaCode, setReplaceAreaCode] = useState("");
  const [twilioOptions, setTwilioOptions] = useState<TwilioOption[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(phoneNumber);

  useEffect(() => {
    if (connected) return;

    fetch(`/api/agents/${agentId}/phone-number`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.numbers) {
          setTwilioOptions(body.numbers);
          if (phoneNumber) {
            setSelectedPhone(phoneNumber);
          } else {
            const firstFree = body.numbers.find((row: TwilioOption) => row.available);
            if (firstFree) setSelectedPhone(firstFree.phoneNumber);
          }
        }
      })
      .catch(() => {});
  }, [agentId, connected, phoneNumber]);

  async function connectNumber(payload: { phone_number?: string; area_code?: string }) {
    setWorking(true);

    const res = await fetch(`/api/agents/${agentId}/phone-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));

    setWorking(false);

    if (!res.ok) {
      toast(body.error ?? "Could not connect the number.", "error");
      return;
    }

    toast(`You'll call from ${body.agent?.vapi_phone_number}.`, "success");
    router.refresh();
  }

  async function handleRequest() {
    if (selectedPhone) {
      await connectNumber({ phone_number: selectedPhone });
      return;
    }
    await connectNumber({ area_code: areaCode || undefined });
  }

  async function handleReplace() {
    setWorking(true);

    const releaseRes = await fetch(`/api/agents/${agentId}/phone-number`, {
      method: "DELETE",
    });
    const releaseBody = await releaseRes.json().catch(() => ({}));

    if (!releaseRes.ok) {
      setWorking(false);
      toast(releaseBody.error ?? "Could not release the current number.", "error");
      return;
    }

    const buyRes = await fetch(`/api/agents/${agentId}/phone-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area_code: replaceAreaCode || undefined }),
    });
    const buyBody = await buyRes.json().catch(() => ({}));

    setWorking(false);
    setReplacing(false);
    setReplaceAreaCode("");

    if (!buyRes.ok) {
      toast(
        buyBody.error ??
          "Old number was released, but buying a new one failed. Use Get my number to retry.",
        "error"
      );
      router.refresh();
      return;
    }

    toast(`Number replaced — you'll now call from ${buyBody.agent?.vapi_phone_number}.`, "success");
    router.refresh();
  }

  if (connected) {
    return (
      <>
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Phone className="h-4 w-4" />
            {formatPhone(phoneNumber)}
          </p>
          <p className="text-xs text-muted">
            This is the caller ID on every outbound call. To swap your old
            trial number for a new one, use replace below — it releases the
            current number from Twilio and Vapi, then buys a fresh number.
          </p>
          <Button variant="secondary" onClick={() => setReplacing(true)}>
            <RefreshCw className="h-4 w-4" />
            Replace number
          </Button>
        </div>

        <Modal
          open={replacing}
          onClose={() => !working && setReplacing(false)}
          title="Replace your outbound number?"
          description={`This releases ${phoneNumber ? formatPhone(phoneNumber) : "your current number"} from Twilio and Vapi, then buys a new number. Twilio stops billing the old one; the new number is about $1/month.`}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setReplacing(false)}
                disabled={working}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleReplace} loading={working}>
                {!working && <RefreshCw className="h-4 w-4" />}
                Release & buy new
              </Button>
            </>
          }
        >
          <Field
            label="Preferred area code for new number"
            value={replaceAreaCode}
            onChange={(e) =>
              setReplaceAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="e.g. 415 — optional"
            inputMode="numeric"
          />
        </Modal>
      </>
    );
  }

  const availableOptions = twilioOptions.filter((row) => row.available);
  const hasExistingTwilio = availableOptions.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {phoneNumber
          ? `${formatPhone(phoneNumber)} is on Twilio but not connected to Vapi yet — pick it below and retry. This will not buy another number.`
          : hasExistingTwilio
            ? "Connect one of your existing Twilio numbers — no new purchase."
            : "You don't have a free Twilio number yet. Getting one buys a number under the business account and connects it to Vapi."}
      </p>

      {hasExistingTwilio ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted">
            Your Twilio numbers
          </legend>
          {twilioOptions.map((row) => (
            <label
              key={row.phoneNumber}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                row.available
                  ? selectedPhone === row.phoneNumber
                    ? "border-accent bg-accent/5"
                    : "border-border"
                  : "cursor-not-allowed border-border opacity-50"
              }`}
            >
              <input
                type="radio"
                name="twilio-number"
                className="mt-1"
                disabled={!row.available}
                checked={selectedPhone === row.phoneNumber}
                onChange={() => setSelectedPhone(row.phoneNumber)}
              />
              <span>
                <span className="font-medium">{formatPhone(row.phoneNumber)}</span>
                {row.assignedTo && (
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.available
                      ? "Previously assigned to you — retry to finish Vapi setup"
                      : `Connected to ${row.assignedTo}`}
                  </span>
                )}
                {row.inVapi && row.available && (
                  <span className="mt-0.5 block text-xs text-emerald-600 dark:text-emerald-400">
                    Already in Vapi — will link, not re-import
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <Field
          label="Preferred area code (only if buying new)"
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder="e.g. 415 — optional"
          inputMode="numeric"
        />
      )}

      <Button onClick={handleRequest} loading={working} disabled={hasExistingTwilio && !selectedPhone}>
        {!working && <Phone className="h-4 w-4" />}
        {phoneNumber || hasExistingTwilio ? "Connect number" : "Get my number"}
      </Button>

      {phoneNumber && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          If Vapi says the number is locked to another organization, email{" "}
          <a href="mailto:support@vapi.ai" className="underline">
            support@vapi.ai
          </a>{" "}
          and ask them to release {formatPhone(phoneNumber)} — then retry here.
        </p>
      )}
    </div>
  );
}

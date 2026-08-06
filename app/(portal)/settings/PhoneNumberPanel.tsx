"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { formatPhone } from "@/lib/format";

type ConnectedNumber = {
  id: string;
  phoneNumber: string;
};

type TwilioOption = {
  phoneNumber: string;
  twilioSid: string;
  inVapi: boolean;
  assignedTo: string | null;
  connectedToMe: boolean;
  available: boolean;
};

/**
 * Manages every Twilio number this agent has connected to Vapi — that list
 * is what customers/campaigns pick a caller ID from. "Connect new number"
 * adds to the list; it never touches numbers already connected.
 */
export function PhoneNumberPanel({
  agentId,
  numbers,
}: {
  agentId: string;
  numbers: ConnectedNumber[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [working, setWorking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [twilioOptions, setTwilioOptions] = useState<TwilioOption[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!connecting) return;

    fetch(`/api/agents/${agentId}/phone-numbers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.numbers) return;
        setTwilioOptions(body.numbers);
        const pickable = (body.numbers as TwilioOption[]).filter(
          (row) => row.available && !row.connectedToMe
        );
        setSelectedPhone(pickable[0]?.phoneNumber ?? null);
      })
      .catch(() => {});
  }, [agentId, connecting]);

  async function handleConnect() {
    setWorking(true);

    const res = await fetch(`/api/agents/${agentId}/phone-numbers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        selectedPhone ? { phone_number: selectedPhone } : { area_code: areaCode || undefined }
      ),
    });
    const body = await res.json().catch(() => ({}));

    setWorking(false);

    if (!res.ok) {
      toast(body.error ?? "Could not connect the number.", "error");
      return;
    }

    toast(`Connected ${formatPhone(body.number?.phone_number)}.`, "success");
    setConnecting(false);
    setAreaCode("");
    router.refresh();
  }

  async function handleDisconnect(id: string, phoneNumber: string) {
    setRemovingId(id);
    const res = await fetch(`/api/agents/${agentId}/phone-numbers/${id}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => ({}));
    setRemovingId(null);

    if (!res.ok) {
      toast(body.error ?? "Could not disconnect that number.", "error");
      return;
    }

    toast(`Disconnected ${formatPhone(phoneNumber)}.`, "success");
    router.refresh();
  }

  const pickableOptions = twilioOptions.filter((row) => row.available && !row.connectedToMe);
  const hasPickable = pickableOptions.length > 0;

  return (
    <div className="space-y-3">
      {numbers.length > 0 ? (
        <ul className="space-y-2">
          {numbers.map((number) => (
            <li
              key={number.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"
            >
              <span className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {formatPhone(number.phoneNumber)}
              </span>
              <button
                onClick={() => handleDisconnect(number.id, number.phoneNumber)}
                disabled={removingId === number.id}
                aria-label={`Disconnect ${formatPhone(number.phoneNumber)}`}
                className="rounded-md p-1 text-emerald-600/70 transition-colors hover:bg-emerald-500/10 hover:text-red-600 disabled:opacity-50 dark:text-emerald-400/70 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No outbound numbers connected yet — calls can&apos;t go out until you
          connect at least one.
        </p>
      )}

      <p className="text-xs text-muted">
        Every connected number shows up as a caller ID to choose from when
        calling a customer or starting an auto-dial.
      </p>

      <Button variant="secondary" onClick={() => setConnecting(true)}>
        <Phone className="h-4 w-4" />
        Connect new number
      </Button>

      <Modal
        open={connecting}
        onClose={() => !working && setConnecting(false)}
        title="Connect a number"
        description="Add one more Twilio number to your list — your other connected numbers stay as they are."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConnecting(false)} disabled={working}>
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              loading={working}
              disabled={hasPickable && !selectedPhone}
            >
              {!working && <Phone className="h-4 w-4" />}
              Connect number
            </Button>
          </>
        }
      >
        {hasPickable ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted">
              Your Twilio numbers
            </legend>
            {pickableOptions.map((row) => (
              <label
                key={row.phoneNumber}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  selectedPhone === row.phoneNumber
                    ? "border-accent bg-accent/5"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="twilio-number-new"
                  className="mt-1"
                  checked={selectedPhone === row.phoneNumber}
                  onChange={() => setSelectedPhone(row.phoneNumber)}
                />
                <span>
                  <span className="font-medium">{formatPhone(row.phoneNumber)}</span>
                  {row.inVapi && (
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
            label="Preferred area code for new number"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="e.g. 415 — optional"
            inputMode="numeric"
          />
        )}

        <p className="text-xs text-amber-600 dark:text-amber-400">
          If Vapi says a number is locked to another organization, email{" "}
          <a href="mailto:support@vapi.ai" className="underline">
            support@vapi.ai
          </a>{" "}
          and ask them to release it, then retry here.
        </p>
      </Modal>
    </div>
  );
}

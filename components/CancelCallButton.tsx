"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneOff } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

/**
 * Hangs up a live call, or drops one that hasn't dialled yet. Always behind a
 * confirm step — an accidental click on a connected call drops a customer
 * mid-sentence.
 */
export function CancelCallButton({
  callId,
  customerName,
  status,
  size = "sm",
}: {
  callId: string;
  customerName: string;
  status: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const isConnected = status === "in_progress" || status === "ringing";

  async function handleCancel() {
    setWorking(true);

    const res = await fetch(`/api/calls/${callId}/cancel`, { method: "POST" });
    const body = await res.json().catch(() => ({}));

    setWorking(false);
    setConfirming(false);

    if (!res.ok) {
      toast(body.error ?? "Could not end the call.", "error");
      router.refresh();
      return;
    }

    toast(isConnected ? "Call ended." : "Call canceled before it dialled.", "success");
    router.refresh();
  }

  return (
    <>
      <Button variant="danger" size={size} onClick={() => setConfirming(true)}>
        <PhoneOff className="h-3.5 w-3.5" />
        {isConnected ? "Hang up" : "Cancel call"}
      </Button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={isConnected ? "Hang up this call?" : "Cancel this call?"}
        description={
          isConnected
            ? `Riley will end the conversation with ${customerName} right away.`
            : `${customerName} won't be dialled. You can start a new call any time.`
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={working}
            >
              Keep going
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={working}>
              {!working && <PhoneOff className="h-4 w-4" />}
              {isConnected ? "Hang up" : "Cancel call"}
            </Button>
          </>
        }
      />
    </>
  );
}

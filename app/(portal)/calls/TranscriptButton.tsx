"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

export function TranscriptButton({ callId }: { callId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (fetched) return;

    setLoading(true);
    const res = await fetch(`/api/calls/${callId}/transcript`);
    const body = await res.json().catch(() => ({}));
    setTranscript(typeof body.transcript === "string" ? body.transcript : null);
    setLoading(false);
    setFetched(true);
  }

  return (
    <>
      <button onClick={handleOpen} className="text-xs text-accent hover:underline">
        Transcript
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Call transcript">
        {loading ? (
          <p className="text-sm text-muted">Fetching from Vapi…</p>
        ) : transcript ? (
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm">
            {transcript}
          </p>
        ) : (
          <p className="text-sm text-muted">No transcript available for this call.</p>
        )}
      </Modal>
    </>
  );
}

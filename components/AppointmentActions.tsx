"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarX2, Check, MoreHorizontal, UserX, Video } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { TextareaField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import type { AppointmentStatus } from "@/types/database";

export interface AppointmentActionTarget {
  id: string;
  status: AppointmentStatus;
  customerName: string;
  zoomLink: string | null;
  rescheduleUrl: string | null;
  /** Decided on the server so this component stays pure across re-renders. */
  isOver: boolean;
}

/**
 * Everything an agent can do to an appointment without leaving the portal:
 * mark it done / no-show, cancel it (which also cancels the Calendly event),
 * join the meeting, or hand the customer Calendly's reschedule link.
 */
export function AppointmentActions({
  appointment,
}: {
  appointment: AppointmentActionTarget;
}) {
  const router = useRouter();
  const toast = useToast();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  function openMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 192;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function reposition() {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 192;
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menuOpen]);

  const isOver = appointment.isOver;
  const isClosed =
    appointment.status === "canceled" ||
    appointment.status === "completed" ||
    appointment.status === "no_show";

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    const res = await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    setMenuOpen(false);
    setCancelOpen(false);

    if (!res.ok) {
      toast(payload.error ?? "Could not update this appointment.", "error");
      return;
    }

    toast(payload.warning ?? successMessage, payload.warning ? "error" : "success");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {appointment.zoomLink && !isClosed && (
        <a
          href={appointment.zoomLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-background"
        >
          <Video className="h-3.5 w-3.5" />
          Join
        </a>
      )}

      {!isClosed && isOver && (
        <Button
          size="sm"
          variant="success"
          loading={busy}
          onClick={() => patch({ status: "completed" }, "Marked as completed.")}
        >
          {!busy && <Check className="h-3.5 w-3.5" />}
          Done
        </Button>
      )}

      {!isClosed && (
        <div className="relative">
          <Button
            ref={menuButtonRef}
            size="sm"
            variant="secondary"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>

          {menuOpen && menuPosition && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div
                className="fixed z-50 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                {!isOver && (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background"
                    onClick={() => patch({ status: "completed" }, "Marked as completed.")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark completed
                  </button>
                )}
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background"
                  onClick={() => patch({ status: "no_show" }, "Marked as a no-show.")}
                >
                  <UserX className="h-3.5 w-3.5" />
                  Mark no-show
                </button>
                {appointment.rescheduleUrl && (
                  <a
                    href={appointment.rescheduleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Reschedule
                  </a>
                )}
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-background dark:text-red-400"
                  onClick={() => {
                    setMenuOpen(false);
                    setCancelOpen(true);
                  }}
                >
                  <CalendarX2 className="h-3.5 w-3.5" />
                  Cancel appointment
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this appointment?"
        description={`${appointment.customerName}'s meeting will be canceled in Calendly too, and they'll get Calendly's cancellation email.`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCancelOpen(false)}
              disabled={busy}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => patch({ status: "canceled", canceled_reason: reason }, "Appointment canceled.")}
            >
              Cancel appointment
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason (shared with the customer by Calendly)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Something came up on our side — happy to find another time."
        />
      </Modal>
    </div>
  );
}

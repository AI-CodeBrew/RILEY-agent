"use client";

import Link from "next/link";
import { CalendarClock, ExternalLink, Video } from "lucide-react";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/lib/status-badge";
import { formatDateTime, formatPhone } from "@/lib/format";
import { AppointmentActions } from "@/components/AppointmentActions";
import type { AppointmentWithRelations } from "@/types/database";

/**
 * Everything about one appointment in one place — the calendar's equivalent
 * of a row on /appointments, opened by clicking a chip in any of the three
 * grids. Status changes/cancellation go through the same
 * <AppointmentActions> used on the Appointments list (which itself PATCHes
 * /api/appointments/[id], the one place that also cancels the real Calendly
 * event) — nothing here duplicates that logic.
 */
export function AppointmentDetailModal({
  appointment,
  timezone,
  isAdmin,
  onClose,
}: {
  appointment: AppointmentWithRelations | null;
  timezone: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  if (!appointment) return null;

  // eslint-disable-next-line react-hooks/purity
  const isOver = new Date(appointment.scheduled_at).getTime() < Date.now();
  const hasCalendlyInfo =
    appointment.calendly_event_uri || appointment.booking_url || appointment.reschedule_url;

  return (
    <Modal
      open={Boolean(appointment)}
      onClose={onClose}
      title={appointment.customer?.name ?? "Appointment"}
      description={formatDateTime(appointment.scheduled_at, timezone)}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={appointment.status} />
          <StatusBadge status={appointment.source} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted">Customer</dt>
            <dd>
              {appointment.customer ? (
                <Link
                  href={`/customers/${appointment.customer.id}`}
                  className="font-medium text-accent hover:underline"
                >
                  {appointment.customer.name}
                </Link>
              ) : (
                "—"
              )}
              {isAdmin && appointment.customer?.phone && (
                <span className="ml-1.5 text-xs text-muted">
                  {formatPhone(appointment.customer.phone)}
                </span>
              )}
            </dd>
          </div>
          {isAdmin && (
            <div>
              <dt className="text-xs text-muted">Agent</dt>
              <dd>{appointment.agent?.name ?? "—"}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Duration</dt>
            <dd>{appointment.duration_minutes} min</dd>
          </div>
        </dl>

        {hasCalendlyInfo && (
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted">Calendly</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {appointment.booking_url && (
                <a
                  href={appointment.booking_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Confirmation link
                </a>
              )}
              {appointment.reschedule_url && (
                <a
                  href={appointment.reschedule_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Reschedule
                </a>
              )}
            </div>
          </div>
        )}

        {appointment.zoom_link && (
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted">Meeting</p>
            <a
              href={appointment.zoom_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
            >
              <Video className="h-3.5 w-3.5" />
              Join Meeting
            </a>
          </div>
        )}

        {appointment.notes && (
          <div>
            <p className="text-xs font-medium text-muted">Notes</p>
            <p className="whitespace-pre-wrap text-sm">{appointment.notes}</p>
          </div>
        )}

        {!isAdmin && (
          <div className="flex justify-end border-t border-border pt-3">
            <AppointmentActions
              appointment={{
                id: appointment.id,
                status: appointment.status,
                customerName: appointment.customer?.name ?? "this customer",
                // The Meeting section above already covers Join — omitted
                // here so AppointmentActions doesn't render a second one.
                zoomLink: null,
                rescheduleUrl: appointment.reschedule_url,
                isOver,
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

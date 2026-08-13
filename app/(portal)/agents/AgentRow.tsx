"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleDashed, KeyRound, Phone, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ApprovalStatus } from "@/types/database";

export interface AgentRowData {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin";
  is_active: boolean;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  calendly_url: string | null;
  calendly_user_uri: string | null;
  phoneNumbers: string[];
  retry_max_attempts: number;
  retry_window_start: string;
  retry_window_end: string;
}

function ConnectedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function PendingPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
      <CircleDashed className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function AgentRow({
  agent,
  customerCount,
}: {
  agent: AgentRowData;
  customerCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: agent.name,
    email: agent.email,
    retryMaxAttempts: String(agent.retry_max_attempts),
    retryWindowStart: agent.retry_window_start.slice(0, 5),
    retryWindowEnd: agent.retry_window_end.slice(0, 5),
  });
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirm: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function patch(
    body: Record<string, unknown>,
    message: string,
    { onError }: { onError: (message: string) => void }
  ) {
    setSaving(true);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const msg = payload.error ?? "Failed to save";
      onError(msg);
      toast(msg, "error");
      return false;
    }

    toast(message, "success");
    router.refresh();
    return true;
  }

  async function handleDelete() {
    setDeleting(true);

    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));

    setDeleting(false);

    if (!res.ok) {
      toast(body.error ?? "Failed to delete agent", "error");
      return;
    }

    setConfirmingDelete(false);
    toast(`${agent.name} deleted.`, "success");
    router.refresh();
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setEditError(null);

    const retryMaxAttempts = Number(form.retryMaxAttempts);
    if (!Number.isFinite(retryMaxAttempts) || retryMaxAttempts < 0) {
      setEditError("Max retry attempts must be zero or more.");
      return;
    }
    if (form.retryWindowEnd <= form.retryWindowStart) {
      setEditError("Calling window end must be after the start.");
      return;
    }

    const ok = await patch(
      {
        name: form.name,
        email: form.email,
        retry_max_attempts: retryMaxAttempts,
        retry_window_start: form.retryWindowStart,
        retry_window_end: form.retryWindowEnd,
      },
      `${form.name} updated.`,
      { onError: setEditError }
    );
    if (ok) setEditing(false);
  }

  async function handlePasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);

    if (passwordForm.password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      setPasswordError("The two passwords don't match.");
      return;
    }

    const ok = await patch(
      { password: passwordForm.password },
      `${agent.name}'s password was reset.`,
      { onError: setPasswordError }
    );
    if (ok) {
      setPasswordForm({ password: "", confirm: "" });
      setResettingPassword(false);
    }
  }

  function openEdit() {
    setEditError(null);
    setForm({
      name: agent.name,
      email: agent.email,
      retryMaxAttempts: String(agent.retry_max_attempts),
      retryWindowStart: agent.retry_window_start.slice(0, 5),
      retryWindowEnd: agent.retry_window_end.slice(0, 5),
    });
    setEditing(true);
  }

  function openPasswordReset() {
    setPasswordError(null);
    setPasswordForm({ password: "", confirm: "" });
    setResettingPassword(true);
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-background">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={agent.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{agent.name}</span>
              {agent.role === "admin" && (
                <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-label="Admin" />
              )}
              {agent.approval_status === "rejected" && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                  rejected
                </span>
              )}
              {!agent.is_active && agent.approval_status === "approved" && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                  deactivated
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted">{agent.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{customerCount}</td>
      <td className="px-4 py-3">
        {/* Read-only: the agent connects this themselves from Settings. */}
        {agent.calendly_user_uri ? (
          <ConnectedPill label="Connected" />
        ) : (
          <PendingPill label="Not connected" />
        )}
      </td>
      <td className="px-4 py-3">
        {agent.phoneNumbers.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Phone className="h-3.5 w-3.5" />
            {agent.phoneNumbers[0]}
            {agent.phoneNumbers.length > 1 && ` +${agent.phoneNumbers.length - 1}`}
          </span>
        ) : (
          <PendingPill label="No number yet" />
        )}
      </td>
      <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
        <Button variant="secondary" size="sm" onClick={openEdit}>
          Edit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={openPasswordReset}
          title={`Reset password for ${agent.name}`}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Password
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={saving}
          onClick={() =>
            patch(
              { is_active: !agent.is_active },
              agent.is_active
                ? `${agent.name} can no longer sign in.`
                : `${agent.name} can sign in again.`,
              { onError: (msg) => toast(msg, "error") }
            )
          }
        >
          {agent.is_active ? "Deactivate" : "Reactivate"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmingDelete(true)}
          title={`Delete ${agent.name}`}
          aria-label={`Delete ${agent.name}`}
          className="text-red-600 hover:bg-red-500/10 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <Modal
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title={`Delete ${agent.name}?`}
          description="This removes their login for good. Their customers become unassigned, and their calls and appointments stay in the history. Deactivate instead if you might want them back."
        >
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={deleting}
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {!deleting && <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </div>
        </Modal>

        {/* Fixed-position overlay, so living inside the cell is fine. */}
        <Modal
          open={editing}
          onClose={() => setEditing(false)}
          title={`Edit ${agent.name}`}
          description="Changing the email changes the address they sign in with. Use Password to set a new login password."
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium">Auto-retry calling hours</p>
              <p className="mt-1 text-xs text-muted">
                When a call ends in &quot;Follow up&quot; or &quot;No answer&quot;, Abby redials
                automatically — but only inside this window, up to the attempt cap below. Each
                agent sets their own redial delay from their AI Integration page.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Max auto-retry attempts"
                  type="number"
                  min={0}
                  value={form.retryMaxAttempts}
                  onChange={(e) => update("retryMaxAttempts", e.target.value)}
                />
                <div />
                <Field
                  label="Calling window starts"
                  type="time"
                  value={form.retryWindowStart}
                  onChange={(e) => update("retryWindowStart", e.target.value)}
                />
                <Field
                  label="Calling window ends"
                  type="time"
                  value={form.retryWindowEnd}
                  onChange={(e) => update("retryWindowEnd", e.target.value)}
                />
              </div>
            </div>

            {editError && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
                {editError}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {!saving && <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          open={resettingPassword}
          onClose={() => setResettingPassword(false)}
          title="Reset login password"
          className="max-w-md"
        >
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
              <Avatar name={agent.name} />
              <div className="min-w-0">
                <p className="truncate font-medium">{agent.name}</p>
                <p className="truncate text-sm text-muted">{agent.email}</p>
              </div>
            </div>

            <p className="text-sm text-muted">
              Set a new password for this reseller. They sign in at{" "}
              <span className="font-medium text-foreground">/login</span> with the email above.
              You don&apos;t need their current password.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="New password"
                name="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordForm.password}
                onChange={(e) =>
                  setPasswordForm((current) => ({ ...current, password: e.target.value }))
                }
                hint="Min. 8 characters"
              />
              <Field
                label="Confirm password"
                name="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordForm.confirm}
                onChange={(e) =>
                  setPasswordForm((current) => ({ ...current, confirm: e.target.value }))
                }
              />
            </div>

            {passwordError && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
                {passwordError}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResettingPassword(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {!saving && <KeyRound className="h-4 w-4" />}
                Reset password
              </Button>
            </div>
          </form>
        </Modal>
      </td>
    </tr>
  );
}

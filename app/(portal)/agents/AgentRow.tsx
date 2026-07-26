"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleDashed, KeyRound, Phone, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export interface AgentRowData {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin";
  is_active: boolean;
  calendly_url: string | null;
  calendly_user_uri: string | null;
  vapi_phone_number_id: string | null;
  vapi_phone_number: string | null;
}

function PhoneNumberCell({ agent }: { agent: AgentRowData }) {
  const router = useRouter();
  const toast = useToast();
  const [requesting, setRequesting] = useState(false);

  if (agent.vapi_phone_number_id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Phone className="h-3.5 w-3.5" />
        {agent.vapi_phone_number}
      </span>
    );
  }

  async function handleRequest() {
    setRequesting(true);
    const res = await fetch(`/api/agents/${agent.id}/phone-number`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    setRequesting(false);

    if (!res.ok) {
      toast(body.error ?? "Failed to request number", "error");
      return;
    }

    toast(`${agent.name} now calls from ${body.agent?.vapi_phone_number}.`, "success");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleRequest} loading={requesting}>
      {!requesting && <Phone className="h-3.5 w-3.5" />}
      {requesting
        ? "Buying…"
        : agent.vapi_phone_number
          ? "Retry connecting number"
          : "Get phone number"}
    </Button>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: agent.name,
    email: agent.email,
    role: agent.role as string,
    calendly_url: agent.calendly_url ?? "",
    calendly_access_token: "",
    password: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function patch(body: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Failed to save");
      toast(payload.error ?? "Failed to save", "error");
      return false;
    }

    toast(message, "success");
    router.refresh();
    return true;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const ok = await patch(
      {
        name: form.name,
        email: form.email,
        role: form.role,
        calendly_url: form.calendly_url,
        ...(form.calendly_access_token
          ? { calendly_access_token: form.calendly_access_token }
          : {}),
        ...(form.password ? { password: form.password } : {}),
      },
      `${form.name} updated.`
    );
    if (ok) {
      setForm((current) => ({ ...current, calendly_access_token: "", password: "" }));
      setEditing(false);
    }
  }

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-background">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={agent.name} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{agent.name}</span>
                {agent.role === "admin" && (
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-accent"
                    aria-label="Admin"
                  />
                )}
                {!agent.is_active && (
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
          {agent.calendly_user_uri ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
              <CircleDashed className="h-3.5 w-3.5" />
              Not connected
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <PhoneNumberCell agent={agent} />
        </td>
        <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
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
                  : `${agent.name} can sign in again.`
              )
            }
          >
            {agent.is_active ? "Deactivate" : "Reactivate"}
          </Button>

          {/* Fixed-position overlay, so living inside the cell is fine. */}
          <Modal
            open={editing}
            onClose={() => setEditing(false)}
            title={`Edit ${agent.name}`}
            description="Changing the email changes the address they sign in with."
          >
            <form onSubmit={handleSave} className="space-y-3">
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
                <SelectField
                  label="Role"
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </SelectField>
                <Field
                  label="Calendly scheduling URL"
                  value={form.calendly_url}
                  onChange={(e) => update("calendly_url", e.target.value)}
                />
                <Field
                  label="New Calendly token"
                  type="password"
                  value={form.calendly_access_token}
                  onChange={(e) => update("calendly_access_token", e.target.value)}
                  placeholder="Leave blank to keep current"
                />
                <Field
                  label="Reset password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Leave blank to keep current"
                  hint="At least 8 characters."
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {!saving && <KeyRound className="h-4 w-4" />}
                  Save changes
                </Button>
              </div>
            </form>
          </Modal>
        </td>
      </tr>
    </>
  );
}


import { Mail, Phone } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import type { ContactRequest } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ContactRequestsPage() {
  // The landing page's "Contact Us" form lands here for admin follow-up.
  await requireAdmin();

  const { data: requests, error } = await supabaseAdmin
    .from("contact_requests")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Requests"
        description="Submissions from the landing page's Contact Us form. Reach out directly by email or phone."
      />

      {error && (
        <p className="text-sm text-red-600">
          Failed to load contact requests: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {requests && requests.length > 0 ? (
          <ul className="divide-y divide-border">
            {(requests as ContactRequest[]).map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {request.first_name} {request.last_name}
                  </p>
                  {request.address && (
                    <p className="mt-0.5 text-sm text-muted">{request.address}</p>
                  )}
                  {request.comment && (
                    <p className="mt-1.5 max-w-xl text-sm text-foreground">{request.comment}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted" title={formatDateTime(request.created_at)}>
                    {formatRelative(request.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <a
                    href={`mailto:${request.email}`}
                    className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {request.email}
                  </a>
                  <a
                    href={`tel:${request.phone}`}
                    className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {request.phone}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Mail}
            title="No contact requests yet"
            description="Submissions from the landing page's Contact Us form will show up here."
          />
        )}
      </Card>
    </div>
  );
}

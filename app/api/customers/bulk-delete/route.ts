import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import type { Customer } from "@/types/database";

const MAX_BATCH = 100;

export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const rawIds = body.ids;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one customer to delete." },
      { status: 400 }
    );
  }

  if (rawIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Delete at most ${MAX_BATCH} customers at a time.` },
      { status: 400 }
    );
  }

  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Invalid customer selection." }, { status: 400 });
  }

  let query = supabaseAdmin.from("customers").select("id, name, agent_id, status").in("id", ids);

  if (!auth.session.isAdmin) {
    query = query.eq("agent_id", auth.session.agent.id);
  }

  const { data: rows, error: fetchError } = await query;
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const customers = (rows ?? []) as Pick<Customer, "id" | "name" | "agent_id" | "status">[];

  if (customers.length !== ids.length) {
    return NextResponse.json(
      { error: "One or more customers were not found or belong to another agent." },
      { status: 403 }
    );
  }

  const calling = customers.filter((customer) => customer.status === "calling");
  if (calling.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete while a call is in progress (${calling.map((c) => c.name).join(", ")}).`,
      },
      { status: 409 }
    );
  }

  const authorizedIds = customers.map((customer) => customer.id);

  const { error: deleteError } = await supabaseAdmin
    .from("customers")
    .delete()
    .in("id", authorizedIds);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: authorizedIds.length,
    names: customers.map((customer) => customer.name),
  });
}

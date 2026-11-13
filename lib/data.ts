import "server-only";
import type { Ctx } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysBetween, todayIn } from "@/lib/dates";

export type Payment = {
  id: string;
  amount_cents: number;
  paid_on: string;
  method: string | null;
  note: string | null;
};

export type Obligation = {
  id: string;
  kind: "payment" | "task";
  title: string;
  due_date: string;
  completed_at: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  notes: string | null;
  owed_by: string;
  amount_cents: number | null; // null when hidden or not a payment
  paid_cents: number;
  payments: Payment[];
  days: number; // days until due in the wedding's timezone (negative = overdue)
};

/** Everything the signed-in person is allowed to see, via row-level security. */
export async function loadObligations(c: Ctx, opts: { vendorId?: string } = {}): Promise<Obligation[]> {
  let q = c.supabase
    .from("obligations")
    .select("id, kind, title, due_date, completed_at, vendor_id, notes, owed_by_member_id, owed_by_name, owed_by_email, vendors(name)")
    .order("due_date", { ascending: true });
  if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const ids = (rows ?? []).map((r) => r.id);
  const amountMap = new Map<string, number>();
  const payMap = new Map<string, Payment[]>();

  if (c.seesAmounts && ids.length) {
    const [{ data: amounts }, { data: pays }] = await Promise.all([
      c.supabase.from("obligation_amounts").select("obligation_id, amount_cents").in("obligation_id", ids),
      c.supabase
        .from("payment_records")
        .select("id, obligation_id, amount_cents, paid_on, method, note")
        .in("obligation_id", ids)
        .order("paid_on", { ascending: true }),
    ]);
    (amounts ?? []).forEach((a) => amountMap.set(a.obligation_id, Number(a.amount_cents)));
    (pays ?? []).forEach((p) => {
      const list = payMap.get(p.obligation_id) ?? [];
      list.push({ id: p.id, amount_cents: Number(p.amount_cents), paid_on: p.paid_on, method: p.method, note: p.note });
      payMap.set(p.obligation_id, list);
    });
  }

  // Names of people who owe things. Only display names/emails of this wedding's members.
  const names = new Map<string, string>();
  const { data: members } = await createAdminClient()
    .from("members")
    .select("id, display_name, email")
    .eq("wedding_id", c.wedding.id);
  (members ?? []).forEach((m) => names.set(m.id, m.display_name || m.email));

  const today = todayIn(c.wedding.timezone);
  return (rows ?? []).map((r) => {
    const payments = payMap.get(r.id) ?? [];
    const vendor = r.vendors as unknown as { name: string } | null;
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      due_date: r.due_date,
      completed_at: r.completed_at,
      vendor_id: r.vendor_id,
      vendor_name: vendor?.name ?? null,
      notes: r.notes,
      owed_by: r.owed_by_member_id
        ? names.get(r.owed_by_member_id) ?? "Someone"
        : r.owed_by_name || r.owed_by_email || "Someone",
      amount_cents: amountMap.get(r.id) ?? null,
      paid_cents: payments.reduce((s, p) => s + p.amount_cents, 0),
      payments,
      days: daysBetween(today, r.due_date),
    };
  });
}

/** Members the signed-in person can see (owner: everyone; others: just themselves). */
export async function loadVisibleMembers(c: Ctx) {
  const { data } = await c.supabase
    .from("members")
    .select("id, display_name, email")
    .neq("status", "revoked")
    .order("display_name");
  return (data ?? []).map((m) => ({ id: m.id as string, label: (m.display_name || m.email) as string }));
}

export async function loadVendorOptions(c: Ctx) {
  const { data } = await c.supabase.from("vendors").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginLink } from "@/lib/auth-links";
import { parseDollars } from "@/lib/money";

const str = (f: FormData, k: string): string | null => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const flag = (f: FormData, k: string) => f.get(k) === "on";

function fail(msg: string): never {
  throw new Error(msg);
}

// ───────────── session ─────────────

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ───────────── vendors ─────────────

export async function addVendor(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to add vendors.");
  const name = str(f, "name") ?? fail("Vendor name is required.");
  const id = crypto.randomUUID(); // chosen up front: editors may not be able to read a row back before access is granted

  const { error } = await c.supabase.from("vendors").insert({
    id,
    wedding_id: c.wedding.id,
    name,
    category: str(f, "category"),
    contact_name: str(f, "contact_name"),
    contact_email: str(f, "contact_email"),
    contact_phone: str(f, "contact_phone"),
    status: str(f, "status") ?? "considering",
    notes: str(f, "notes"),
  });
  if (error) fail(error.message);

  // Non-owner editors limited to selected vendors should still see what they create.
  if (!c.isOwner && c.member.vendor_scope === "selected") {
    await createAdminClient().from("member_vendor_access").insert({ member_id: c.member.id, vendor_id: id });
  }

  const total = c.seesAmounts ? parseDollars(str(f, "contract_total")) : null;
  if (total !== null) {
    const { error: cErr } = await c.supabase.from("vendor_contracts").insert({
      vendor_id: id,
      wedding_id: c.wedding.id,
      contract_total_cents: total,
      contract_signed_on: str(f, "signed_on"),
    });
    if (cErr) fail(cErr.message);
  }
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function updateVendor(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to edit vendors.");
  const id = str(f, "vendor_id") ?? fail("Missing vendor.");
  const name = str(f, "name") ?? fail("Vendor name is required.");

  const { error } = await c.supabase
    .from("vendors")
    .update({
      name,
      category: str(f, "category"),
      contact_name: str(f, "contact_name"),
      contact_email: str(f, "contact_email"),
      contact_phone: str(f, "contact_phone"),
      status: str(f, "status") ?? "considering",
      notes: str(f, "notes"),
    })
    .eq("id", id);
  if (error) fail(error.message);

  if (c.seesAmounts && f.has("contract_total")) {
    const total = parseDollars(str(f, "contract_total")) ?? 0;
    const { error: cErr } = await c.supabase.from("vendor_contracts").upsert({
      vendor_id: id,
      wedding_id: c.wedding.id,
      contract_total_cents: total,
      contract_signed_on: str(f, "signed_on"),
    });
    if (cErr) fail(cErr.message);
  }
  revalidatePath(`/vendors/${id}`);
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function deleteVendor(f: FormData) {
  const c = await getContext();
  if (!c.isOwner) fail("Only the owner can delete vendors.");
  const id = str(f, "vendor_id") ?? fail("Missing vendor.");
  const { error } = await c.supabase.from("vendors").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/vendors");
  redirect("/vendors");
}

// ───────────── deadlines & payments ─────────────

export async function addObligation(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to add deadlines.");

  const kind = str(f, "kind") === "payment" ? "payment" : "task";
  const title = str(f, "title") ?? fail("Title is required.");
  const dueDate = str(f, "due_date") ?? fail("Due date is required.");
  const vendorId = str(f, "vendor_id");

  const ownerMember = str(f, "owed_by_member");
  const ownerEmail = str(f, "owed_by_email")?.toLowerCase() ?? null;
  if (!ownerMember && !ownerEmail) fail("Choose who owes this, or enter their email.");

  let amount: number | null = null;
  if (kind === "payment") {
    if (!c.seesAmounts) fail("You don't have permission to add payments.");
    amount = parseDollars(str(f, "amount"));
    if (amount === null) fail("A payment needs an amount.");
  }

  const id = crypto.randomUUID();
  const { error } = await c.supabase.from("obligations").insert({
    id,
    wedding_id: c.wedding.id,
    vendor_id: vendorId,
    kind,
    title,
    due_date: dueDate,
    owed_by_member_id: ownerMember,
    owed_by_name: ownerMember ? null : str(f, "owed_by_name"),
    owed_by_email: ownerMember ? null : ownerEmail,
    notes: str(f, "notes"),
  });
  if (error) fail(error.message);

  if (kind === "payment" && amount !== null) {
    const { error: aErr } = await c.supabase
      .from("obligation_amounts")
      .insert({ obligation_id: id, wedding_id: c.wedding.id, amount_cents: amount });
    if (aErr) fail(aErr.message);
  }
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function rescheduleObligation(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to change deadlines.");
  const id = str(f, "obligation_id") ?? fail("Missing item.");
  const dueDate = str(f, "due_date") ?? fail("Due date is required.");
  const { error } = await c.supabase.from("obligations").update({ due_date: dueDate }).eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function toggleTask(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to change deadlines.");
  const id = str(f, "obligation_id") ?? fail("Missing item.");
  const done = f.get("done") === "1";
  const { error } = await c.supabase
    .from("obligations")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("kind", "task");
  if (error) fail(error.message);
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function deleteObligation(f: FormData) {
  const c = await getContext();
  if (!c.isEditor) fail("You don't have permission to delete deadlines.");
  const id = str(f, "obligation_id") ?? fail("Missing item.");
  const { error } = await c.supabase.from("obligations").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function recordPayment(f: FormData) {
  const c = await getContext();
  if (!c.isEditor || !c.seesAmounts) fail("You don't have permission to record payments.");
  const obligationId = str(f, "obligation_id") ?? fail("Missing payment.");
  const amount = parseDollars(str(f, "amount"));
  if (amount === null || amount <= 0) fail("Enter an amount greater than zero.");

  const { error } = await c.supabase.from("payment_records").insert({
    obligation_id: obligationId,
    wedding_id: c.wedding.id,
    amount_cents: amount,
    paid_on: str(f, "paid_on") ?? undefined,
    method: str(f, "method"),
    note: str(f, "note"),
    recorded_by: c.user.id,
  });
  if (error) fail(error.message);
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

export async function deletePaymentRecord(f: FormData) {
  const c = await getContext();
  if (!c.isEditor || !c.seesAmounts) fail("You don't have permission to change payments.");
  const id = str(f, "payment_id") ?? fail("Missing payment record.");
  const { error } = await c.supabase.from("payment_records").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/deadlines");
  revalidatePath("/vendors");
  revalidatePath("/");
}

// ───────────── people (owner only) ─────────────

async function syncVendorAccess(memberId: string, scope: string, vendorIds: string[]) {
  const admin = createAdminClient();
  await admin.from("member_vendor_access").delete().eq("member_id", memberId);
  if (scope === "selected" && vendorIds.length) {
    await admin
      .from("member_vendor_access")
      .insert(vendorIds.map((vendor_id) => ({ member_id: memberId, vendor_id })));
  }
}

function readAccess(f: FormData) {
  const role = str(f, "role");
  return {
    role: role === "owner" || role === "editor" ? role : "viewer",
    can_see_amounts: flag(f, "can_see_amounts"),
    can_see_deadlines: flag(f, "can_see_deadlines"),
    vendor_scope: str(f, "vendor_scope") === "all" ? "all" : "selected",
    receive_all_reminders: flag(f, "receive_all_reminders"),
    display_name: str(f, "display_name"),
  };
}

export async function inviteMember(f: FormData) {
  const c = await getContext();
  if (!c.isOwner) fail("Only the owner can invite people.");
  const email = (str(f, "email") ?? fail("Email is required.")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("That doesn't look like an email address.");

  const admin = createAdminClient();
  const access = readAccess(f);

  const { data: existing } = await admin
    .from("members")
    .select("id, user_id")
    .eq("wedding_id", c.wedding.id)
    .eq("email", email)
    .maybeSingle();

  let memberId: string;
  if (existing) {
    memberId = existing.id;
    const { error } = await admin
      .from("members")
      .update({ ...access, status: existing.user_id ? "active" : "invited" })
      .eq("id", memberId);
    if (error) fail(error.message);
  } else {
    const { data, error } = await admin
      .from("members")
      .insert({ ...access, wedding_id: c.wedding.id, email, status: "invited", invited_by: c.user.id })
      .select("id")
      .single();
    if (error || !data) fail(error?.message ?? "Could not create invite.");
    memberId = data.id;
  }

  await syncVendorAccess(memberId, access.vendor_scope, f.getAll("vendor_ids").map(String));
  await sendLoginLink(email);
  revalidatePath("/people");
}

export async function updateMember(f: FormData) {
  const c = await getContext();
  if (!c.isOwner) fail("Only the owner can change access.");
  const memberId = str(f, "member_id") ?? fail("Missing person.");
  const access = readAccess(f);

  if (memberId === c.member.id) {
    // Owners can't lock themselves out or downgrade the last owner.
    access.role = "owner";
  }
  const admin = createAdminClient();
  const { error } = await admin.from("members").update(access).eq("id", memberId).eq("wedding_id", c.wedding.id);
  if (error) fail(error.message);

  await syncVendorAccess(memberId, access.vendor_scope, f.getAll("vendor_ids").map(String));
  revalidatePath("/people");
}

export async function revokeMember(f: FormData) {
  const c = await getContext();
  if (!c.isOwner) fail("Only the owner can remove people.");
  const memberId = str(f, "member_id") ?? fail("Missing person.");
  if (memberId === c.member.id) fail("You can't remove yourself.");
  const admin = createAdminClient();
  const { error } = await admin
    .from("members")
    .update({ status: "revoked" })
    .eq("id", memberId)
    .eq("wedding_id", c.wedding.id);
  if (error) fail(error.message);
  revalidatePath("/people");
}

export async function resendInvite(f: FormData) {
  const c = await getContext();
  if (!c.isOwner) fail("Only the owner can send invites.");
  const memberId = str(f, "member_id") ?? fail("Missing person.");
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("email, status")
    .eq("id", memberId)
    .eq("wedding_id", c.wedding.id)
    .single();
  if (!data || data.status === "revoked") fail("That person doesn't have access.");
  await sendLoginLink(data.email);
  revalidatePath("/people");
}

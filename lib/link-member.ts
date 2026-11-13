import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Runs after a successful login. Connects the auth user to their invited `members` row,
 * and bootstraps the wedding + owner row the first time OWNER_EMAIL signs in.
 */
export async function linkMember(user: User): Promise<void> {
  const email = user.email?.toLowerCase();
  if (!email) return;
  const admin = createAdminClient();

  const { data: rows } = await admin.from("members").select("id, user_id, status").eq("email", email);

  if (!rows || rows.length === 0) {
    const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (email !== ownerEmail) return; // not invited: no membership, RLS shows them nothing

    const { count } = await admin.from("weddings").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return; // already bootstrapped by someone else

    const { data: wedding, error } = await admin
      .from("weddings")
      .insert({ name: process.env.WEDDING_NAME || "Our Wedding", created_by: user.id })
      .select("id")
      .single();
    if (error || !wedding) throw new Error(error?.message ?? "Could not create wedding");

    const { error: memberError } = await admin.from("members").insert({
      wedding_id: wedding.id,
      user_id: user.id,
      email,
      role: "owner",
      status: "active",
      can_see_amounts: true,
      can_see_deadlines: true,
      vendor_scope: "all",
      receive_all_reminders: true,
      accepted_at: new Date().toISOString(),
    });
    if (memberError) throw new Error(memberError.message);
    return;
  }

  for (const row of rows) {
    if (row.status === "revoked") continue;
    if (row.status === "invited" || !row.user_id) {
      await admin
        .from("members")
        .update({ user_id: user.id, status: "active", accepted_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
}

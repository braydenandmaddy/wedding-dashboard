"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginLink } from "@/lib/auth-links";

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect("/login?error=email");

  const admin = createAdminClient();
  const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

  let allowed = email === ownerEmail;
  if (!allowed) {
    const { data } = await admin.from("members").select("id").eq("email", email).neq("status", "revoked").limit(1);
    allowed = !!data?.length;
  }

  if (allowed) {
    let failed = false;
    try {
      await sendLoginLink(email);
    } catch (e) {
      console.error("login link failed", e);
      failed = true;
    }
    if (failed) redirect("/login?error=send");
  }

  // Same response whether or not the email is on the list, so the form can't be used to
  // find out who is invited.
  redirect("/login?sent=1");
}

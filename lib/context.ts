import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  wedding_id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: "owner" | "editor" | "viewer";
  status: "invited" | "active" | "revoked";
  can_see_amounts: boolean;
  can_see_deadlines: boolean;
  vendor_scope: "all" | "selected";
  receive_all_reminders: boolean;
};

export type Wedding = { id: string; name: string; wedding_date: string | null; timezone: string };

/** Signed-in user + their membership. Redirects to /login or /no-access when appropriate. */
export async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle<Member>();
  if (!member) redirect("/no-access");

  const { data: wedding } = await supabase
    .from("weddings")
    .select("id, name, wedding_date, timezone")
    .eq("id", member.wedding_id)
    .single<Wedding>();
  if (!wedding) redirect("/no-access");

  const isOwner = member.role === "owner";
  return {
    supabase,
    user,
    member,
    wedding,
    isOwner,
    isEditor: isOwner || member.role === "editor",
    seesAmounts: isOwner || member.can_see_amounts,
  };
}

export type Ctx = Awaited<ReturnType<typeof getContext>>;

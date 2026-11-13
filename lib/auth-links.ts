import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, button, emailShell, sendEmail } from "@/lib/email";

/**
 * Generates a one-time login link and emails it through Resend (not Supabase's mailer).
 * Callers must already have decided this email is allowed to log in.
 */
export async function sendLoginLink(email: string): Promise<void> {
  const admin = createAdminClient();

  // Make sure an auth user exists (ignore "already registered").
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => undefined);

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message ?? "Could not create login link");

  const url = `${SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
  const sent = await sendEmail({
    to: email,
    subject: "Your wedding planning login link",
    html: emailShell(
      `<h2 style="font-weight:normal">Sign in</h2>
       <p>Use the button below to sign in. The link works once and expires soon.</p>
       ${button(url, "Sign in")}
       <p style="color:#888;font-size:13px">If you didn't ask for this, you can ignore this email.</p>`
    ),
  });
  if (sent.error) throw new Error(sent.error);
}

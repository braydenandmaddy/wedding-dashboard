import "server-only";
import { Resend } from "resend";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailShell(inner: string): string {
  return `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#2b2b2b">${inner}
  <p style="color:#888;font-size:12px;margin-top:32px">Private wedding planning dashboard.</p></div>`;
}

export function button(href: string, label: string): string {
  return `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#4f6b57;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif">${escapeHtml(label)}</a></p>`;
}

/** Returns an error message, or null on success. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string | null; error: string | null }> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { id: data?.id ?? null, error: error ? error.message : null };
}

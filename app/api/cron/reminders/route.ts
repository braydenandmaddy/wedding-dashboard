import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, button, emailShell, escapeHtml, sendEmail } from "@/lib/email";
import { addDays, fmtDate, todayIn } from "@/lib/dates";
import { dollars } from "@/lib/money";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OFFSETS = [7, 3, 1] as const;

type Recipient = { email: string; name: string | null; seesAmounts: boolean; isDebtor: boolean };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = { sent: 0, skipped: 0, failed: 0 };

  const { data: weddings } = await admin.from("weddings").select("id, name, timezone");

  for (const w of weddings ?? []) {
    const today = todayIn(w.timezone);
    const targets = OFFSETS.map((d) => ({ days: d, date: addDays(today, d) }));

    const { data: obligations } = await admin
      .from("obligations")
      .select("id, kind, title, due_date, notes, owed_by_member_id, owed_by_name, owed_by_email, vendors(name)")
      .eq("wedding_id", w.id)
      .is("completed_at", null)
      .in("due_date", targets.map((t) => t.date));
    if (!obligations?.length) continue;

    const { data: members } = await admin
      .from("members")
      .select("id, email, display_name, role, status, can_see_amounts, receive_all_reminders")
      .eq("wedding_id", w.id)
      .neq("status", "revoked");
    const memberById = new Map((members ?? []).map((m) => [m.id, m]));

    const ids = obligations.map((o) => o.id);
    const [{ data: amounts }, { data: pays }] = await Promise.all([
      admin.from("obligation_amounts").select("obligation_id, amount_cents").in("obligation_id", ids),
      admin.from("payment_records").select("obligation_id, amount_cents").in("obligation_id", ids),
    ]);
    const amountOf = new Map<string, number>();
    (amounts ?? []).forEach((a) => amountOf.set(a.obligation_id as string, Number(a.amount_cents)));
    const paidOf = new Map<string, number>();
    (pays ?? []).forEach((p) =>
      paidOf.set(p.obligation_id as string, (paidOf.get(p.obligation_id as string) ?? 0) + Number(p.amount_cents))
    );

    for (const o of obligations) {
      const days = targets.find((t) => t.date === o.due_date)!.days;

      // Who gets it: whoever owes it, plus anyone who asked to be copied on everything.
      const recipients = new Map<string, Recipient>();
      if (o.owed_by_member_id) {
        const m = memberById.get(o.owed_by_member_id);
        if (m) recipients.set(m.email.toLowerCase(), { email: m.email, name: m.display_name, seesAmounts: true, isDebtor: true });
      } else if (o.owed_by_email) {
        recipients.set(o.owed_by_email.toLowerCase(), { email: o.owed_by_email, name: o.owed_by_name, seesAmounts: true, isDebtor: true });
      }
      for (const m of members ?? []) {
        if (m.status !== "active" || !m.receive_all_reminders) continue;
        const key = m.email.toLowerCase();
        if (recipients.has(key)) continue;
        recipients.set(key, {
          email: m.email,
          name: m.display_name,
          seesAmounts: m.role === "owner" || m.can_see_amounts,
          isDebtor: false,
        });
      }

      const vendor = o.vendors as unknown as { name: string } | null;
      const amount = amountOf.get(o.id);
      const remaining = amount !== undefined ? amount - (paidOf.get(o.id) ?? 0) : null;

      for (const r of recipients.values()) {
        const key = r.email.toLowerCase();

        // Claim the send first. The unique key (obligation, offset, due date, recipient)
        // makes re-runs and overlapping runs safe, and a moved due date sends fresh reminders.
        const { error: claimError } = await admin.from("reminder_log").insert({
          obligation_id: o.id,
          days_before: days,
          due_date: o.due_date,
          sent_to: key,
          status: "sent",
        });
        if (claimError) {
          if (claimError.code === "23505") summary.skipped++;
          else {
            console.error("reminder claim failed", claimError);
            summary.failed++;
          }
          continue;
        }

        const when = days === 1 ? "tomorrow" : `in ${days} days`;
        const what = o.kind === "payment" ? "payment" : "deadline";
        const lines = [
          `<p>${r.isDebtor ? "A reminder that" : "Heads up:"} <strong>${escapeHtml(o.title)}</strong>${
            vendor ? ` (${escapeHtml(vendor.name)})` : ""
          } is due <strong>${when}</strong>, on ${fmtDate(o.due_date)}.</p>`,
        ];
        if (r.isDebtor === false && o.owed_by_member_id) {
          const who = memberById.get(o.owed_by_member_id);
          if (who) lines.push(`<p>Owed by ${escapeHtml(who.display_name || who.email)}.</p>`);
        } else if (r.isDebtor === false && (o.owed_by_name || o.owed_by_email)) {
          lines.push(`<p>Owed by ${escapeHtml(o.owed_by_name || o.owed_by_email || "")}.</p>`);
        }
        if (o.kind === "payment" && r.seesAmounts && remaining !== null) {
          lines.push(`<p>Amount outstanding: <strong>${dollars(remaining)}</strong></p>`);
        }
        if (o.notes) lines.push(`<p style="color:#666">${escapeHtml(o.notes)}</p>`);

        const sent = await sendEmail({
          to: r.email,
          subject: `Reminder: ${o.title} due ${when}`,
          html: emailShell(`<h2 style="font-weight:normal">${what[0].toUpperCase() + what.slice(1)} due ${when}</h2>${lines.join("")}${button(SITE_URL, "Open dashboard")}`),
        });

        if (sent.error) {
          console.error("reminder send failed", sent.error);
          // Release the claim so a manual re-run can retry.
          await admin
            .from("reminder_log")
            .delete()
            .eq("obligation_id", o.id)
            .eq("days_before", days)
            .eq("due_date", o.due_date)
            .eq("sent_to", key);
          summary.failed++;
        } else {
          if (sent.id) {
            await admin
              .from("reminder_log")
              .update({ resend_id: sent.id })
              .eq("obligation_id", o.id)
              .eq("days_before", days)
              .eq("due_date", o.due_date)
              .eq("sent_to", key);
          }
          summary.sent++;
        }
      }
    }
  }

  return NextResponse.json(summary);
}

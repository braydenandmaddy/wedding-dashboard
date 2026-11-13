import Link from "next/link";
import type { Obligation } from "@/lib/data";
import { dollars } from "@/lib/money";
import { fmtDate, relativeDue } from "@/lib/dates";
import {
  deleteObligation,
  deletePaymentRecord,
  recordPayment,
  rescheduleObligation,
  toggleTask,
} from "@/app/actions";

type Props = {
  o: Obligation;
  isEditor: boolean;
  seesAmounts: boolean;
  today: string;
  showVendor?: boolean;
};

export default function ObligationItem({ o, isEditor, seesAmounts, today, showVendor = true }: Props) {
  const done = !!o.completed_at;
  const pillClass = done ? "done" : o.days < 0 ? "overdue" : o.days <= 7 ? "soon" : "";
  const showMoney = o.kind === "payment" && seesAmounts && o.amount_cents !== null;
  const remaining = (o.amount_cents ?? 0) - o.paid_cents;
  const pct = o.amount_cents ? Math.min(100, Math.round((o.paid_cents / o.amount_cents) * 100)) : 0;

  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 280px" }}>
        <div className="title">{o.title}</div>
        <div className="muted">
          {showVendor && o.vendor_id && o.vendor_name ? (
            <>
              <Link href={`/vendors/${o.vendor_id}`}>{o.vendor_name}</Link> ·{" "}
            </>
          ) : null}
          {o.owed_by} owes · {o.kind === "payment" ? "payment" : "task"}
        </div>
        {o.notes ? <div className="muted">{o.notes}</div> : null}

        {showMoney && (
          <div style={{ marginTop: 6 }}>
            <span>
              {dollars(o.paid_cents)} of {dollars(o.amount_cents)} paid
            </span>
            {remaining > 0 ? <span className="muted"> · {dollars(remaining)} left</span> : null}
            <div className="bar">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {isEditor && (
          <details>
            <summary>Manage</summary>
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {showMoney && !done && (
                <form action={recordPayment} className="fields">
                  <input type="hidden" name="obligation_id" value={o.id} />
                  <div>
                    <label>Amount paid</label>
                    <input type="text" name="amount" inputMode="decimal" placeholder={dollars(remaining)} required />
                  </div>
                  <div>
                    <label>Date</label>
                    <input type="date" name="paid_on" defaultValue={today} />
                  </div>
                  <div>
                    <label>Method</label>
                    <input type="text" name="method" placeholder="check, card, transfer" />
                  </div>
                  <div style={{ alignSelf: "end" }}>
                    <button className="btn small" type="submit">Record payment</button>
                  </div>
                </form>
              )}

              {showMoney && o.payments.length > 0 && (
                <div>
                  <div className="muted">Payments so far</div>
                  {o.payments.map((p) => (
                    <form key={p.id} action={deletePaymentRecord} className="actions" style={{ padding: 0, background: "none" }}>
                      <input type="hidden" name="payment_id" value={p.id} />
                      <span>
                        {dollars(p.amount_cents)} · {fmtDate(p.paid_on)}
                        {p.method ? ` · ${p.method}` : ""}
                      </span>
                      <button className="btn danger small" type="submit">Remove</button>
                    </form>
                  ))}
                </div>
              )}

              {o.kind === "task" && (
                <form action={toggleTask} style={{ padding: 0, background: "none" }}>
                  <input type="hidden" name="obligation_id" value={o.id} />
                  <input type="hidden" name="done" value={done ? "0" : "1"} />
                  <button className="btn ghost small" type="submit">{done ? "Reopen" : "Mark done"}</button>
                </form>
              )}

              <form action={rescheduleObligation} className="actions" style={{ padding: 0, background: "none" }}>
                <input type="hidden" name="obligation_id" value={o.id} />
                <input type="date" name="due_date" defaultValue={o.due_date} required style={{ width: "auto" }} />
                <button className="btn ghost small" type="submit">Change due date</button>
              </form>

              <form action={deleteObligation} style={{ padding: 0, background: "none" }}>
                <input type="hidden" name="obligation_id" value={o.id} />
                <button className="btn danger small" type="submit">Delete</button>
              </form>
            </div>
          </details>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <div>{fmtDate(o.due_date)}</div>
        <span className={`pill ${pillClass}`}>{done ? "done" : relativeDue(o.days)}</span>
      </div>
    </div>
  );
}

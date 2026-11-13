import Link from "next/link";
import { getContext } from "@/lib/context";
import { loadObligations } from "@/lib/data";
import { dollars } from "@/lib/money";
import { fmtDate, todayIn, daysBetween } from "@/lib/dates";
import ObligationItem from "@/components/ObligationItem";

export default async function Dashboard() {
  const c = await getContext();
  const today = todayIn(c.wedding.timezone);

  const [obligations, { data: vendors }, { data: balances }] = await Promise.all([
    loadObligations(c),
    c.supabase.from("vendors").select("id, name, status"),
    c.seesAmounts
      ? c.supabase.from("vendor_balances").select("vendor_id, name, contract_total_cents, paid_cents, remaining_cents")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const activeIds = new Set((vendors ?? []).filter((v) => v.status !== "cancelled").map((v) => v.id));
  const live = (balances ?? []).filter((b) => activeIds.has(b.vendor_id));
  const contracted = live.reduce((s, b) => s + Number(b.contract_total_cents ?? 0), 0);
  const paid = live.reduce((s, b) => s + Number(b.paid_cents ?? 0), 0);

  const open = obligations.filter((o) => !o.completed_at);
  const overdue = open.filter((o) => o.days < 0);
  const upcoming = open.filter((o) => o.days >= 0 && o.days <= 30);

  const daysToWedding = c.wedding.wedding_date ? daysBetween(today, c.wedding.wedding_date) : null;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">
        {c.wedding.wedding_date && daysToWedding !== null && daysToWedding >= 0
          ? `${fmtDate(c.wedding.wedding_date)} · ${daysToWedding} days to go`
          : "Welcome back."}
      </p>

      <div className="grid">
        {c.seesAmounts ? (
          <>
            <div className="card stat"><div className="label">Contracted</div><div className="value">{dollars(contracted)}</div></div>
            <div className="card stat"><div className="label">Paid so far</div><div className="value">{dollars(paid)}</div></div>
            <div className="card stat"><div className="label">Still to pay</div><div className="value">{dollars(contracted - paid)}</div></div>
          </>
        ) : (
          <div className="card stat"><div className="label">Vendors you can see</div><div className="value">{vendors?.length ?? 0}</div></div>
        )}
        <div className="card stat">
          <div className="label">Overdue items</div>
          <div className="value" style={{ color: overdue.length ? "var(--warn)" : undefined }}>{overdue.length}</div>
        </div>
      </div>

      <section className="section card">
        <h2>Needs attention</h2>
        {overdue.length + upcoming.length === 0 ? (
          <p className="muted">Nothing overdue or due in the next 30 days.</p>
        ) : (
          [...overdue, ...upcoming].map((o) => (
            <ObligationItem key={o.id} o={o} isEditor={false} seesAmounts={c.seesAmounts} today={today} />
          ))
        )}
        <p><Link href="/deadlines">All deadlines →</Link></p>
      </section>

      {c.seesAmounts && live.length > 0 && (
        <section className="section card">
          <h2>Vendor balances</h2>
          <table>
            <thead>
              <tr><th>Vendor</th><th className="num">Contract</th><th className="num">Paid</th><th className="num">Left</th></tr>
            </thead>
            <tbody>
              {live.map((b) => (
                <tr key={b.vendor_id}>
                  <td><Link href={`/vendors/${b.vendor_id}`}>{b.name}</Link></td>
                  <td className="num">{dollars(b.contract_total_cents)}</td>
                  <td className="num">{dollars(b.paid_cents)}</td>
                  <td className="num">{dollars(b.remaining_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

import { getContext } from "@/lib/context";
import { loadObligations, loadVendorOptions, loadVisibleMembers } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import ObligationItem from "@/components/ObligationItem";
import ObligationForm from "@/components/ObligationForm";

export default async function DeadlinesPage() {
  const c = await getContext();
  const today = todayIn(c.wedding.timezone);
  const [obligations, vendors, members] = await Promise.all([
    loadObligations(c),
    loadVendorOptions(c),
    loadVisibleMembers(c),
  ]);

  const open = obligations.filter((o) => !o.completed_at);
  const done = obligations.filter((o) => o.completed_at).reverse();

  return (
    <>
      <h1>Deadlines & payments</h1>
      <p className="muted">Whoever owes an item gets an email 7, 3 and 1 days before it's due.</p>

      {c.isEditor && (
        <section className="section card">
          <ObligationForm vendors={vendors} members={members} seesAmounts={c.seesAmounts} />
        </section>
      )}

      <section className="section card">
        <h2>Open</h2>
        {open.length === 0 ? <p className="muted">Nothing open.</p> : null}
        {open.map((o) => (
          <ObligationItem key={o.id} o={o} isEditor={c.isEditor} seesAmounts={c.seesAmounts} today={today} />
        ))}
      </section>

      {done.length > 0 && (
        <section className="section card">
          <h2>Completed</h2>
          {done.map((o) => (
            <ObligationItem key={o.id} o={o} isEditor={c.isEditor} seesAmounts={c.seesAmounts} today={today} />
          ))}
        </section>
      )}
    </>
  );
}

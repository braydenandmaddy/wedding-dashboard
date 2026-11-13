import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { loadObligations, loadVisibleMembers } from "@/lib/data";
import { dollars } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { deleteVendor, updateVendor } from "@/app/actions";
import VendorFields from "@/components/VendorFields";
import ObligationItem from "@/components/ObligationItem";
import ObligationForm from "@/components/ObligationForm";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getContext();

  const { data: vendor } = await c.supabase.from("vendors").select("*").eq("id", id).maybeSingle();
  if (!vendor) notFound(); // also what people see for vendors they aren't allowed to view

  const [contract, obligations, members] = await Promise.all([
    c.seesAmounts
      ? c.supabase.from("vendor_contracts").select("contract_total_cents, contract_signed_on").eq("vendor_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadObligations(c, { vendorId: id }),
    loadVisibleMembers(c),
  ]);

  const total = Number(contract.data?.contract_total_cents ?? 0);
  const paid = obligations.reduce((s, o) => s + o.paid_cents, 0);
  const today = todayIn(c.wedding.timezone);

  return (
    <>
      <p><Link href="/vendors">← Vendors</Link></p>
      <h1>{vendor.name}</h1>
      <p className="muted">
        {[vendor.category, vendor.status].filter(Boolean).join(" · ")}
      </p>

      {c.seesAmounts && (
        <div className="grid">
          <div className="card stat"><div className="label">Contract</div><div className="value">{dollars(total)}</div></div>
          <div className="card stat"><div className="label">Paid</div><div className="value">{dollars(paid)}</div></div>
          <div className="card stat"><div className="label">Left</div><div className="value">{dollars(total - paid)}</div></div>
        </div>
      )}

      <section className="section card">
        <h2>Deadlines & payments</h2>
        {obligations.length === 0 ? <p className="muted">Nothing scheduled for this vendor yet.</p> : null}
        {obligations.map((o) => (
          <ObligationItem key={o.id} o={o} isEditor={c.isEditor} seesAmounts={c.seesAmounts} today={today} showVendor={false} />
        ))}
        {c.isEditor && (
          <ObligationForm vendors={[]} members={members} seesAmounts={c.seesAmounts} lockedVendorId={id} />
        )}
      </section>

      <section className="section card">
        <h2>Details</h2>
        {c.isEditor ? (
          <form action={updateVendor}>
            <VendorFields
              seesAmounts={c.seesAmounts}
              v={{
                ...vendor,
                contract_total_cents: contract.data ? Number(contract.data.contract_total_cents) : null,
                contract_signed_on: contract.data?.contract_signed_on ?? null,
              }}
            />
            <p><button className="btn" type="submit">Save</button></p>
          </form>
        ) : (
          <div>
            {vendor.contact_name && <div>{vendor.contact_name}</div>}
            {vendor.contact_email && <div><a href={`mailto:${vendor.contact_email}`}>{vendor.contact_email}</a></div>}
            {vendor.contact_phone && <div>{vendor.contact_phone}</div>}
            {vendor.notes && <p className="muted">{vendor.notes}</p>}
          </div>
        )}
      </section>

      {c.isOwner && (
        <form action={deleteVendor}>
          <input type="hidden" name="vendor_id" value={id} />
          <button className="btn danger small" type="submit">Delete this vendor</button>
        </form>
      )}
    </>
  );
}

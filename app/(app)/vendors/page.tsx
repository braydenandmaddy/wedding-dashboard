import Link from "next/link";
import { getContext } from "@/lib/context";
import { dollars } from "@/lib/money";
import { addVendor } from "@/app/actions";
import VendorFields from "@/components/VendorFields";

export default async function VendorsPage() {
  const c = await getContext();
  const [{ data: vendors }, { data: balances }] = await Promise.all([
    c.supabase.from("vendors").select("id, name, category, status").order("name"),
    c.seesAmounts
      ? c.supabase.from("vendor_balances").select("vendor_id, contract_total_cents, paid_cents, remaining_cents")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const bal = new Map((balances ?? []).map((b) => [b.vendor_id, b]));

  return (
    <>
      <h1>Vendors</h1>

      {c.isEditor && (
        <section className="section card">
          <details>
            <summary>+ Add a vendor</summary>
            <form action={addVendor}>
              <VendorFields seesAmounts={c.seesAmounts} />
              <p><button className="btn" type="submit">Add vendor</button></p>
            </form>
          </details>
        </section>
      )}

      <section className="card">
        {(vendors ?? []).length === 0 ? (
          <p className="muted">No vendors yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Status</th>
                {c.seesAmounts && (<><th className="num">Contract</th><th className="num">Paid</th><th className="num">Left</th></>)}
              </tr>
            </thead>
            <tbody>
              {(vendors ?? []).map((v) => {
                const b = bal.get(v.id);
                return (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/vendors/${v.id}`}>{v.name}</Link>
                      {v.category ? <div className="muted">{v.category}</div> : null}
                    </td>
                    <td><span className="pill">{v.status}</span></td>
                    {c.seesAmounts && (
                      <>
                        <td className="num">{dollars(b?.contract_total_cents)}</td>
                        <td className="num">{dollars(b?.paid_cents)}</td>
                        <td className="num">{dollars(b?.remaining_cents)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

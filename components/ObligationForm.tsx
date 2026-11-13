import { addObligation } from "@/app/actions";

type Props = {
  vendors: { id: string; name: string }[];
  members: { id: string; label: string }[];
  seesAmounts: boolean;
  lockedVendorId?: string;
};

export default function ObligationForm({ vendors, members, seesAmounts, lockedVendorId }: Props) {
  return (
    <details>
      <summary>+ Add a deadline or payment</summary>
      <form action={addObligation}>
        <div className="fields">
          <div>
            <label>What is it?</label>
            <select name="kind" defaultValue="task">
              <option value="task">Deadline / task</option>
              {seesAmounts && <option value="payment">Payment</option>}
            </select>
          </div>
          <div>
            <label>Title</label>
            <input type="text" name="title" placeholder="Florist deposit" required />
          </div>
          <div>
            <label>Due date</label>
            <input type="date" name="due_date" required />
          </div>
          {seesAmounts && (
            <div>
              <label>Amount (payments only)</label>
              <input type="text" name="amount" inputMode="decimal" placeholder="1,500.00" />
            </div>
          )}
          {lockedVendorId ? (
            <input type="hidden" name="vendor_id" value={lockedVendorId} />
          ) : (
            <div>
              <label>Vendor (optional)</label>
              <select name="vendor_id" defaultValue="">
                <option value="">None, general deadline</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>Who owes it?</label>
            <select name="owed_by_member" defaultValue="">
              <option value="">Someone outside the app (enter below)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Their name (if outside the app)</label>
            <input type="text" name="owed_by_name" />
          </div>
          <div>
            <label>Their email (if outside the app)</label>
            <input type="email" name="owed_by_email" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Notes</label>
          <textarea name="notes" />
        </div>
        <p>
          <button className="btn" type="submit">Add</button>
        </p>
      </form>
    </details>
  );
}

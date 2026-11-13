type Vendor = {
  id?: string;
  name?: string;
  category?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status?: string;
  notes?: string | null;
  contract_total_cents?: number | null;
  contract_signed_on?: string | null;
};

export default function VendorFields({ v = {}, seesAmounts }: { v?: Vendor; seesAmounts: boolean }) {
  const total = v.contract_total_cents != null ? (v.contract_total_cents / 100).toFixed(2) : "";
  return (
    <>
      {v.id ? <input type="hidden" name="vendor_id" value={v.id} /> : null}
      <div className="fields">
        <div>
          <label>Vendor name</label>
          <input type="text" name="name" defaultValue={v.name ?? ""} required />
        </div>
        <div>
          <label>Category</label>
          <input type="text" name="category" defaultValue={v.category ?? ""} placeholder="Venue, photographer, florist…" />
        </div>
        <div>
          <label>Status</label>
          <select name="status" defaultValue={v.status ?? "considering"}>
            <option value="considering">Considering</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label>Contact name</label>
          <input type="text" name="contact_name" defaultValue={v.contact_name ?? ""} />
        </div>
        <div>
          <label>Contact email</label>
          <input type="email" name="contact_email" defaultValue={v.contact_email ?? ""} />
        </div>
        <div>
          <label>Contact phone</label>
          <input type="text" name="contact_phone" defaultValue={v.contact_phone ?? ""} />
        </div>
        {seesAmounts && (
          <>
            <div>
              <label>Contract total ($)</label>
              <input type="text" name="contract_total" inputMode="decimal" defaultValue={total} placeholder="0.00" />
            </div>
            <div>
              <label>Contract signed</label>
              <input type="date" name="signed_on" defaultValue={v.contract_signed_on ?? ""} />
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Notes</label>
        <textarea name="notes" defaultValue={v.notes ?? ""} />
      </div>
    </>
  );
}

type Props = {
  vendors: { id: string; name: string }[];
  defaults?: {
    role?: string;
    display_name?: string | null;
    can_see_amounts?: boolean;
    can_see_deadlines?: boolean;
    vendor_scope?: string;
    receive_all_reminders?: boolean;
    vendorIds?: string[];
  };
  lockRole?: boolean;
};

export default function MemberFields({ vendors, defaults = {}, lockRole = false }: Props) {
  const picked = new Set(defaults.vendorIds ?? []);
  return (
    <>
      <div className="fields">
        <div>
          <label>Name (optional)</label>
          <input type="text" name="display_name" defaultValue={defaults.display_name ?? ""} />
        </div>
        <div>
          <label>Role</label>
          <select name="role" defaultValue={defaults.role ?? "viewer"} disabled={lockRole}>
            <option value="viewer">Viewer: can look, can't change</option>
            <option value="editor">Editor: can add and change things</option>
            <option value="owner">Owner: full control, manages people</option>
          </select>
          {lockRole ? <input type="hidden" name="role" value="owner" /> : null}
        </div>
        <div>
          <label>Vendors they can see</label>
          <select name="vendor_scope" defaultValue={defaults.vendor_scope ?? "selected"}>
            <option value="selected">Only the ones ticked below</option>
            <option value="all">All vendors</option>
          </select>
        </div>
      </div>

      <div className="checks">
        <label className="check">
          <input type="checkbox" name="can_see_amounts" defaultChecked={defaults.can_see_amounts ?? false} />
          Can see dollar amounts
        </label>
        <label className="check">
          <input type="checkbox" name="can_see_deadlines" defaultChecked={defaults.can_see_deadlines ?? true} />
          Can see general deadlines (not tied to a vendor)
        </label>
        <label className="check">
          <input type="checkbox" name="receive_all_reminders" defaultChecked={defaults.receive_all_reminders ?? false} />
          Copy on every reminder email
        </label>
      </div>

      {vendors.length > 0 && (
        <>
          <label>Vendors (used when "only the ones ticked" is selected)</label>
          <div className="checks">
            {vendors.map((v) => (
              <label className="check" key={v.id}>
                <input type="checkbox" name="vendor_ids" value={v.id} defaultChecked={picked.has(v.id)} />
                {v.name}
              </label>
            ))}
          </div>
        </>
      )}
    </>
  );
}

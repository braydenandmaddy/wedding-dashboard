import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { loadVendorOptions } from "@/lib/data";
import { inviteMember, resendInvite, revokeMember, updateMember } from "@/app/actions";
import MemberFields from "@/components/MemberFields";

export default async function PeoplePage() {
  const c = await getContext();
  if (!c.isOwner) redirect("/");

  const [{ data: members }, { data: access }, vendors] = await Promise.all([
    c.supabase.from("members").select("*").order("invited_at"),
    c.supabase.from("member_vendor_access").select("member_id, vendor_id"),
    loadVendorOptions(c),
  ]);

  const byMember = new Map<string, string[]>();
  (access ?? []).forEach((a) => byMember.set(a.member_id, [...(byMember.get(a.member_id) ?? []), a.vendor_id]));

  return (
    <>
      <h1>People</h1>
      <p className="muted">Invite someone by email. They get a sign-in link, and see only what you allow here.</p>

      <section className="section card">
        <h2>Invite someone</h2>
        <form action={inviteMember}>
          <div className="fields" style={{ marginBottom: 12 }}>
            <div>
              <label>Email</label>
              <input type="email" name="email" required />
            </div>
          </div>
          <MemberFields vendors={vendors} />
          <p><button className="btn" type="submit">Send invite</button></p>
        </form>
      </section>

      <section className="section card">
        <h2>Who has access</h2>
        {(members ?? []).map((m) => {
          const isMe = m.id === c.member.id;
          return (
            <div className="row" key={m.id} style={{ alignItems: "flex-start", opacity: m.status === "revoked" ? 0.5 : 1 }}>
              <div style={{ flex: "1 1 320px" }}>
                <div className="title">{m.display_name || m.email}{isMe ? " (you)" : ""}</div>
                <div className="muted">
                  {m.email} · {m.role} · <span className={`pill ${m.status === "active" ? "" : "soon"}`}>{m.status}</span>
                </div>
                {m.status !== "revoked" && (
                  <details>
                    <summary>Edit access</summary>
                    <form action={updateMember}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <MemberFields
                        vendors={vendors}
                        lockRole={isMe}
                        defaults={{ ...m, vendorIds: byMember.get(m.id) ?? [] }}
                      />
                      <p><button className="btn small" type="submit">Save</button></p>
                    </form>
                  </details>
                )}
              </div>
              {!isMe && m.status !== "revoked" && (
                <div className="actions">
                  <form action={resendInvite}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button className="btn ghost small" type="submit">Send new link</button>
                  </form>
                  <form action={revokeMember}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button className="btn danger small" type="submit">Remove</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}

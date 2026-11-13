import { signOut } from "@/app/actions";

export default function NoAccessPage() {
  return (
    <div className="login card">
      <h1>No access</h1>
      <p className="muted">
        You're signed in, but this email hasn't been invited to the wedding dashboard (or your access was removed).
        Ask the owner to invite you, then sign in again.
      </p>
      <form action={signOut}>
        <button className="btn ghost" type="submit">Sign out</button>
      </form>
    </div>
  );
}

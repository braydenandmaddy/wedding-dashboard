import { requestLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  return (
    <div className="login card">
      <h1>Wedding planning</h1>
      <p className="muted">Enter your email and we'll send you a sign-in link. No password needed.</p>

      {sent && (
        <div className="notice">If that email has access, a sign-in link is on its way. Check your inbox.</div>
      )}
      {error === "email" && <div className="notice error">That doesn't look like an email address.</div>}
      {error === "send" && <div className="notice error">We couldn't send the email. Please try again in a moment.</div>}
      {error === "link" && <div className="notice error">That link has expired or was already used. Request a new one.</div>}

      <form action={requestLink}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" autoFocus />
        <p>
          <button className="btn" type="submit">Email me a link</button>
        </p>
      </form>
    </div>
  );
}

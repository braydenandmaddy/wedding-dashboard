"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card">
      <h2>That didn't work</h2>
      <p className="muted">{error.message || "Something went wrong."}</p>
      <button className="btn" onClick={() => reset()}>Try again</button>
    </div>
  );
}

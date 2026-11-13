import Link from "next/link";
import { getContext } from "@/lib/context";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const c = await getContext();
  return (
    <div className="wrap">
      <nav className="nav">
        <Link href="/" className="brand">{c.wedding.name}</Link>
        <Link href="/">Dashboard</Link>
        <Link href="/vendors">Vendors</Link>
        <Link href="/deadlines">Deadlines</Link>
        {c.isOwner && <Link href="/people">People</Link>}
        <form action={signOut} className="inline">
          <button type="submit">Sign out</button>
        </form>
      </nav>
      {children}
    </div>
  );
}

import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { logout } from "@/app/login/actions";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <span className="font-semibold text-stone-900">Aangan Leads</span>
          <Link href="/" className="text-stone-700 hover:text-stone-900">Today</Link>
          <Link href="/calls" className="text-stone-700 hover:text-stone-900">Calls</Link>
          {session.role === "owner" && (
            <Link href="/metrics" className="text-stone-700 hover:text-stone-900">Metrics</Link>
          )}
          <span className="ml-auto text-stone-500">{session.name}</span>
          <form action={logout}>
            <button className="text-stone-500 underline hover:text-stone-900">Sign out</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

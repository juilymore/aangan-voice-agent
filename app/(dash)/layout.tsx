import Link from "next/link";
import { TEAM } from "@/config/team";
import { currentPersona } from "@/lib/persona";
import { NavLink } from "@/components/nav-link";
import { PersonaSwitcher } from "./persona-switcher";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const persona = await currentPersona();
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="ambient" aria-hidden="true">
        <span className="blob-sand" />
        <span className="blob-terracotta" />
        <span className="blob-sage" />
      </div>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-white/60 bg-ivory/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex flex-col leading-none" aria-label="Aangan Studio leads, home">
            <span className="display text-xl tracking-[0.42em] text-ink transition-[letter-spacing] duration-300 group-hover:tracking-[0.48em]">
              Aangan
            </span>
            <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.36em] text-mute">Studio · Leads</span>
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full items-center gap-6 sm:order-none sm:w-auto">
            <NavLink href="/">Today</NavLink>
            <NavLink href="/calls">Calls</NavLink>
            {persona.role === "owner" && <NavLink href="/metrics">Metrics</NavLink>}
          </nav>
          <div className="ml-auto">
            <PersonaSwitcher team={TEAM} current={persona.key} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6">
        <p className="eyebrow !text-[0.58rem]">Aangan Studio · Interior design · Pune · Times in IST</p>
      </footer>
    </div>
  );
}

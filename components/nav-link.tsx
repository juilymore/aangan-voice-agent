"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header link with an animated underline; marks itself aria-current on its section. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`nav-link text-[11px] font-medium uppercase tracking-[0.22em] transition-colors duration-200 ${
        active ? "text-ink" : "text-mute hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

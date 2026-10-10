import Link from "next/link";

/** "My leads / All calls" segmented toggle for designers. Pure links, keeps other query params. */
export function ScopeToggle({
  showAll,
  basePath,
  params = {},
}: {
  showAll: boolean;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (all: boolean) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "scope" && k !== "page") sp.set(k, v);
    if (all) sp.set("scope", "all");
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const item = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition-all duration-200 ${
      active ? "bg-ink text-white shadow-sm" : "text-mute hover:text-ink"
    }`;
  return (
    <nav aria-label="Whose calls" className="glass inline-flex rounded-full p-1">
      <Link href={href(false)} className={item(!showAll)} aria-current={!showAll ? "page" : undefined}>
        My leads
      </Link>
      <Link href={href(true)} className={item(showAll)} aria-current={showAll ? "page" : undefined}>
        All calls
      </Link>
    </nav>
  );
}

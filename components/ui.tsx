import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export function GlassCard({
  children,
  className = "",
  as: Tag = "section",
  lift = false,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  lift?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`glass rounded-2xl ${lift ? "lift" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** Section heading in the studio style: small eyebrow + thin wide uppercase title. */
export function SectionTitle({
  eyebrow,
  title,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 id={id} className="display text-base text-ink sm:text-lg">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function IconTile({ icon: Icon, tone = "ink" }: { icon: IconType; tone?: "ink" | "clay" | "sage" }) {
  const bg = tone === "clay" ? "bg-terracotta" : tone === "sage" ? "bg-sage" : "bg-ink";
  return (
    <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-md ${bg} text-white`}>
      <Icon size={18} />
    </span>
  );
}

/** Evolved-style stat tile: navy icon square + big number + small label. */
export function StatTile({
  icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: IconType;
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "ink" | "clay" | "sage";
}) {
  return (
    <div className="glass lift flex items-center gap-4 rounded-2xl px-4 py-4">
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <div className="font-[family-name:var(--font-jost)] text-2xl font-light tabular-nums text-ink">{value}</div>
        <div className="eyebrow mt-0.5 !text-[0.62rem]">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-mute">{hint}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: IconType;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full border border-sand bg-white/60 text-mute">
        <Icon size={22} />
      </span>
      <p className="display text-sm text-ink">{title}</p>
      {children && <p className="mt-2 max-w-sm text-sm text-mute">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary", size: "sm" | "md" = "md") {
  const sz = size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2 text-xs";
  const v =
    variant === "primary"
      ? "bg-ink text-white hover:bg-ink-soft shadow-sm"
      : variant === "danger"
        ? "border border-alert/30 bg-white/60 text-alert hover:bg-alert-soft"
        : "border border-ink/15 bg-white/60 text-ink hover:bg-white";
  return `inline-flex items-center justify-center gap-1.5 rounded-md font-medium uppercase tracking-[0.14em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${v}`;
}

export const inputClass =
  "w-full rounded-md border border-ink/12 bg-white/70 px-3 py-2 text-sm text-ink placeholder:text-mute/70 shadow-[inset_0_1px_0_rgba(17,24,39,0.03)] focus:border-ink/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";

export function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="eyebrow mb-1.5 block !text-[0.6rem]">{label}</span>
      {children}
    </label>
  );
}

import Link from "next/link";
import { useId, type ComponentType, type SVGProps } from "react";
import { InfoIcon } from "./icons";

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
  href,
  info,
}: {
  icon: IconType;
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "ink" | "clay" | "sage";
  /** Makes the whole tile a link (e.g. to the matching filtered Calls view). */
  href?: string;
  /** Longer explanation in an accessible tooltip. */
  info?: string;
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <div className="font-[family-name:var(--font-jost)] text-2xl font-light tabular-nums text-ink">{value}</div>
        <div className="eyebrow mt-0.5 !text-[0.62rem]">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-mute">{hint}</div>}
      </div>
    </>
  );
  if (!href && !info)
    return (
      <div className="glass lift flex flex-col items-start gap-3 rounded-2xl px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        {body}
      </div>
    );
  return (
    <div className="glass lift relative rounded-2xl">
      {href ? (
        <Link
          href={href}
          className="flex h-full flex-col items-start gap-3 rounded-2xl px-4 py-4 pr-8 sm:flex-row sm:items-center sm:gap-4"
        >
          {body}
        </Link>
      ) : (
        <div className="flex h-full flex-col items-start gap-3 px-4 py-4 pr-8 sm:flex-row sm:items-center sm:gap-4">{body}</div>
      )}
      {info && (
        <span className="absolute right-2 top-2">
          <InfoTip label={`About ${label}`}>{info}</InfoTip>
        </span>
      )}
    </div>
  );
}

/** A small (i) button that shows a tooltip on hover and keyboard focus. CSS only. */
export function InfoTip({
  label,
  children,
  align = "right",
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex size-6 items-center justify-center rounded-full text-mute transition-colors hover:bg-white/80 hover:text-ink"
      >
        <InfoIcon size={14} />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-7 z-40 w-60 rounded-lg bg-ink px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-200 group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </span>
    </span>
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

"use client";
import { useEffect, useRef } from "react";

type Format = "int" | "inr" | "pct" | "dec1";

function render(n: number, format: Format): string {
  switch (format) {
    case "inr":
      return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
    case "pct":
      return `${Math.round(n * 100)}%`;
    case "dec1":
      return n.toFixed(1);
    default:
      return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));
  }
}

/**
 * A number that counts up from zero once on mount. The server renders the final value (works without JS);
 * the effect only rewrites the text, so there is no state and no layout shift. Off under reduced motion.
 */
export function CountUp({ value, format = "int", duration = 700 }: { value: number; format?: Format; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value) || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = render(value * eased, format);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = render(value, format);
    };
  }, [value, format, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {render(value, format)}
    </span>
  );
}

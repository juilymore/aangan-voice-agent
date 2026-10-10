/** Shimmer placeholders for loading.tsx files. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PageSkeleton({ tiles = 4, blocks = 2 }: { tiles?: number; blocks?: number }) {
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3 pt-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {tiles > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <Skeleton key={i} className="h-[74px] !rounded-2xl" />
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        {Array.from({ length: blocks }, (_, i) => (
          <div key={i} className={`glass space-y-3 rounded-2xl p-6 ${i === 0 ? "lg:col-span-3" : "lg:col-span-2"}`}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-5/6" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

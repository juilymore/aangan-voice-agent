import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading calls">
      <div className="space-y-3 pt-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-36 w-full !rounded-2xl" />
      <div className="glass space-y-3 rounded-2xl p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

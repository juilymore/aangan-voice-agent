import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading call">
      <Skeleton className="h-3 w-24" />
      <div className="glass space-y-4 rounded-2xl p-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="glass space-y-3 rounded-2xl p-6 lg:col-span-7">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="glass space-y-3 rounded-2xl p-6 lg:col-span-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

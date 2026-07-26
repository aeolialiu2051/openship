export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-7 space-y-2">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl border border-border/50 bg-card" />
          <div className="h-72 animate-pulse rounded-2xl border border-border/50 bg-card" />
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-border/50 bg-card" />
      </div>
    </div>
  );
}

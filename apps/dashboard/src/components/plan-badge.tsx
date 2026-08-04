import { Crown } from "lucide-react";

export function PlanBadge({
  planTierId,
  compact = false,
}: {
  planTierId: "free" | "pro" | string;
  compact?: boolean;
}) {
  const isFree = planTierId === "free";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold ${
        compact ? "gap-1 px-1.5 py-0.5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-xs"
      } ${
        isFree ? "bg-foreground/[0.06] text-muted-foreground" : "bg-primary/10 text-primary"
      }`}
    >
      {!isFree && <Crown className={compact ? "size-3" : "size-3.5"} />}
      {isFree ? "FREE" : "PRO"}
    </span>
  );
}

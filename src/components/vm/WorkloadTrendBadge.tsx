import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, CircleHelp } from "lucide-react";
import type { VmWorkloadTrend } from "@/domain/models/types";
import { Badge } from "@/components/ui/badge";
import { VM_WORKLOAD_TREND_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { cn } from "@/lib/utils";

export function WorkloadTrendBadge({ trend, compact = false }: { trend: VmWorkloadTrend; compact?: boolean }) {
  const Icon = trend.direction === "strongly-rising" ? AlertTriangle
    : trend.direction === "rising" ? ArrowUpRight
      : trend.direction === "falling" ? ArrowDownRight
        : trend.direction === "stable" ? Minus
          : CircleHelp;
  const detail = trend.relativeChangePct === null ? "" : ` (${trend.relativeChangePct > 0 ? "+" : ""}${trend.relativeChangePct.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %)`;
  return <Badge
    variant="outline"
    title={`${VM_WORKLOAD_TREND_LABEL[trend.direction]}${detail}; R² ${trend.rSquared?.toLocaleString("de-DE", { maximumFractionDigits: 2 }) ?? "—"}`}
    className={cn(
      "gap-1 whitespace-nowrap",
      trend.direction === "strongly-rising" && "border-destructive/45 bg-destructive/12 text-destructive",
      trend.direction === "rising" && "border-warning/45 bg-warning/12 text-warning",
      trend.direction === "stable" && "border-success/35 bg-success/10 text-success",
      trend.direction === "falling" && "border-info/35 bg-info/10 text-info",
      trend.direction === "not-computable" && "text-muted-foreground",
    )}
  ><Icon className="size-3" />{compact ? VM_WORKLOAD_TREND_LABEL[trend.direction].replace("Nicht berechenbar", "—") : VM_WORKLOAD_TREND_LABEL[trend.direction]}</Badge>;
}

import { Badge } from "@/components/ui/badge";
import type { VmWorkloadIntensity, VmWorkloadShape } from "@/domain/models/types";
import { VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { cn } from "@/lib/utils";
import { VM_WORKLOAD_SHAPE_CHART_COLOR } from "@/lib/workloadShapeColors";

export function WorkloadShapeBadge({ shape }: { shape: VmWorkloadShape }) {
  return (
    <Badge
      variant="outline"
      className="border-current bg-current/10"
      style={{ color: VM_WORKLOAD_SHAPE_CHART_COLOR[shape] }}
    >
      {VM_WORKLOAD_SHAPE_LABEL[shape]}
    </Badge>
  );
}

/** Gering nach hoch: grün über gelb nach rot, damit die Auslastung auf einen Blick erkennbar ist. */
const INTENSITY_BADGE_CLASS: Record<VmWorkloadIntensity, string> = {
  idle: "border-success/40 text-success",
  "very-low": "border-success/40 text-success",
  low: "border-success/40 text-success",
  moderate: "border-warning/40 text-warning",
  elevated: "border-warning/40 text-warning",
  high: "border-destructive/40 text-destructive",
  unknown: "border-border text-muted-foreground",
};

/** Dieselbe Farbzuordnung im VM-Profile und im Rightsizing – ein Niveau, eine Farbe. */
export function WorkloadIntensityBadge({ intensity }: { intensity: VmWorkloadIntensity }) {
  return (
    <Badge variant="outline" className={INTENSITY_BADGE_CLASS[intensity]}>
      {VM_WORKLOAD_INTENSITY_LABEL[intensity]}
    </Badge>
  );
}

/** Oberhalb dieses Werts ist die konfigurierte CPU-Kapazität beim P95 vollständig ausgeschöpft. */
const UTILIZATION_CRITICAL_PCT = 100;
/** Ab hier bleibt kein nennenswerter Kopfraum für Lastspitzen. */
const UTILIZATION_WARN_PCT = 90;
const UTILIZATION_TOO_LOW_CRITICAL_PCT = 2.5;
const UTILIZATION_TOO_LOW_WARN_PCT = 5;

/**
 * CPU Demand P95 in Prozent der konfigurierten Kapazität. Zu wenig Auslastung ist
 * ebenso auffällig wie Kapazitätsnähe: bis 2,5 % rot, bis 5 % gelb, ab 90 % gelb
 * und über 100 % rot.
 */
export function UtilizationPercentCell({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "tabular-nums",
        (value <= UTILIZATION_TOO_LOW_CRITICAL_PCT || value > UTILIZATION_CRITICAL_PCT) && "font-semibold text-destructive",
        ((value > UTILIZATION_TOO_LOW_CRITICAL_PCT && value <= UTILIZATION_TOO_LOW_WARN_PCT)
          || (value > UTILIZATION_WARN_PCT && value <= UTILIZATION_CRITICAL_PCT)) && "font-semibold text-warning",
      )}
    >
      {value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
    </span>
  );
}

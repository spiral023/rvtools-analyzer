import type { VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { formatFillUpValue } from "@/lib/fillUpUnits";

/** P95 trägt die Zeile, Ø und Max stehen klein darunter – gleiches Muster wie die Fill-Up-Beobachtungstabelle. */
export function DemandCell({ demand }: { demand: VmWorkloadProfileMetricStats }) {
  if (demand.p95 === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="font-mono text-xs tabular-nums">
      <p className="text-sm font-medium">{formatFillUpValue(demand.p95, "MHz")}</p>
      <p className="text-muted-foreground">Ø {formatFillUpValue(demand.average, "MHz")} · Max {formatFillUpValue(demand.maximum, "MHz")}</p>
    </div>
  );
}

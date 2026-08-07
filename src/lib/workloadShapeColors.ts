import type { VmWorkloadShape } from "@/domain/models/types";
import { CHART_COLORS } from "@/lib/chartStyles";

/** Feste, semantische Zuordnung: dasselbe Lastmuster trägt überall dieselbe Farbe. */
export const VM_WORKLOAD_SHAPE_CHART_COLOR: Record<VmWorkloadShape, string> = {
  constant: CHART_COLORS.primary,
  "business-hours": CHART_COLORS.info,
  "night-batch": CHART_COLORS.purple,
  weekend: CHART_COLORS.success,
  bursty: CHART_COLORS.danger,
  variable: CHART_COLORS.warning,
  irregular: CHART_COLORS.pink,
  unclassified: CHART_COLORS.secondary,
};

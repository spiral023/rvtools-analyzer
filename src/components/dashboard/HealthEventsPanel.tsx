import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useActiveSnapshotIds, useHealthEvents } from "@/hooks/useActiveSnapshots";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { DAILY_OPS_COLUMNS, DAILY_OPS_SECTIONS } from "@/lib/glossaries/dailyOps";
import type { NormalizedHealth } from "@/domain/models/types";

const healthColumns: ColumnDef<NormalizedHealth, unknown>[] = [
  { accessorKey: "entity", header: "Entity", meta: { info: DAILY_OPS_COLUMNS.entity } },
  { accessorKey: "messageType", header: "Typ", meta: { info: DAILY_OPS_COLUMNS.messageType } },
  { accessorKey: "message", header: "Meldung", meta: { info: DAILY_OPS_COLUMNS.message } },
];

export function HealthEventsPanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: healthEvents = [], isLoading } = useHealthEvents();
  const healthByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of healthEvents) {
      const type = event.messageType || "Unknown";
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
  }, [healthEvents]);

  if (isLoading) return <PanelLoadingState />;

  return (
    <section className="space-y-4">
      <div className="space-y-4">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={DAILY_OPS_SECTIONS.healthByType} side="bottom">
            <h3 className="mb-3 flex w-fit cursor-help items-center gap-2 text-sm font-semibold text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> Health Events nach Typ
            </h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={healthByType} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} interval={0} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <InfoTooltip entry={DAILY_OPS_SECTIONS.healthTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Health-Events ({healthEvents.length})</h3>
          </InfoTooltip>
          <VirtualTable data={healthEvents} columns={healthColumns} globalFilter={filters.search} height={320} />
        </div>
      </div>
    </section>
  );
}

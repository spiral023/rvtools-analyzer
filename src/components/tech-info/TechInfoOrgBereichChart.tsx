import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { CHART_AXIS_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TECHINFO_ORG_SECTIONS } from "@/lib/glossaries/techInfo";
import { formatRamGiB, type TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";

type ChartMetric = "vmCount" | "vCpu" | "ram";

const METRIC_LABEL: Record<ChartMetric, string> = { vmCount: "Server-VMs", vCpu: "vCPU", ram: "RAM (GiB)" };

export function TechInfoOrgBereichChart({
  bereichNodes,
  selectedBereichId,
  onSelectBereich,
}: {
  bereichNodes: readonly TechInfoOrgTreeNode[];
  selectedBereichId: string | null;
  onSelectBereich: (node: TechInfoOrgTreeNode) => void;
}) {
  const [metric, setMetric] = useState<ChartMetric>("vmCount");

  const data = useMemo(
    () =>
      bereichNodes
        .map((bereich) => ({
          id: bereich.id,
          name: bereich.label,
          vmCount: bereich.aggregate.vmCount,
          vCpu: bereich.aggregate.vCpuSum,
          ram: Math.round((bereich.aggregate.memoryMiBSum / 1024) * 10) / 10,
        }))
        .sort((a, b) => b[metric] - a[metric]),
    [bereichNodes, metric],
  );

  if (data.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <InfoTooltip entry={TECHINFO_ORG_SECTIONS.chart} side="bottom">
          <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Ressourcen je Bereich</h3>
        </InfoTooltip>
        <ToggleGroup type="single" size="sm" value={metric} onValueChange={(value) => value && setMetric(value as ChartMetric)}>
          <ToggleGroupItem value="vmCount" aria-label="Nach VM-Anzahl">VMs</ToggleGroupItem>
          <ToggleGroupItem value="vCpu" aria-label="Nach vCPU">vCPU</ToggleGroupItem>
          <ToggleGroupItem value="ram" aria-label="Nach RAM">RAM</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div style={{ height: Math.max(140, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={CHART_AXIS_STYLE} tickFormatter={(value: number) => (metric === "ram" ? `${value} GiB` : formatIntTick(value))} />
            <YAxis type="category" dataKey="name" width={128} tick={CHART_AXIS_STYLE} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={(value: number) => [metric === "ram" ? formatRamGiB(value * 1024) : value.toLocaleString("de-DE"), METRIC_LABEL[metric]]}
            />
            <Bar
              dataKey={metric}
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry: { payload: { id: string } }) => {
                const node = bereichNodes.find((bereich) => bereich.id === entry.payload.id);
                if (node) onSelectBereich(node);
              }}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.id}
                  fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]}
                  opacity={selectedBereichId && selectedBereichId !== entry.id ? 0.45 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatIntTick(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

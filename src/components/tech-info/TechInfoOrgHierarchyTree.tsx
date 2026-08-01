import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TECHINFO_ORG_COLUMNS, TECHINFO_ORG_SECTIONS } from "@/lib/glossaries/techInfo";
import {
  flattenVisibleTechInfoOrgTree,
  formatCpuDemandAverage,
  formatCpuIntensity,
  formatRamGiB,
  formatRightsizingPotential,
  type TechInfoOrgTreeNode,
} from "@/components/tech-info/techInfoOrgTree";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const DEPTH_LABEL = ["Organisation", "Bereich", "Abteilung", "Person"];

export function TechInfoOrgHierarchyTree({
  tree,
  selectedNodeId,
  onSelectNode,
}: {
  tree: readonly TechInfoOrgTreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: TechInfoOrgTreeNode) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const visibleRows = useMemo(() => flattenVisibleTechInfoOrgTree(tree, expandedIds), [tree, expandedIds]);

  if (tree.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Keine auswertbare Bereichs-/Abteilungszuordnung im aktuellen Rollenmodus und Filter-Scope.</p>;
  }

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto bg-card/30">
      <div className="min-w-[62rem]">
      <div className="grid grid-cols-[minmax(12rem,1fr)_4rem_4rem_5.5rem_7rem_6.5rem_7rem] gap-2 border-b border-border bg-muted/20 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.node} side="bottom"><span className="w-fit cursor-help">Bereich / Abteilung / Person</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.vmCount} side="bottom"><span className="w-fit cursor-help text-right">VMs</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.vCpu} side="bottom"><span className="w-fit cursor-help text-right">vCPU</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.ram} side="bottom"><span className="w-fit cursor-help text-right">RAM</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.cpuDemandAverage} side="bottom"><span className="w-fit cursor-help text-right">CPU Demand Ø</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.cpuIntensity} side="bottom"><span className="w-fit cursor-help text-right">CPU-Intensität</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.rightsizingPotential} side="bottom"><span className="w-fit cursor-help text-right">Rightsizing</span></InfoTooltip>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {visibleRows.map((row) => {
          const hasChildren = row.children.length > 0;
          const isExpandable = row.depth > 0 && hasChildren;
          const isExpanded = expandedIds.has(row.id);
          const isSelected = selectedNodeId === row.id;
          return (
            <div
              key={row.id}
              className={cn(
                "relative grid min-h-10 grid-cols-[minmax(12rem,1fr)_4rem_4rem_5.5rem_7rem_6.5rem_7rem] items-center gap-2 border-b border-border/30 px-3 py-2 text-sm transition-colors hover:bg-muted/30",
                isSelected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/15",
              )}
            >
              <button
                type="button"
                aria-label={`${DEPTH_LABEL[row.depth]} ${row.label} auswählen`}
                onClick={() => onSelectNode(row)}
                className="absolute inset-0 z-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className="pointer-events-none relative z-[1] flex min-w-0 items-center gap-1" style={{ paddingLeft: `${row.depth * 1.1}rem` }}>
                {isExpandable ? (
                  <button
                    type="button"
                    aria-label={isExpanded ? "Zuklappen" : "Aufklappen"}
                    onClick={() => toggle(row.id)}
                    className="pointer-events-auto relative z-10 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className={cn("truncate", row.depth === 0 && "font-semibold", row.depth === 1 && "font-medium")} title={row.label}>{row.label}</span>
              </div>
              <span className="pointer-events-none relative z-[1] text-right font-mono tabular-nums">{formatNum(row.aggregate.vmCount)}</span>
              <span className="pointer-events-none relative z-[1] text-right font-mono tabular-nums">{formatNum(row.aggregate.vCpuSum)}</span>
              <span className="pointer-events-none relative z-[1] text-right font-mono tabular-nums">{formatRamGiB(row.aggregate.memoryMiBSum)}</span>
              <span className="pointer-events-none relative z-[1] text-right font-mono text-xs tabular-nums">{formatCpuDemandAverage(row.aggregate)}</span>
              <span className="pointer-events-none relative z-[1] text-right font-mono tabular-nums">{formatCpuIntensity(row.aggregate)}</span>
              <span className="pointer-events-none relative z-[1] text-right font-mono tabular-nums">{formatRightsizingPotential(row.aggregate)}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/50 bg-muted/10 px-3 py-2">
        <InfoTooltip entry={TECHINFO_ORG_SECTIONS.hierarchyTable} side="top">
          <p className="w-fit cursor-help text-xs text-muted-foreground">Zeile auswählen · Chevron zum Auf- und Zuklappen</p>
        </InfoTooltip>
      </div>
      </div>
    </div>
  );
}

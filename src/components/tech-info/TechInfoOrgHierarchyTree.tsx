import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TECHINFO_ORG_COLUMNS, TECHINFO_ORG_SECTIONS } from "@/lib/glossaries/techInfo";
import { flattenVisibleTechInfoOrgTree, formatRamGiB, type TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";
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
    return <p className="text-sm text-muted-foreground">Keine auswertbare Bereichs-/Abteilungszuordnung im aktuellen Rollenmodus und Filter-Scope.</p>;
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
    <div className="rounded-md border border-border/50 bg-card/30">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5rem_6rem] gap-2 border-b border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.node} side="bottom"><span className="w-fit cursor-help">Bereich / Abteilung / Person</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.vmCount} side="bottom"><span className="w-fit cursor-help text-right">VMs</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.poweredOn} side="bottom"><span className="w-fit cursor-help text-right">Ein / Aus</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.vCpu} side="bottom"><span className="w-fit cursor-help text-right">vCPU</span></InfoTooltip>
        <InfoTooltip entry={TECHINFO_ORG_COLUMNS.ram} side="bottom"><span className="w-fit cursor-help text-right">RAM</span></InfoTooltip>
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
              role="button"
              tabIndex={0}
              aria-label={`${DEPTH_LABEL[row.depth]} ${row.label} auswählen`}
              onClick={() => onSelectNode(row)}
              onKeyDown={(e) => { if (e.key === "Enter") onSelectNode(row); }}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5rem_6rem] gap-2 border-b border-border/30 px-3 py-1.5 text-sm transition-colors hover:bg-muted/30 cursor-pointer focus-visible:outline-none focus-visible:bg-muted/40",
                isSelected && "bg-primary/10 hover:bg-primary/15",
              )}
            >
              <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${row.depth * 1.1}rem` }}>
                {isExpandable ? (
                  <button
                    type="button"
                    aria-label={isExpanded ? "Zuklappen" : "Aufklappen"}
                    onClick={(e) => { e.stopPropagation(); toggle(row.id); }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className={cn("truncate", row.depth === 0 && "font-semibold", row.depth === 1 && "font-medium")} title={row.label}>{row.label}</span>
              </div>
              <span className="text-right font-mono tabular-nums">{formatNum(row.aggregate.vmCount)}</span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                <span className="text-success">{formatNum(row.aggregate.poweredOnCount)}</span> / <span>{formatNum(row.aggregate.poweredOffCount)}</span>
              </span>
              <span className="text-right font-mono tabular-nums">{formatNum(row.aggregate.vCpuSum)}</span>
              <span className="text-right font-mono tabular-nums">{formatRamGiB(row.aggregate.memoryMiBSum)}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/50 px-3 py-1.5">
        <InfoTooltip entry={TECHINFO_ORG_SECTIONS.hierarchyTable} side="top">
          <p className="w-fit cursor-help text-xs text-muted-foreground">Klick auf eine Zeile filtert die VM-Liste. Chevron auf-/zuklappen.</p>
        </InfoTooltip>
      </div>
    </div>
  );
}

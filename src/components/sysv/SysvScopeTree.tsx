import { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, ChevronRight, FolderTree, Server, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SysvScopePreference } from "@/domain/models/types";
import {
  isSameSysvScopePreference,
  type SysvScopeDirectory,
  type SysvScopeTreeNode,
} from "@/lib/sysvScope";
import { cn } from "@/lib/utils";

function navigationNodeIds(nodes: readonly SysvScopeTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.kind === "organisation" || node.kind === "bereich" ? [node.id] : []),
    ...navigationNodeIds(node.children),
  ]);
}

function ScopeTreeRow({
  node,
  depth,
  expandedIds,
  selectedScope,
  onToggle,
  onSelect,
}: {
  node: SysvScopeTreeNode;
  depth: number;
  expandedIds: ReadonlySet<string>;
  selectedScope: SysvScopePreference;
  onToggle: (id: string) => void;
  onSelect: (scope: SysvScopePreference) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelectable = Boolean(node.scope);
  const isSelected = node.scope ? isSameSysvScopePreference(selectedScope, node.scope) : false;
  const Icon = node.kind === "organisation"
    ? Building2
    : node.kind === "bereich"
      ? FolderTree
      : node.kind === "department"
        ? Users
        : UserRound;

  return (
    <>
      <div
        className={cn(
          "group flex min-h-10 items-center gap-2 border-b border-border/35 px-2 py-1.5 text-sm",
          isSelectable && "cursor-pointer rounded-md transition-colors hover:bg-muted/60",
          isSelected && "bg-primary/10 text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))]",
        )}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `${node.label} zuklappen` : `${node.label} aufklappen`}
            onClick={() => onToggle(node.id)}
            className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : <span className="size-6 shrink-0" />}
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {isSelectable ? (
          <button
            type="button"
            onClick={() => onSelect(node.scope!)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("min-w-0 flex-1 truncate", node.kind === "department" && "font-medium")}>{node.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{node.vmCount.toLocaleString("de-DE")}</span>
            {isSelected && <Check className="size-4 shrink-0 text-primary" aria-label="Ausgewählt" />}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
            <span className={cn("min-w-0 flex-1 truncate", node.kind === "organisation" && "font-medium text-foreground")}>{node.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">{node.vmCount.toLocaleString("de-DE")}</span>
          </div>
        )}
      </div>
      {hasChildren && isExpanded && node.children.map((child) => (
        <ScopeTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedIds={expandedIds}
          selectedScope={selectedScope}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function SysvScopeTree({
  directory,
  value,
  onChange,
  className,
}: {
  directory: SysvScopeDirectory;
  value: SysvScopePreference;
  onChange: (scope: SysvScopePreference) => void;
  className?: string;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedIds(new Set(navigationNodeIds(directory.tree)));
  }, [directory.tree]);

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/70 bg-card", className)}>
      <Button
        type="button"
        variant={value.kind === "all" ? "default" : "ghost"}
        onClick={() => onChange({ kind: "all" })}
        className="m-2 flex h-auto w-[calc(100%-1rem)] items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2"><Server className="size-4" />Alle Systeme</span>
        {value.kind === "all" && <Check className="size-4" aria-label="Ausgewählt" />}
      </Button>
      <div className="border-t border-border/60 bg-muted/15">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Organisation · Bereich · Abteilung · Person</span>
          <span>Systeme</span>
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {directory.tree.length > 0 ? directory.tree.map((node) => (
            <ScopeTreeRow
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              selectedScope={value}
              onToggle={toggle}
              onSelect={onChange}
            />
          )) : (
            <p className="px-3 py-5 text-sm text-muted-foreground">Keine SysV- oder SysVStv-Zuordnungen in den Tech-Info-Daten gefunden.</p>
          )}
        </div>
      </div>
    </div>
  );
}

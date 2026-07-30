import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TechInfoOrgDataQualityCategory, TechInfoOrgDataQualityIssue } from "@/domain/services/techInfoOrganisationService";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const CATEGORY_LABEL: Record<TechInfoOrgDataQualityCategory, string> = {
  "missing-responsible": "Fehlende Verantwortliche",
  "unparseable-path": "Nicht interpretierbare Abteilungspfade",
  "conflicting-department": "Widersprüchliche Abteilungszuordnung",
};

const CATEGORY_ORDER: TechInfoOrgDataQualityCategory[] = ["missing-responsible", "unparseable-path", "conflicting-department"];

export function TechInfoOrgDataQualityPanel({ issues, onSelectVms }: { issues: readonly TechInfoOrgDataQualityIssue[]; onSelectVms: (label: string, vmNames: string[]) => void }) {
  const [expanded, setExpanded] = useState<Set<TechInfoOrgDataQualityCategory>>(new Set());

  const groups = useMemo(() => {
    const byCategory = new Map<TechInfoOrgDataQualityCategory, TechInfoOrgDataQualityIssue[]>();
    for (const issue of issues) {
      const list = byCategory.get(issue.category) ?? [];
      list.push(issue);
      byCategory.set(issue.category, list);
    }
    return CATEGORY_ORDER.map((category) => {
      const categoryIssues = byCategory.get(category) ?? [];
      const vmNames = [...new Set(categoryIssues.flatMap((issue) => issue.vmNames))];
      return { category, issues: categoryIssues, vmNames };
    }).filter((group) => group.vmNames.length > 0);
  }, [issues]);

  if (groups.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-success/20 bg-success/5 p-3 text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-relaxed">Keine Datenqualitätsauffälligkeiten im aktuellen Rollenmodus und Filter-Scope.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/60 divide-y divide-border/40">
        {groups.map((group) => {
          const isOpen = expanded.has(group.category);
          return (
            <div key={group.category}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group.category)) next.delete(group.category);
                  else next.add(group.category);
                  return next;
                })}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex items-center gap-1.5">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {CATEGORY_LABEL[group.category]}
                </span>
                <Badge variant={group.category === "missing-responsible" ? "destructive" : "secondary"}>{formatNum(group.vmNames.length)} VMs</Badge>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-border/30 bg-muted/10 px-3 py-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectVms(CATEGORY_LABEL[group.category], group.vmNames)}
                  >
                    Alle {group.vmNames.length} VMs in der Liste anzeigen
                  </button>
                  <ul className="space-y-1">
                    {group.issues.map((issue) => (
                      <li key={`${issue.person ?? ""}-${issue.detail}`} className="text-xs text-muted-foreground">
                        {issue.person && <span className="font-medium text-foreground">{issue.person}: </span>}
                        {issue.detail} ({issue.vmNames.length} VM{issue.vmNames.length === 1 ? "" : "s"})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

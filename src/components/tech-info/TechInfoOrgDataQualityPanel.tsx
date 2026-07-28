import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TECHINFO_ORG_SECTIONS } from "@/lib/glossaries/techInfo";
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
    return <p className="text-sm text-success">Keine Datenqualitätsauffälligkeiten im aktuellen Rollenmodus und Filter-Scope.</p>;
  }

  return (
    <div className="space-y-2">
      <InfoTooltip entry={TECHINFO_ORG_SECTIONS.dataQuality} side="bottom">
        <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Datenqualität</h3>
      </InfoTooltip>
      <div className="rounded-md border border-border/50 divide-y divide-border/30">
        {groups.map((group) => {
          const isOpen = expanded.has(group.category);
          return (
            <div key={group.category}>
              <button
                type="button"
                onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group.category)) next.delete(group.category);
                  else next.add(group.category);
                  return next;
                })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/30"
              >
                <span className="flex items-center gap-1.5">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {CATEGORY_LABEL[group.category]}
                </span>
                <Badge variant={group.category === "missing-responsible" ? "destructive" : "secondary"}>{formatNum(group.vmNames.length)} VMs</Badge>
              </button>
              {isOpen && (
                <div className="space-y-1 px-3 pb-2">
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
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
    </div>
  );
}

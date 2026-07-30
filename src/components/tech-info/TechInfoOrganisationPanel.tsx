import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, Building2, Boxes, ListTree, Network, UserRoundCog, Users, UserX } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TECHINFO_ORG_KPI, TECHINFO_ORG_SECTIONS } from "@/lib/glossaries/techInfo";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import {
  buildTechInfoOrganisation,
  type TechInfoOrgRoleMode,
  type TechInfoOrgVmSource,
} from "@/domain/services/techInfoOrganisationService";
import { buildTechInfoOrgTree, formatRamGiB, type TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";
import { TechInfoOrgHierarchyTree } from "@/components/tech-info/TechInfoOrgHierarchyTree";
import { TechInfoOrgBereichChart } from "@/components/tech-info/TechInfoOrgBereichChart";
import type { NormalizedVm } from "@/domain/models/types";

const ROLE_LABEL: Record<TechInfoOrgRoleMode, string> = { primary: "Primär (SysV)", deputy: "Stellvertretung (SysVStv)", both: "Beide Rollen" };
const ROLE_DESCRIPTION: Record<TechInfoOrgRoleMode, string> = {
  primary: "Verantwortung nach Systemverantwortlichen",
  deputy: "Vertretungsstruktur nach SysVStv",
  both: "Primär- und Stellvertretungsrollen gemeinsam",
};

function pseudonymizeRows(rows: TechInfoOrgVmSource[]): TechInfoOrgVmSource[] {
  const personMap = new Map<string, string>();
  const vmMap = new Map<string, string>();
  const person = (name: string | null): string | null => {
    if (!name?.trim()) return name;
    const key = name.trim().toLocaleLowerCase("de-DE");
    let value = personMap.get(key);
    if (!value) {
      value = `Person ${String(personMap.size + 1).padStart(2, "0")}`;
      personMap.set(key, value);
    }
    return value;
  };
  const vmName = (name: string): string => {
    const key = name.trim().toLocaleLowerCase("de-DE");
    let value = vmMap.get(key);
    if (!value) {
      value = `server-${String(vmMap.size + 1).padStart(3, "0")}`;
      vmMap.set(key, value);
    }
    return value;
  };
  return rows.map((row) => ({ ...row, vmName: vmName(row.vmName), sysv: person(row.sysv), sysvDeputy: person(row.sysvDeputy) }));
}

const drilldownColumns: ColumnDef<TechInfoOrgVmSource, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDeputy", header: "SysVStv", cell: ({ getValue }) => getValue() || "—" },
  {
    accessorKey: "poweredOn",
    header: "Power",
    cell: ({ getValue }) => (getValue() ? <Badge variant="secondary">Ein</Badge> : <Badge variant="outline">Aus</Badge>),
  },
  { accessorKey: "cpuCount", header: "vCPU", cell: ({ getValue }) => formatNum(getValue() as number | null) },
  { accessorKey: "memoryMiB", header: "RAM", cell: ({ getValue }) => formatRamGiB((getValue() as number | null) ?? 0) },
];

export function TechInfoOrganisationPanel({
  sources,
  search,
  vmByName,
  onOpenVm,
}: {
  sources: TechInfoOrgVmSource[];
  search: string;
  vmByName: Map<string, NormalizedVm>;
  onOpenVm: (vm: NormalizedVm) => void;
}) {
  const [roleMode, setRoleMode] = useState<TechInfoOrgRoleMode>("primary");
  const [selection, setSelection] = useState<{ id: string | null; label: string; vmNames: string[] } | null>(null);
  const [pseudonymize, setPseudonymize] = useState(false);

  const result = useMemo(() => buildTechInfoOrganisation(sources, roleMode), [sources, roleMode]);
  const tree = useMemo(() => buildTechInfoOrgTree(result.tree), [result.tree]);
  const bereichNodes = useMemo(() => tree.flatMap((org) => org.children), [tree]);
  const sourceByVmName = useMemo(() => new Map(sources.map((source) => [source.vmName, source])), [sources]);

  const selectNode = (node: TechInfoOrgTreeNode) => {
    setSelection({ id: node.id, label: node.label, vmNames: [...new Set(node.vmRefs.map((ref) => ref.vmName))] });
  };

  const handleRoleModeChange = (value: string) => {
    if (!value) return;
    setRoleMode(value as TechInfoOrgRoleMode);
    setSelection(null);
  };

  const drilldownRows = useMemo(() => {
    if (!selection) return [];
    const rows = selection.vmNames.map((vmName) => sourceByVmName.get(vmName)).filter((row): row is TechInfoOrgVmSource => Boolean(row));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) => [row.vmName, row.sysv, row.sysvDeputy].some((value) => (value ?? "").toLowerCase().includes(q)))
      : rows;
    return pseudonymize ? pseudonymizeRows(filtered) : filtered;
  }, [selection, sourceByVmName, search, pseudonymize]);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-border/70 shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-primary/10 to-transparent" />
        <CardContent className="relative p-0">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Network className="h-4 w-4" aria-hidden="true" />
                Organisationslandkarte
              </div>
              <h2 className="text-xl font-semibold tracking-tight">Verantwortung und Ressourcen im Überblick</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Navigiere von Bereichen über Abteilungen bis zu den verantwortlichen Personen und öffne die zugehörigen Server direkt im Drill-down.
              </p>
            </div>

            <InfoTooltip entry={TECHINFO_ORG_SECTIONS.roleToggle} side="bottom">
              <div className="w-full rounded-lg border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur-sm lg:w-auto">
                <ToggleGroup
                  type="single"
                  value={roleMode}
                  onValueChange={handleRoleModeChange}
                  aria-label="Verantwortungsrolle auswählen"
                  className="grid w-full grid-cols-3 lg:flex"
                >
                  <ToggleGroupItem value="primary" aria-label="Primär" className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Primär
                  </ToggleGroupItem>
                  <ToggleGroupItem value="deputy" aria-label="Stellvertretung" className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Stellvertretung
                  </ToggleGroupItem>
                  <ToggleGroupItem value="both" aria-label="Beide Rollen" className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Beide
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </InfoTooltip>
          </div>
          <div className="relative flex items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-2.5 text-xs text-muted-foreground">
            <UserRoundCog className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Aktive Sicht: <span className="font-medium text-foreground">{ROLE_LABEL[roleMode]}</span>
            <span className="hidden text-border sm:inline">•</span>
            <span className="hidden sm:inline">{ROLE_DESCRIPTION[roleMode]}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard className="bg-card/80" title="Zugeordnete Server-VMs" value={formatNum(result.summary.assignedVmCount)} icon={<Boxes className="h-4 w-4" />} info={TECHINFO_ORG_KPI.assignedVms} />
        <KpiCard className="bg-card/80" title="Organisationen" value={formatNum(result.summary.orgCount)} icon={<Building2 className="h-4 w-4" />} info={TECHINFO_ORG_KPI.orgCount} />
        <KpiCard className="bg-card/80" title="Bereiche" value={formatNum(result.summary.bereichCount)} icon={<Network className="h-4 w-4" />} info={TECHINFO_ORG_KPI.bereichCount} />
        <KpiCard className="bg-card/80" title="Abteilungen" value={formatNum(result.summary.abteilungCount)} icon={<ListTree className="h-4 w-4" />} info={TECHINFO_ORG_KPI.abteilungCount} />
        <KpiCard className="bg-card/80" title="Systemverantwortliche" value={formatNum(result.summary.personCount)} icon={<Users className="h-4 w-4" />} info={TECHINFO_ORG_KPI.personCount} />
        <KpiCard
          className="bg-card/80"
          title="Fehlende / ungültige Zuordnung"
          value={formatNum(result.summary.unassignedVmCount)}
          severity={result.summary.unassignedVmCount > 0 ? "warn" : "ok"}
          icon={<UserX className="h-4 w-4" />}
          info={TECHINFO_ORG_KPI.dataQualityCount}
        />
      </div>

      {result.doubleCountingWarning && (
        <Alert className="border-warning/40 bg-warning/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Im Modus „{ROLE_LABEL.both}“ kann dieselbe VM sowohl unter der/dem Primärverantwortlichen als auch unter der Stellvertretung erscheinen. Summen in der Hierarchie und im Diagramm sind dadurch höher als die Anzahl eindeutiger VMs.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.75fr)]">
        <Card className="h-full overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b border-border/60 bg-muted/10 p-4">
            <div className="rounded-md border border-primary/15 bg-primary/10 p-2 text-primary">
              <ListTree className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <InfoTooltip entry={TECHINFO_ORG_SECTIONS.hierarchyTable} side="bottom">
                <CardTitle className="w-fit cursor-help text-base">Organisationshierarchie</CardTitle>
              </InfoTooltip>
              <CardDescription>Bereiche aufklappen, Verantwortliche auswählen und Ressourcen einordnen.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <TechInfoOrgHierarchyTree tree={tree} selectedNodeId={selection?.id ?? null} onSelectNode={selectNode} />
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/10 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-md border border-primary/15 bg-primary/10 p-2 text-primary">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <InfoTooltip entry={TECHINFO_ORG_SECTIONS.chart} side="bottom">
                    <CardTitle className="w-fit cursor-help text-base">Ressourcen je Bereich</CardTitle>
                  </InfoTooltip>
                  <CardDescription>Verteilung der Infrastruktur nach Organisationseinheit.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-4">
              <TechInfoOrgBereichChart bereichNodes={bereichNodes} selectedBereichId={selection?.id ?? null} onSelectBereich={selectNode} />
            </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border/60 bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <InfoTooltip entry={TECHINFO_ORG_SECTIONS.vmDrilldown} side="bottom">
                <CardTitle className="w-fit cursor-help truncate text-base">
                  {selection ? selection.label : "VM-Drill-down"}
                </CardTitle>
              </InfoTooltip>
              {selection && <Badge variant="secondary">{formatNum(drilldownRows.length)} VMs</Badge>}
            </div>
            <CardDescription>
              {selection ? "Server der gewählten Organisationseinheit." : "Noch keine Organisationseinheit ausgewählt."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2">
            <Checkbox id="techinfo-org-pseudonymize" checked={pseudonymize} onCheckedChange={(checked) => setPseudonymize(checked === true)} />
            <Label htmlFor="techinfo-org-pseudonymize" className="cursor-pointer text-xs text-muted-foreground">Namen pseudonymisieren</Label>
          </div>
        </CardHeader>
        {selection ? (
          <CardContent className="p-0">
            <VirtualTable
              data={drilldownRows}
              columns={drilldownColumns}
              height={360}
              exportFileName="techinfo-organisation"
              onRowClick={(row) => {
                const vm = vmByName.get(row.vmName.trim().toLowerCase());
                if (vm) onOpenVm(vm);
              }}
            />
          </CardContent>
        ) : (
          <CardContent className="p-4">
            <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/10 px-6 py-8 text-center">
              <ListTree className="mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm font-medium">Organisationseinheit auswählen</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Wähle einen Bereich, eine Abteilung oder eine Person in der Hierarchie oder im Diagramm aus.
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Users, Building2, Boxes, UserX, Network } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { TechInfoOrgDataQualityPanel } from "@/components/tech-info/TechInfoOrgDataQualityPanel";
import type { NormalizedVm } from "@/domain/models/types";

const ROLE_LABEL: Record<TechInfoOrgRoleMode, string> = { primary: "Primär (SysV)", deputy: "Stellvertretung (SysVStv)", both: "Beide Rollen" };

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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Zugeordnete Server-VMs" value={formatNum(result.summary.assignedVmCount)} icon={<Boxes className="h-4 w-4" />} info={TECHINFO_ORG_KPI.assignedVms} />
        <KpiCard title="Bereiche" value={formatNum(result.summary.bereichCount)} icon={<Network className="h-4 w-4" />} info={TECHINFO_ORG_KPI.bereichCount} />
        <KpiCard title="Abteilungen" value={formatNum(result.summary.abteilungCount)} icon={<Building2 className="h-4 w-4" />} info={TECHINFO_ORG_KPI.abteilungCount} />
        <KpiCard title="Systemverantwortliche" value={formatNum(result.summary.personCount)} icon={<Users className="h-4 w-4" />} info={TECHINFO_ORG_KPI.personCount} />
        <KpiCard
          title="Fehlende / ungültige Zuordnung"
          value={formatNum(result.summary.unassignedVmCount)}
          severity={result.summary.unassignedVmCount > 0 ? "warn" : "ok"}
          icon={<UserX className="h-4 w-4" />}
          info={TECHINFO_ORG_KPI.dataQualityCount}
        />
      </div>

      <InfoTooltip entry={TECHINFO_ORG_SECTIONS.roleToggle} side="bottom">
        <div className="w-fit cursor-help">
          <ToggleGroup type="single" value={roleMode} onValueChange={handleRoleModeChange}>
            <ToggleGroupItem value="primary" aria-label="Primär">Primär</ToggleGroupItem>
            <ToggleGroupItem value="deputy" aria-label="Stellvertretung">Stellvertretung</ToggleGroupItem>
            <ToggleGroupItem value="both" aria-label="Beide Rollen">Beide Rollen</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </InfoTooltip>

      {result.doubleCountingWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Im Modus „{ROLE_LABEL.both}“ kann dieselbe VM sowohl unter der/dem Primärverantwortlichen als auch unter der Stellvertretung erscheinen. Summen in der Hierarchie und im Diagramm sind dadurch höher als die Anzahl eindeutiger VMs.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <InfoTooltip entry={TECHINFO_ORG_SECTIONS.hierarchyTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Organisationshierarchie</h3>
          </InfoTooltip>
          <TechInfoOrgHierarchyTree tree={tree} selectedNodeId={selection?.id ?? null} onSelectNode={selectNode} />
        </div>
        <div className="space-y-5">
          <TechInfoOrgBereichChart bereichNodes={bereichNodes} selectedBereichId={selection?.id ?? null} onSelectBereich={selectNode} />
          <TechInfoOrgDataQualityPanel issues={result.dataQuality} onSelectVms={(label, vmNames) => setSelection({ id: null, label, vmNames })} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <InfoTooltip entry={TECHINFO_ORG_SECTIONS.vmDrilldown} side="bottom">
            <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">
              {selection ? `VMs: ${selection.label} (${drilldownRows.length})` : "VMs der Auswahl"}
            </h3>
          </InfoTooltip>
          <div className="flex items-center gap-2">
            <Checkbox id="techinfo-org-pseudonymize" checked={pseudonymize} onCheckedChange={(checked) => setPseudonymize(checked === true)} />
            <Label htmlFor="techinfo-org-pseudonymize" className="cursor-pointer text-xs text-muted-foreground">Namen pseudonymisieren</Label>
          </div>
        </div>
        {selection ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">Wähle einen Bereich, eine Abteilung oder eine Person in der Hierarchie, im Diagramm oder in der Datenqualität aus, um die zugehörigen VMs zu sehen.</p>
        )}
      </div>
    </div>
  );
}

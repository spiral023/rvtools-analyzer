import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, GitCompare, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { SelectionBar } from "@/components/planning/SelectionBar";
import { ScenarioList } from "@/components/planning/ScenarioList";
import { WhatIfCompareDialog } from "@/components/planning/WhatIfCompareDialog";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NormalizedVm, Scenario, ScenarioGroup } from "@/domain/models/types";
import { useActiveSnapshotIds, useClusters, useVms } from "@/hooks/useActiveSnapshots";
import { useScenarios } from "@/hooks/useScenarios";
import { useSelection } from "@/hooks/useSelection";
import { useWhatIf } from "@/hooks/useWhatIf";
import { PLANNING_COLUMNS, PLANNING_SECTIONS } from "@/lib/glossaries/planning";
import { getScenarioTargetDisplay } from "@/lib/scenarioTargets";
import { getRangeKeys } from "@/lib/selectionRange";

const vmColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { id: "__selection", header: "", enableSorting: false, size: 40 },
  { accessorKey: "vmName", header: "VM", meta: { info: PLANNING_COLUMNS.vmName } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: PLANNING_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: PLANNING_COLUMNS.host } },
  { accessorKey: "powerState", header: "Power", meta: { info: PLANNING_COLUMNS.powerState } },
  { accessorKey: "cpuCount", header: "vCPU", meta: { info: PLANNING_COLUMNS.cpuCount } },
  { accessorKey: "memoryMiB", header: "RAM GiB", meta: { info: PLANNING_COLUMNS.memoryMiB }, cell: ({ row }) => (row.original.memoryMiB / 1024).toFixed(1) },
];

const makeId = () => `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeGroupId = () => `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function ClusterPlanningPanel() {
  const { snapshots, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, isLoading: vmsLoading } = useVms();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { selectedVmKeys, toggleVm, selectMany, deselectMany, clear, setSelection } = useSelection();
  const { scenarios, saveScenario, deleteScenario } = useScenarios();
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [targetCluster, setTargetCluster] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const anchorIndexRef = useRef(-1);
  const activeScenario = useMemo(() => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null, [scenarios, activeScenarioId]);
  const clusterLabelsByKey = useMemo(() => {
    const displayBySnapshotId = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.vcenterDisplayName]));
    return new Map(clusters.map((cluster) => [
      cluster.clusterKey,
      `${displayBySnapshotId.get(cluster.snapshotId) ?? cluster.vcenterId} · ${cluster.datacenter ?? "—"} · ${cluster.name}`,
    ]));
  }, [clusters, snapshots]);
  const whatIfResult = useWhatIf(activeScenario);
  const allVmKeys = useMemo(() => vms.map((vm) => vm.vmKey), [vms]);

  const selectScenario = (id: string) => {
    setActiveScenarioId(id);
    const scenario = scenarios.find((item) => item.id === id);
    if (scenario) setScenarioName(scenario.name);
  };
  const handleCreateScenario = () => {
    const now = new Date().toISOString();
    const scenario: Scenario = { id: makeId(), name: `Neues Szenario ${new Date().toLocaleDateString("de-DE")}`, type: "cluster-migration", createdAt: now, updatedAt: now, vcenterScope: [], groups: [], notes: null };
    void saveScenario(scenario).then(() => { setActiveScenarioId(scenario.id); setScenarioName(scenario.name); });
  };
  const handleAssignToGroup = () => {
    if (!activeScenario) return toast.error("Bitte zuerst ein Szenario auswählen oder erstellen.");
    if (!targetCluster) return toast.error("Bitte einen Ziel-Cluster auswählen.");
    const existingGroup = activeScenario.groups.find((group) => group.targetClusterKey === targetCluster);
    const groups: ScenarioGroup[] = existingGroup
      ? activeScenario.groups.map((group) => group.id === existingGroup.id ? { ...group, vmKeys: [...new Set([...group.vmKeys, ...selectedVmKeys])] } : group)
      : [...activeScenario.groups, { id: makeGroupId(), label: null, targetClusterKey: targetCluster, vmKeys: [...selectedVmKeys] }];
    void saveScenario({ ...activeScenario, groups, updatedAt: new Date().toISOString() }).then(() => {
      toast.success(`${selectedVmKeys.size} VM(s) zu ${clusterLabelsByKey.get(targetCluster) ?? targetCluster} zugewiesen.`);
      clear();
    });
  };
  const dataLoading = snapshotsLoading || vmsLoading || clustersLoading;
  if (dataLoading) return <PageLoadingState title="Planung" />;
  if (snapshots.length === 0) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ScenarioList scenarios={scenarios} activeId={activeScenarioId} onSelect={selectScenario} onCreate={handleCreateScenario} onDelete={(id) => { void deleteScenario(id); if (activeScenarioId === id) setActiveScenarioId(null); }} />
        <div className="space-y-4">
          {activeScenario ? <>
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="Szenario-Name" className="flex-1" />
                <Button size="sm" onClick={() => void saveScenario({ ...activeScenario, name: scenarioName || activeScenario.name, updatedAt: new Date().toISOString() }).then(() => toast.success("Szenario gespeichert."))}><Save className="h-4 w-4" />Speichern</Button>
                <Button size="sm" variant="outline" onClick={() => setShowCompare(true)} disabled={!whatIfResult}><GitCompare className="h-4 w-4" />What-If</Button>
              </div>
              <Select value={targetCluster} onValueChange={setTargetCluster}><SelectTrigger className="flex-1"><SelectValue placeholder="Ziel-Cluster wählen…" /></SelectTrigger><SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.clusterKey} value={cluster.clusterKey}>{clusterLabelsByKey.get(cluster.clusterKey)}</SelectItem>)}</SelectContent></Select>
            </Card>
            <SelectionBar onAssignToGroup={handleAssignToGroup} />
            {activeScenario.groups.length > 0 && <div className="space-y-2"><InfoTooltip entry={PLANNING_SECTIONS.groups} side="bottom"><h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Gruppen</h3></InfoTooltip>{activeScenario.groups.map((group) => {
              const target = getScenarioTargetDisplay(group.targetClusterKey, clusterLabelsByKey);
              return <Card key={group.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{target.label}</p><p className="text-xs text-muted-foreground">{group.vmKeys.length} VM(s)</p>{target.warning && <p className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{target.warning}</p>}</div><div className="flex shrink-0 items-center gap-2"><Button size="sm" variant="ghost" onClick={() => setSelection(group.vmKeys)}>Laden</Button><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void saveScenario({ ...activeScenario, groups: activeScenario.groups.filter((item) => item.id !== group.id), updatedAt: new Date().toISOString() })}><Trash2 className="h-3.5 w-3.5" /></Button></div></Card>;
            })}</div>}
            {whatIfResult && whatIfResult.clusters.length > 0 && <div className="space-y-2"><InfoTooltip entry={PLANNING_SECTIONS.whatIf} side="bottom"><h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">What-If Zusammenfassung</h3></InfoTooltip><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{whatIfResult.clusters.slice(0, 4).map((cluster) => <Card key={cluster.clusterKey} className="space-y-1 p-3"><p className="truncate text-xs font-medium">{cluster.clusterName}</p><p className="text-xs text-muted-foreground">CPU-Auslastung: {cluster.before.cpuUsagePct}% → {cluster.after.cpuUsagePct}%</p><p className="text-xs text-muted-foreground">vCPU/Core: {cluster.before.vcpuPerCore} → {cluster.after.vcpuPerCore}</p><p className="text-xs text-muted-foreground">RAM-Commit: {cluster.before.ramCommitPct}% → {cluster.after.ramCommitPct}%</p></Card>)}</div></div>}
          </> : <Card className="p-8 text-center text-sm text-muted-foreground">Wählen Sie ein Szenario aus oder erstellen Sie ein neues, um zu beginnen.</Card>}
          <div><InfoTooltip entry={PLANNING_SECTIONS.vmSelection} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM-Auswahl</h3></InfoTooltip><VirtualTable data={vms} columns={vmColumns} selectionEnabled getRowId={(vm) => vm.vmKey} selectedKeys={selectedVmKeys} onToggleRow={(vmKey, shiftKey, sortedKeys, index) => { if (shiftKey && anchorIndexRef.current >= 0) { const keys = getRangeKeys(sortedKeys, anchorIndexRef.current, index); if (keys.every((key) => selectedVmKeys.has(key))) deselectMany(keys); else selectMany(keys); } else { toggleVm(vmKey); anchorIndexRef.current = index; } }} onToggleAll={(selectAll) => { if (selectAll) selectMany(allVmKeys); else clear(); }} height={500} /></div>
        </div>
      </div>
      <WhatIfCompareDialog open={showCompare} onClose={() => setShowCompare(false)} results={whatIfResult?.clusters ?? []} />
    </div>
  );
}

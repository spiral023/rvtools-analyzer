import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVms, useClusters } from "@/hooks/useActiveSnapshots";
import { useSelection } from "@/hooks/useSelection";
import { useScenarios } from "@/hooks/useScenarios";
import { useWhatIf } from "@/hooks/useWhatIf";
import { getRangeKeys } from "@/lib/selectionRange";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SelectionBar } from "@/components/planning/SelectionBar";
import { ScenarioList } from "@/components/planning/ScenarioList";
import { WhatIfCompareDialog } from "@/components/planning/WhatIfCompareDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Map, Save, GitCompare, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, Scenario, ScenarioGroup } from "@/domain/models/types";
import { toast } from "sonner";

const vmColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { id: "__selection", header: "", enableSorting: false, size: 40 },
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
  { accessorKey: "powerState", header: "Power" },
  { accessorKey: "cpuCount", header: "vCPU" },
  { accessorKey: "memoryMiB", header: "RAM GiB", cell: ({ row }) => (row.original.memoryMiB / 1024).toFixed(1) },
];

function makeId(): string {
  return `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Planning() {
  const { snapshots } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { selectedVmKeys, toggleVm, selectMany, deselectMany, clear, setSelection } = useSelection();
  const { scenarios, saveScenario, deleteScenario } = useScenarios();
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [targetCluster, setTargetCluster] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [anchorIndex, setAnchorIndex] = useState(-1);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? null,
    [scenarios, activeScenarioId],
  );

  const whatIfResult = useWhatIf(activeScenario);

  const handleToggleRow = (vmKey: string, shiftKey: boolean, index: number) => {
    if (shiftKey && anchorIndex >= 0) {
      const allKeys = vms.map((v) => v.vmKey);
      const rangeKeys = getRangeKeys(allKeys, anchorIndex, index);
      const allSelected = rangeKeys.every((k) => selectedVmKeys.has(k));
      if (allSelected) deselectMany(rangeKeys);
      else selectMany(rangeKeys);
    } else {
      toggleVm(vmKey);
      setAnchorIndex(index);
    }
  };

  const handleCreateScenario = () => {
    const now = new Date().toISOString();
    const newScenario: Scenario = {
      id: makeId(),
      name: `Neues Szenario ${new Date().toLocaleDateString("de-DE")}`,
      type: "cluster-migration",
      createdAt: now,
      updatedAt: now,
      vcenterScope: [],
      groups: [],
      notes: null,
    };
    void saveScenario(newScenario).then(() => {
      setActiveScenarioId(newScenario.id);
      setScenarioName(newScenario.name);
    });
  };

  const handleSaveScenario = () => {
    if (!activeScenario) return;
    const updated: Scenario = {
      ...activeScenario,
      name: scenarioName || activeScenario.name,
      updatedAt: new Date().toISOString(),
    };
    void saveScenario(updated).then(() => toast.success("Szenario gespeichert."));
  };

  const handleAssignToGroup = () => {
    if (!activeScenario) {
      toast.error("Bitte zuerst ein Szenario auswählen oder erstellen.");
      return;
    }
    if (!targetCluster) {
      toast.error("Bitte einen Ziel-Cluster auswählen.");
      return;
    }
    const vmKeys = [...selectedVmKeys];
    const existingGroup = activeScenario.groups.find((g) => g.targetClusterKey === targetCluster);
    let groups: ScenarioGroup[];
    if (existingGroup) {
      groups = activeScenario.groups.map((g) =>
        g.id === existingGroup.id
          ? { ...g, vmKeys: [...new Set([...g.vmKeys, ...vmKeys])] }
          : g,
      );
    } else {
      groups = [...activeScenario.groups, { id: makeGroupId(), label: null, targetClusterKey: targetCluster, vmKeys }];
    }
    const updated: Scenario = {
      ...activeScenario,
      groups,
      updatedAt: new Date().toISOString(),
    };
    void saveScenario(updated).then(() => {
      toast.success(`${vmKeys.length} VM(s) zu ${targetCluster} zugewiesen.`);
      clear();
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!activeScenario) return;
    const updated: Scenario = {
      ...activeScenario,
      groups: activeScenario.groups.filter((g) => g.id !== groupId),
      updatedAt: new Date().toISOString(),
    };
    void saveScenario(updated);
  };

  const handleLoadScenarioVms = (groupId: string) => {
    const group = activeScenario?.groups.find((g) => g.id === groupId);
    if (group) setSelection(group.vmKeys);
  };

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Planung</h1>
        <EmptyState icon={<Map className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Planung</h1>
      <FilterBar />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <ScenarioList
            scenarios={scenarios}
            activeId={activeScenarioId}
            onSelect={(id) => {
              setActiveScenarioId(id);
              const s = scenarios.find((x) => x.id === id);
              if (s) setScenarioName(s.name);
            }}
            onCreate={handleCreateScenario}
            onDelete={(id) => {
              void deleteScenario(id);
              if (activeScenarioId === id) setActiveScenarioId(null);
            }}
          />
        </div>

        <div className="space-y-4">
          {activeScenario ? (
            <>
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Input
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    placeholder="Szenario-Name"
                    className="flex-1"
                  />
                  <Button size="sm" variant="default" onClick={handleSaveScenario}>
                    <Save className="h-4 w-4" />
                    Speichern
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCompare(true)} disabled={!whatIfResult}>
                    <GitCompare className="h-4 w-4" />
                    What-If
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Select value={targetCluster} onValueChange={setTargetCluster}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Ziel-Cluster wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {clusters.map((c) => (
                        <SelectItem key={c.clusterKey} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>

              <SelectionBar onAssignToGroup={handleAssignToGroup} />

              {activeScenario.groups.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Gruppen</h3>
                  {activeScenario.groups.map((g) => (
                    <Card key={g.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.targetClusterKey}</p>
                        <p className="text-xs text-muted-foreground">{g.vmKeys.length} VM(s)</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => handleLoadScenarioVms(g.id)}>
                          Laden
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteGroup(g.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {whatIfResult && whatIfResult.clusters.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">What-If Zusammenfassung</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {whatIfResult.clusters.slice(0, 4).map((c) => (
                      <Card key={c.clusterName} className="p-3 space-y-1">
                        <p className="text-xs font-medium truncate">{c.clusterName}</p>
                        <p className="text-xs text-muted-foreground">Risk: {c.before.riskScore} → <span className={c.after.riskScore > c.before.riskScore ? "text-destructive font-semibold" : "text-success font-semibold"}>{c.after.riskScore}</span></p>
                        <p className="text-xs text-muted-foreground">CPU: {c.before.cpuUsagePct}% → {c.after.cpuUsagePct}%</p>
                        <p className="text-xs text-muted-foreground">RAM: {c.before.memoryUsagePct}% → {c.after.memoryUsagePct}%</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Wählen Sie ein Szenario aus oder erstellen Sie ein neues, um zu beginnen.
            </Card>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM-Auswahl</h3>
            <VirtualTable
              data={vms}
              columns={vmColumns}
              selectionEnabled
              getRowId={(vm) => vm.vmKey}
              selectedKeys={selectedVmKeys}
              onToggleRow={handleToggleRow}
              height={500}
            />
          </div>
        </div>
      </div>

      <WhatIfCompareDialog
        open={showCompare}
        onClose={() => setShowCompare(false)}
        results={whatIfResult?.clusters ?? []}
      />
    </div>
  );
}

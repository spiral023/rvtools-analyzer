import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { POLICY_GROUPS, type NumericField } from "@/components/planning/fill-up/CapacityPolicyEditor";
import { useClusters } from "@/hooks/useActiveSnapshots";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";
import { createCapacityPolicyAssignment, resolveEffectiveCapacityPolicy } from "@/domain/services/capacityPolicyService";
import type { CapacityPolicy, CapacityPolicyValues, ClusterCapacityPolicyAssignment, NormalizedCluster } from "@/domain/models/types";

interface ClusterRow {
  key: string;
  cluster: NormalizedCluster;
  assignment: ClusterCapacityPolicyAssignment | undefined;
  effectivePolicy: CapacityPolicy;
}

function rowKey(vcenterId: string, clusterKey: string): string {
  return `${vcenterId}:${clusterKey}`;
}

export function PolicyClusterAssignmentTable() {
  const { data: clusters = [] } = useClusters();
  const { policies, assignments, saveAssignment, isSaving } = useCapacityPolicies();
  const [overrideTargetKey, setOverrideTargetKey] = useState<string | null>(null);

  const rows = useMemo<ClusterRow[]>(() => clusters.map((cluster) => {
    const assignment = assignments.find((entry) => entry.vcenterId === cluster.vcenterId && entry.clusterKey === cluster.clusterKey);
    const effectivePolicy = resolveEffectiveCapacityPolicy(policies, assignment) ?? policies[0];
    return { key: rowKey(cluster.vcenterId, cluster.clusterKey), cluster, assignment, effectivePolicy };
  }), [clusters, assignments, policies]);

  const overrideTarget = rows.find((row) => row.key === overrideTargetKey) ?? null;

  const handlePolicyChange = useCallback(async (row: ClusterRow, policyId: string) => {
    const assignment = createCapacityPolicyAssignment(
      { vcenterId: row.cluster.vcenterId, clusterKey: row.cluster.clusterKey, clusterName: row.cluster.name },
      policyId,
      row.assignment?.overrides ?? {},
    );
    await saveAssignment(assignment);
  }, [saveAssignment]);

  const handleSaveOverride = useCallback(async (row: ClusterRow, overrides: Partial<CapacityPolicyValues>) => {
    const assignment = createCapacityPolicyAssignment(
      { vcenterId: row.cluster.vcenterId, clusterKey: row.cluster.clusterKey, clusterName: row.cluster.name },
      row.assignment?.policyId ?? row.effectivePolicy.id,
      overrides,
    );
    await saveAssignment(assignment);
  }, [saveAssignment]);

  const columns = useMemo<ColumnDef<ClusterRow>[]>(() => [
    {
      id: "cluster", header: "Cluster", accessorFn: (row) => `${row.cluster.name} ${row.cluster.vcenterId}`,
      cell: ({ row }) => <div><p className="font-medium">{row.original.cluster.name}</p><p className="text-xs text-muted-foreground">{row.original.cluster.vcenterId}</p></div>,
    },
    {
      id: "policy", header: "Aktive Policy", accessorFn: (row) => row.effectivePolicy.name,
      cell: ({ row }) => (
        <Select value={row.original.assignment?.policyId ?? row.original.effectivePolicy.id} onValueChange={(value) => { void handlePolicyChange(row.original, value); }}>
          <SelectTrigger aria-label={`Policy für ${row.original.cluster.name} auswählen`} className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>{policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name}</SelectItem>)}</SelectContent>
        </Select>
      ),
    },
    {
      id: "version", header: "Version", accessorFn: (row) => row.effectivePolicy.version,
      cell: ({ row }) => <Badge variant="outline">v{row.original.effectivePolicy.version}</Badge>,
    },
    {
      id: "overrides", header: "Overrides", accessorFn: (row) => Object.keys(row.assignment?.overrides ?? {}).length,
      cell: ({ row }) => {
        const count = Object.keys(row.original.assignment?.overrides ?? {}).length;
        return <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setOverrideTargetKey(row.original.key)}>{count > 0 ? `${count} Override${count === 1 ? "" : "s"}` : "Kein Override"}</Button>;
      },
    },
    {
      id: "source", header: "Quelle", accessorFn: (row) => row.assignment ? "explicit" : "fallback",
      cell: ({ row }) => row.original.assignment
        ? <Badge variant="secondary">Explizit</Badge>
        : <Badge variant="outline" className="border-amber-500/40 text-amber-600">Fallback</Badge>,
    },
  ], [policies, handlePolicyChange]);

  return (
    <>
      <VirtualTable
        tableId="planning/policy-cluster-assignment"
        columnPicker
        data={rows}
        columns={columns}
        height={360}
        getRowId={(row) => row.key}
        exportFileName="fill-up-policy-zuweisung"
        emptyTitle="Keine Cluster im aktiven Snapshot"
        emptyDescription="Cluster erscheinen hier, sobald ein RVTools-Import aktiv ist."
      />
      <OverrideDialog
        row={overrideTarget}
        onClose={() => setOverrideTargetKey(null)}
        onSave={(overrides) => handleSaveOverride(overrideTarget!, overrides)}
        isSaving={isSaving}
      />
    </>
  );
}

function OverrideDialog({ row, onClose, onSave, isSaving }: {
  row: ClusterRow | null;
  onClose: () => void;
  onSave: (overrides: Partial<CapacityPolicyValues>) => Promise<void>;
  isSaving: boolean;
}) {
  const [field, setField] = useState<NumericField>("cpuSafetyBufferPct");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setField("cpuSafetyBufferPct");
    setError(null);
    // Nur beim Wechsel des Clusters zurücksetzen, nicht bei jedem Speichern desselben Clusters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.key]);

  useEffect(() => {
    const current = row?.assignment?.overrides[field];
    setValue(current === undefined || current === null ? "" : String(current));
  }, [field, row]);

  if (!row) return null;

  const handleSave = async () => {
    const parsed = value.trim() === "" ? undefined : Number(value.replace(",", "."));
    if (parsed !== undefined && !Number.isFinite(parsed)) {
      setError("Der Override muss eine Zahl sein oder leer bleiben.");
      return;
    }
    const overrides = { ...(row.assignment?.overrides ?? {}) } as Partial<CapacityPolicyValues>;
    if (parsed === undefined) delete overrides[field];
    else overrides[field] = parsed;
    setError(null);
    await onSave(overrides);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override für {row.cluster.name}</DialogTitle>
          <DialogDescription>Ein einzelner Wert kann gezielt vom Basisprofil „{row.effectivePolicy.name}“ abweichen. Leer speichern entfernt den Override wieder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Feld</Label>
            <Select value={field} onValueChange={(next) => setField(next as NumericField)}>
              <SelectTrigger aria-label="Override-Feld auswählen"><SelectValue /></SelectTrigger>
              <SelectContent>{POLICY_GROUPS.flatMap((group) => group.fields).map(([f, label]) => <SelectItem key={f} value={f}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Wert</Label>
            <Input aria-label="Override-Wert" type="number" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Leer = Basisprofil" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

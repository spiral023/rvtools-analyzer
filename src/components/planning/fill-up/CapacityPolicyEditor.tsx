import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";
import { useClusters } from "@/hooks/useActiveSnapshots";
import { createCapacityPolicyAssignment, createNextCapacityPolicyVersion, validateCapacityPolicy } from "@/domain/services/capacityPolicyService";
import type { CapacityPolicy, CapacityPolicyValues } from "@/domain/models/types";

type NumericField = Exclude<{
  [Key in keyof CapacityPolicyValues]: CapacityPolicyValues[Key] extends number | null ? Key : never;
}[keyof CapacityPolicyValues], undefined>;

const POLICY_GROUPS: Array<{ title: string; fields: Array<[NumericField, string, string]> }> = [
  { title: "Zeitfenster & Überbuchung", fields: [["lookbackDays", "Rückblick", "Tage"], ["planningPercentile", "Planungsperzentil", "%"], ["maxVcpuPerCoreNormal", "vCPU/Core Normal", "Ratio"], ["maxVcpuPerCoreN1", "vCPU/Core N-1", "Ratio"], ["maxVcpuPerCoreN2", "vCPU/Core N-2", "Ratio"]] },
  { title: "CPU-Guardrails", fields: [["cpuDemandWarnPctNormal", "Demand Warn Normal", "%"], ["cpuDemandDangerPctNormal", "Demand Danger Normal", "%"], ["cpuDemandWarnPctN1", "Demand Warn N-1", "%"], ["cpuDemandDangerPctN1", "Demand Danger N-1", "%"], ["cpuDemandWarnPctN2", "Demand Warn N-2", "%"], ["cpuDemandDangerPctN2", "Demand Danger N-2", "%"], ["cpuReadyWarnPct", "CPU Ready Warn", "%"], ["cpuReadyDangerPct", "CPU Ready Danger", "%"], ["cpuContentionWarnPct", "Contention Warn", "%"], ["cpuContentionDangerPct", "Contention Danger", "%"]] },
  { title: "RAM & Site-Failover", fields: [["totalRamAssignedWarnPct", "Gesamt-RAM Warn", "%"], ["totalRamAssignedDangerPct", "Gesamt-RAM Danger", "%"], ["memoryUtilizationWarnPct", "Memory Util. Warn", "%"], ["memoryUtilizationDangerPct", "Memory Util. Danger", "%"], ["highRamAssignedWarnPct", "HIGH-RAM Warn", "%"], ["highRamAssignedDangerPct", "HIGH-RAM Danger", "%"], ["highCpuSiteWarnPct", "HIGH-Site-CPU Warn", "%"], ["highCpuSiteDangerPct", "HIGH-Site-CPU Danger", "%"]] },
  { title: "Reserven & Platzierbarkeit", fields: [["cpuSafetyBufferPct", "CPU-Sicherheitspuffer", "%"], ["ramSafetyBufferPct", "RAM-Sicherheitspuffer", "%"], ["ramSystemReserveMiBPerHost", "RAM-Systemreserve je Host", "MiB"], ["maxSingleVmHostCpuPct", "Einzel-VM CPU je Host", "%"], ["maxSingleVmHostRamPct", "Einzel-VM RAM je Host", "%"]] },
];

const BOOLEAN_FIELDS: Array<[keyof Pick<CapacityPolicyValues, "requireN1" | "useN2AsHardLimit" | "requireHighSiteFailover">, string]> = [
  ["requireN1", "N-1 erforderlich"],
  ["useN2AsHardLimit", "N-2 als harte Grenze"],
  ["requireHighSiteFailover", "HIGH-Site-Failover erforderlich"],
];

export function CapacityPolicyEditor() {
  const { data: clusters = [] } = useClusters();
  const { policies, assignments, isLoading, isSaving, savePolicy, saveAssignment: persistAssignment } = useCapacityPolicies();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [selectedClusterKey, setSelectedClusterKey] = useState<string>("");
  const [draft, setDraft] = useState<CapacityPolicy | null>(null);
  const [overrideField, setOverrideField] = useState<NumericField>("cpuSafetyBufferPct");
  const [overrideValue, setOverrideValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPolicyId && policies[0]) setSelectedPolicyId(policies[0].id);
  }, [policies, selectedPolicyId]);
  useEffect(() => {
    if (!selectedClusterKey && clusters[0]) setSelectedClusterKey(clusters[0].clusterKey);
  }, [clusters, selectedClusterKey]);

  const selectedPolicy = useMemo(() => policies.find((policy) => policy.id === selectedPolicyId) ?? policies[0] ?? null, [policies, selectedPolicyId]);
  const selectedCluster = useMemo(() => clusters.find((cluster) => cluster.clusterKey === selectedClusterKey) ?? null, [clusters, selectedClusterKey]);
  const selectedAssignment = useMemo(() => selectedCluster ? assignments.find((assignment) => assignment.vcenterId === selectedCluster.vcenterId && assignment.clusterKey === selectedCluster.clusterKey) : undefined, [assignments, selectedCluster]);

  useEffect(() => {
    if (selectedPolicy) setDraft({ ...selectedPolicy });
  }, [selectedPolicy]);
  useEffect(() => {
    if (!selectedAssignment) {
      setOverrideValue("");
      return;
    }
    const value = selectedAssignment.overrides[overrideField];
    setOverrideValue(value === undefined || value === null ? "" : String(value));
  }, [selectedAssignment, overrideField]);

  if (isLoading || !draft || !selectedPolicy) return <Card><CardContent className="py-8 text-sm text-muted-foreground">Kapazitätsrichtlinien werden geladen …</CardContent></Card>;

  const updateNumber = (field: NumericField, raw: string) => {
    const value = raw.trim() === "" ? null : Number(raw);
    setDraft((current) => current && { ...current, [field]: value === null || Number.isFinite(value) ? value : current[field] });
  };
  const saveVersion = async () => {
    const next = createNextCapacityPolicyVersion(selectedPolicy, draft);
    const errors = validateCapacityPolicy(next);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setError(null);
    await savePolicy(next);
  };
  const handleSaveAssignment = async () => {
    if (!selectedCluster) return;
    const current = selectedAssignment?.overrides ?? {};
    const parsed = overrideValue.trim() === "" ? undefined : Number(overrideValue);
    if (parsed !== undefined && !Number.isFinite(parsed)) {
      setError("Der Override muss eine Zahl sein oder leer bleiben.");
      return;
    }
    const overrides = { ...current } as Partial<CapacityPolicyValues>;
    if (parsed === undefined) delete overrides[overrideField];
    else overrides[overrideField] = parsed;
    const assignment = createCapacityPolicyAssignment({
      vcenterId: selectedCluster.vcenterId,
      clusterKey: selectedCluster.clusterKey,
      clusterName: selectedCluster.name,
    }, selectedPolicyId, overrides);
    setError(null);
    await persistAssignment(assignment);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="gap-3 border-b bg-muted/20 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Fill-Up-Policy</CardTitle>
              <CardDescription>Versionierte Guardrails für historische Szenarien; bestehende Capacity-Health-Schwellen bleiben fachlich getrennt.</CardDescription>
            </div>
            <Badge variant="outline">Version {selectedPolicy.version}</Badge>
          </div>
          <Select value={selectedPolicy.id} onValueChange={setSelectedPolicyId}>
            <SelectTrigger aria-label="Basisprofil auswählen"><SelectValue /></SelectTrigger>
            <SelectContent>{policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {POLICY_GROUPS.map((group) => (
            <section key={group.title} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.fields.map(([field, label, unit]) => <NumericInput key={field} field={field} label={label} unit={unit} value={draft[field]} onChange={updateNumber} />)}
              </div>
            </section>
          ))}
          <div className="grid gap-3 border-t pt-5 sm:grid-cols-3">
            {BOOLEAN_FIELDS.map(([field, label]) => <div key={field} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"><Label htmlFor={field} className="text-sm">{label}</Label><Switch id={field} checked={draft[field]} onCheckedChange={(checked) => setDraft((current) => current && { ...current, [field]: checked })} /></div>)}
          </div>
          <div className="flex justify-end border-t pt-4"><Button onClick={saveVersion} disabled={isSaving}>Neue Policy-Version speichern</Button></div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Clusterzuweisung</CardTitle>
          <CardDescription>Ein Basisprofil je Cluster; ein einzelner Wert kann gezielt abweichen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedCluster?.clusterKey ?? ""} onValueChange={setSelectedClusterKey} disabled={clusters.length === 0}>
            <SelectTrigger aria-label="Cluster auswählen"><SelectValue placeholder="Kein aktiver Cluster" /></SelectTrigger>
            <SelectContent>{clusters.map((cluster) => <SelectItem key={`${cluster.vcenterId}:${cluster.clusterKey}`} value={cluster.clusterKey}>{cluster.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
            <SelectTrigger aria-label="Clusterprofil auswählen"><SelectValue /></SelectTrigger>
            <SelectContent>{policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Einzel-Override</Label>
            <Select value={overrideField} onValueChange={(value) => setOverrideField(value as NumericField)}>
              <SelectTrigger aria-label="Override-Feld auswählen"><SelectValue /></SelectTrigger>
              <SelectContent>{POLICY_GROUPS.flatMap((group) => group.fields).map(([field, label]) => <SelectItem key={field} value={field}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Override-Wert" type="number" value={overrideValue} onChange={(event) => setOverrideValue(event.target.value)} placeholder="Leer = Basisprofil" />
          </div>
          <Button className="w-full" variant="secondary" onClick={handleSaveAssignment} disabled={!selectedCluster || isSaving}>Zuweisung speichern</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NumericInput({ field, label, unit, value, onChange }: {
  field: NumericField;
  label: string;
  unit: string;
  value: number | null;
  onChange: (field: NumericField, raw: string) => void;
}) {
  return <div className="space-y-1.5"><Label htmlFor={field} className="text-xs text-muted-foreground">{label} <span className="text-foreground/70">({unit})</span></Label><Input id={field} type="number" step="any" value={value ?? ""} onChange={(event) => onChange(field, event.target.value)} /></div>;
}

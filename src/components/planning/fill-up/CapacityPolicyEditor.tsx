import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createNextCapacityPolicyVersion, validateCapacityPolicy } from "@/domain/services/capacityPolicyService";
import type { CapacityPolicy, CapacityPolicyValues } from "@/domain/models/types";
import { FILL_UP_POLICY_FIELDS } from "@/lib/glossaries/planning";
import { toFillUpDisplayValue } from "@/lib/fillUpUnits";

export type NumericField = Exclude<{
  [Key in keyof CapacityPolicyValues]: CapacityPolicyValues[Key] extends number | null ? Key : never;
}[keyof CapacityPolicyValues], undefined>;

export const POLICY_GROUPS: Array<{ title: string; fields: Array<[NumericField, string, string]> }> = [
  { title: "Zeitfenster & Überbuchung", fields: [["lookbackDays", "Rückblick", "Tage"], ["planningPercentile", "Planungsperzentil", "%"], ["maxVcpuPerCoreNormal", "vCPU/Core Normal", "Ratio"], ["maxVcpuPerCoreN1", "vCPU/Core N-1", "Ratio"], ["maxVcpuPerCoreN2", "vCPU/Core N-2", "Ratio"]] },
  { title: "CPU-Guardrails", fields: [["cpuDemandWarnPctNormal", "Demand Warn Normal", "%"], ["cpuDemandDangerPctNormal", "Demand Danger Normal", "%"], ["cpuDemandWarnPctN1", "Demand Warn N-1", "%"], ["cpuDemandDangerPctN1", "Demand Danger N-1", "%"], ["cpuDemandWarnPctN2", "Demand Warn N-2", "%"], ["cpuDemandDangerPctN2", "Demand Danger N-2", "%"], ["cpuReadyWarnPct", "CPU Ready Warn", "%"], ["cpuReadyDangerPct", "CPU Ready Danger", "%"], ["cpuContentionWarnPct", "Contention Warn", "%"], ["cpuContentionDangerPct", "Contention Danger", "%"]] },
  { title: "RAM & Site-Failover", fields: [["totalRamAssignedWarnPct", "Gesamt-RAM Warn", "%"], ["totalRamAssignedDangerPct", "Gesamt-RAM Danger", "%"], ["memoryUtilizationWarnPct", "Memory Util. Warn", "%"], ["memoryUtilizationDangerPct", "Memory Util. Danger", "%"], ["highRamAssignedWarnPct", "HIGH-RAM Warn", "%"], ["highRamAssignedDangerPct", "HIGH-RAM Danger", "%"], ["highCpuSiteWarnPct", "HIGH-Site-CPU Warn", "%"], ["highCpuSiteDangerPct", "HIGH-Site-CPU Danger", "%"]] },
  { title: "Reserven & Platzierbarkeit", fields: [["cpuSafetyBufferPct", "CPU-Sicherheitspuffer", "%"], ["ramSafetyBufferPct", "RAM-Sicherheitspuffer", "%"], ["ramSystemReserveMiBPerHost", "RAM-Systemreserve je Host", "GiB"], ["maxSingleVmHostCpuPct", "Einzel-VM CPU je Host", "%"], ["maxSingleVmHostRamPct", "Einzel-VM RAM je Host", "%"]] },
];

const BOOLEAN_FIELDS: Array<[keyof Pick<CapacityPolicyValues, "requireN1" | "useN2AsHardLimit" | "requireHighSiteFailover">, string]> = [
  ["requireN1", "N-1 erforderlich"],
  ["useN2AsHardLimit", "N-2 als harte Grenze"],
  ["requireHighSiteFailover", "HIGH-Site-Failover erforderlich"],
];

export function CapacityPolicyEditor({ policy, onSaveVersion, isSaving }: {
  policy: CapacityPolicy;
  onSaveVersion: (next: CapacityPolicy) => Promise<void>;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<CapacityPolicy>(policy);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(policy);
    setError(null);
  }, [policy]);

  const updateNumber = (field: NumericField, raw: string) => {
    const parsed = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    const value = parsed === null ? null : field === "ramSystemReserveMiBPerHost" ? parsed * 1_024 : parsed;
    setDraft((current) => ({ ...current, [field]: value === null || Number.isFinite(value) ? value : current[field] }));
  };
  const saveVersion = async () => {
    const next = createNextCapacityPolicyVersion(policy, draft);
    const errors = validateCapacityPolicy(next);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setError(null);
    await onSaveVersion(next);
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="gap-3 border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Fill-Up-Policy</CardTitle>
            <CardDescription>Versionierte Guardrails für historische Szenarien; bestehende Capacity-Health-Schwellen bleiben fachlich getrennt.</CardDescription>
          </div>
          <Badge variant="outline">Version {policy.version}</Badge>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="policy-name" className="text-xs text-muted-foreground">Name</Label>
          <Input id="policy-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </div>
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
          {BOOLEAN_FIELDS.map(([field, label]) => <div key={field} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"><InfoTooltip entry={FILL_UP_POLICY_FIELDS[field]} side="bottom"><Label htmlFor={field} className="w-fit cursor-help text-sm">{label}</Label></InfoTooltip><Switch id={field} checked={draft[field]} onCheckedChange={(checked) => setDraft((current) => ({ ...current, [field]: checked }))} /></div>)}
        </div>
        <div className="flex justify-end border-t pt-4"><Button onClick={saveVersion} disabled={isSaving}>Neue Policy-Version speichern</Button></div>
      </CardContent>
    </Card>
  );
}

function NumericInput({ field, label, unit, value, onChange }: {
  field: NumericField;
  label: string;
  unit: string;
  value: number | null;
  onChange: (field: NumericField, raw: string) => void;
}) {
  const displayValue = field === "ramSystemReserveMiBPerHost" ? toFillUpDisplayValue(value, "MiB") : value ?? "";
  return <div className="space-y-1.5"><InfoTooltip entry={FILL_UP_POLICY_FIELDS[field]} side="bottom"><Label htmlFor={field} className="w-fit cursor-help text-xs text-muted-foreground">{label} <span className="text-foreground/70">({unit})</span></Label></InfoTooltip><Input id={field} type="number" step={field === "ramSystemReserveMiBPerHost" ? "0.01" : "any"} value={displayValue} onChange={(event) => onChange(field, event.target.value)} /></div>;
}

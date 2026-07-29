import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { FillUpWorkloadProfile } from "@/domain/models/types";
import { Plus, Trash2 } from "lucide-react";
import type { GlossaryEntry } from "@/lib/glossary";
import { FILL_UP_UI } from "@/lib/glossaries/planning";
import { formatFillUpValue, fromFillUpDisplayValue, toFillUpPreciseDisplayValueDe } from "@/lib/fillUpUnits";
import { resolveCpuDemandMHz } from "@/domain/services/fillUpRecommendationEngine";

export function FillUpWorkloadProfileEditor({ profiles, onChange, cpuDemandConcurrencyPct }: { profiles: readonly FillUpWorkloadProfile[]; onChange: (profiles: FillUpWorkloadProfile[]) => void; cpuDemandConcurrencyPct: number }) {
  const update = (id: string, patch: Partial<FillUpWorkloadProfile>) => onChange(profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  const add = () => onChange([...profiles, { id: `profile-${crypto.randomUUID()}`, name: "Neues Profil", workloadClass: "std", vcpu: 2, memoryMiB: 4_096, cpuDemandP95MHz: 300, cpuDemandAverageMHz: 150 }]);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><InfoTooltip entry={FILL_UP_UI.workloadProfiles} side="right"><h3 className="w-fit cursor-help text-sm font-semibold">Typische zusätzliche VM</h3></InfoTooltip><p className="text-xs text-muted-foreground">P95-Demand ist für eine vollständige CPU-Empfehlung erforderlich. Der Ø-Demand ist optional und wirkt nur über die CPU-Gleichzeitigkeit.</p></div><Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1.5 h-3.5 w-3.5" />Profil</Button></div>
      <div className="space-y-2">
        {profiles.map((profile) => <div key={profile.id} className="grid gap-2 rounded-md border bg-background/50 p-2.5 sm:grid-cols-[minmax(8rem,1fr)_7rem_4.5rem_6rem_6rem_6rem_auto] sm:items-end">
          <Field label="Name" info={FILL_UP_UI.profileName}><Input value={profile.name} onChange={(event) => update(profile.id, { name: event.target.value })} /></Field>
          <Field label="Klasse" info={FILL_UP_UI.profileClass}><Select value={profile.workloadClass} onValueChange={(value) => update(profile.id, { workloadClass: value as FillUpWorkloadProfile["workloadClass"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">HIGH</SelectItem><SelectItem value="std">STD</SelectItem></SelectContent></Select></Field>
          <Field label="vCPU" info={FILL_UP_UI.profileVcpu}><Input type="text" inputMode="decimal" value={toFillUpPreciseDisplayValueDe(profile.vcpu, "vCPU")} onChange={(event) => { const value = fromFillUpDisplayValue(event.target.value, "vCPU"); if (value !== null) update(profile.id, { vcpu: value }); }} /></Field>
          <Field label="RAM GiB" info={FILL_UP_UI.profileMemory}><Input type="text" inputMode="decimal" value={toFillUpPreciseDisplayValueDe(profile.memoryMiB, "MiB")} onChange={(event) => { const value = fromFillUpDisplayValue(event.target.value, "MiB"); if (value !== null) update(profile.id, { memoryMiB: value }); }} /></Field>
          <Field label="Ø GHz" info={FILL_UP_UI.profileAverage}><Input type="text" inputMode="decimal" value={toFillUpPreciseDisplayValueDe(profile.cpuDemandAverageMHz, "MHz")} onChange={(event) => update(profile.id, { cpuDemandAverageMHz: event.target.value.trim() === "" ? null : fromFillUpDisplayValue(event.target.value, "MHz") })} /></Field>
          <Field label="P95 GHz" info={FILL_UP_UI.profileP95}><Input type="text" inputMode="decimal" value={toFillUpPreciseDisplayValueDe(profile.cpuDemandP95MHz, "MHz")} onChange={(event) => { const value = fromFillUpDisplayValue(event.target.value, "MHz"); if (value !== null) update(profile.id, { cpuDemandP95MHz: value }); }} /></Field>
          <Button type="button" variant="ghost" size="icon" aria-label={`${profile.name} entfernen`} disabled={profiles.length < 3} onClick={() => onChange(profiles.filter((entry) => entry.id !== profile.id))}><Trash2 className="h-4 w-4" /></Button>
          <AppliedDemand profile={profile} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} />
        </div>)}
      </div>
    </section>
  );
}

/** Macht sofort sichtbar, welcher CPU-Wert mit dem eingestellten Faktor tatsächlich in die Guardrails geht. */
function AppliedDemand({ profile, cpuDemandConcurrencyPct }: { profile: FillUpWorkloadProfile; cpuDemandConcurrencyPct: number }) {
  const usesAverage = profile.cpuDemandAverageMHz !== null && profile.cpuDemandAverageMHz !== undefined && profile.cpuDemandAverageMHz > 0 && profile.cpuDemandAverageMHz <= profile.cpuDemandP95MHz;
  return <p className="text-[11px] text-muted-foreground sm:col-span-full">
    <InfoTooltip entry={FILL_UP_UI.appliedCpuDemand} side="right"><span className="cursor-help">Angesetzt bei {cpuDemandConcurrencyPct} %</span></InfoTooltip>
    : <span className="font-mono tabular-nums">{formatFillUpValue(resolveCpuDemandMHz(profile, cpuDemandConcurrencyPct), "MHz")}</span>
    {usesAverage ? "" : " · ohne verwertbaren Ø-Demand wird der P95 angesetzt"}
  </p>;
}

function Field({ label, info, children }: { label: string; info: GlossaryEntry; children: React.ReactNode }) {
  return <div className="space-y-1"><InfoTooltip entry={info} side="bottom"><Label className="w-fit cursor-help text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label></InfoTooltip>{children}</div>;
}

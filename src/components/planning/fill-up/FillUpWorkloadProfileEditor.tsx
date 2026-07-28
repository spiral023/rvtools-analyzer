import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { FillUpWorkloadProfile } from "@/domain/models/types";
import { Plus, Trash2 } from "lucide-react";
import type { GlossaryEntry } from "@/lib/glossary";
import { FILL_UP_UI } from "@/lib/glossaries/planning";
import { fromFillUpDisplayValue, toFillUpDisplayValue } from "@/lib/fillUpUnits";

export function FillUpWorkloadProfileEditor({ profiles, onChange }: { profiles: readonly FillUpWorkloadProfile[]; onChange: (profiles: FillUpWorkloadProfile[]) => void }) {
  const update = (id: string, patch: Partial<FillUpWorkloadProfile>) => onChange(profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  const add = () => onChange([...profiles, { id: `profile-${crypto.randomUUID()}`, name: "Neues Profil", workloadClass: "std", vcpu: 2, memoryMiB: 4_096, cpuDemandP95MHz: 300 }]);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><InfoTooltip entry={FILL_UP_UI.workloadProfiles} side="right"><h3 className="w-fit cursor-help text-sm font-semibold">Typische zusätzliche VM</h3></InfoTooltip><p className="text-xs text-muted-foreground">P95-Demand ist für eine vollständige CPU-Empfehlung erforderlich.</p></div><Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1.5 h-3.5 w-3.5" />Profil</Button></div>
      <div className="space-y-2">
        {profiles.map((profile) => <div key={profile.id} className="grid gap-2 rounded-md border bg-background/50 p-2.5 sm:grid-cols-[minmax(8rem,1fr)_7rem_4.5rem_6rem_6rem_auto] sm:items-end">
          <Field label="Name" info={FILL_UP_UI.profileName}><Input value={profile.name} onChange={(event) => update(profile.id, { name: event.target.value })} /></Field>
          <Field label="Klasse" info={FILL_UP_UI.profileClass}><Select value={profile.workloadClass} onValueChange={(value) => update(profile.id, { workloadClass: value as FillUpWorkloadProfile["workloadClass"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">HIGH</SelectItem><SelectItem value="std">STD</SelectItem></SelectContent></Select></Field>
          <Field label="vCPU" info={FILL_UP_UI.profileVcpu}><Input type="number" min="1" value={profile.vcpu} onChange={(event) => update(profile.id, { vcpu: Number(event.target.value) })} /></Field>
          <Field label="RAM GiB" info={FILL_UP_UI.profileMemory}><Input type="number" min="0.01" step="0.01" value={toFillUpDisplayValue(profile.memoryMiB, "MiB")} onChange={(event) => { const value = fromFillUpDisplayValue(event.target.value, "MiB"); if (value !== null) update(profile.id, { memoryMiB: value }); }} /></Field>
          <Field label="P95 GHz" info={FILL_UP_UI.profileP95}><Input type="number" min="0.01" step="0.01" value={toFillUpDisplayValue(profile.cpuDemandP95MHz, "MHz")} onChange={(event) => { const value = fromFillUpDisplayValue(event.target.value, "MHz"); if (value !== null) update(profile.id, { cpuDemandP95MHz: value }); }} /></Field>
          <Button type="button" variant="ghost" size="icon" aria-label={`${profile.name} entfernen`} disabled={profiles.length < 3} onClick={() => onChange(profiles.filter((entry) => entry.id !== profile.id))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
      </div>
    </section>
  );
}

function Field({ label, info, children }: { label: string; info: GlossaryEntry; children: React.ReactNode }) {
  return <div className="space-y-1"><InfoTooltip entry={info} side="bottom"><Label className="w-fit cursor-help text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label></InfoTooltip>{children}</div>;
}

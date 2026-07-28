import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FillUpWorkloadProfile } from "@/domain/models/types";
import { Plus, Trash2 } from "lucide-react";

export function FillUpWorkloadProfileEditor({ profiles, onChange }: { profiles: readonly FillUpWorkloadProfile[]; onChange: (profiles: FillUpWorkloadProfile[]) => void }) {
  const update = (id: string, patch: Partial<FillUpWorkloadProfile>) => onChange(profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  const add = () => onChange([...profiles, { id: `profile-${crypto.randomUUID()}`, name: "Neues Profil", workloadClass: "std", vcpu: 2, memoryMiB: 4_096, cpuDemandP95MHz: 300 }]);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Typische zusätzliche VM</h3><p className="text-xs text-muted-foreground">P95-Demand ist für eine vollständige CPU-Empfehlung erforderlich.</p></div><Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1.5 h-3.5 w-3.5" />Profil</Button></div>
      <div className="space-y-2">
        {profiles.map((profile) => <div key={profile.id} className="grid gap-2 rounded-md border bg-background/50 p-2.5 sm:grid-cols-[minmax(8rem,1fr)_7rem_4.5rem_6rem_6rem_auto] sm:items-end">
          <Field label="Name"><Input value={profile.name} onChange={(event) => update(profile.id, { name: event.target.value })} /></Field>
          <Field label="Klasse"><Select value={profile.workloadClass} onValueChange={(value) => update(profile.id, { workloadClass: value as FillUpWorkloadProfile["workloadClass"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">HIGH</SelectItem><SelectItem value="std">STD</SelectItem></SelectContent></Select></Field>
          <Field label="vCPU"><Input type="number" min="1" value={profile.vcpu} onChange={(event) => update(profile.id, { vcpu: Number(event.target.value) })} /></Field>
          <Field label="RAM MiB"><Input type="number" min="1" value={profile.memoryMiB} onChange={(event) => update(profile.id, { memoryMiB: Number(event.target.value) })} /></Field>
          <Field label="P95 MHz"><Input type="number" min="1" value={profile.cpuDemandP95MHz} onChange={(event) => update(profile.id, { cpuDemandP95MHz: Number(event.target.value) })} /></Field>
          <Button type="button" variant="ghost" size="icon" aria-label={`${profile.name} entfernen`} disabled={profiles.length < 3} onClick={() => onChange(profiles.filter((entry) => entry.id !== profile.id))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>{children}</div>;
}

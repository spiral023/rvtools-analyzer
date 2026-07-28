import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { VropsTimeSeriesImport } from "@/domain/models/types";

export function FillUpInputControls({
  imports,
  selectedImportId,
  onImportChange,
  includeN2,
  onIncludeN2Change,
  highSharePct,
  onHighShareChange,
}: {
  imports: readonly VropsTimeSeriesImport[];
  selectedImportId: string | null;
  onImportChange: (id: string) => void;
  includeN2: boolean;
  onIncludeN2Change: (value: boolean) => void;
  highSharePct: number;
  onHighShareChange: (value: number) => void;
}) {
  return (
    <section className="grid gap-4 border-b bg-muted/20 px-5 py-4 lg:grid-cols-[minmax(18rem,1fr)_auto_minmax(16rem,20rem)] lg:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="fill-up-import" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zeitreihenimport</Label>
        <Select value={selectedImportId ?? ""} onValueChange={onImportChange} disabled={imports.length === 0}>
          <SelectTrigger id="fill-up-import" aria-label="vROps-Zeitreihenimport auswählen"><SelectValue placeholder="Kein vollständiger Import verfügbar" /></SelectTrigger>
          <SelectContent>
            {imports.map((entry) => <SelectItem key={entry.id} value={entry.id}>{new Date(entry.importedAt).toLocaleString("de-DE")} · {entry.expectedSlots} Stunden</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
        <div><Label htmlFor="fill-up-n2" className="text-sm">N-2 analysieren</Label><p className="text-xs text-muted-foreground">Policy entscheidet über harte Grenze.</p></div>
        <Switch id="fill-up-n2" checked={includeN2} onCheckedChange={onIncludeN2Change} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label htmlFor="fill-up-high-share" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zusätzlicher HIGH-Anteil</Label><span className="font-mono text-sm tabular-nums">{highSharePct} %</span></div>
        <Input id="fill-up-high-share" aria-label="HIGH-Anteil in Prozent" type="range" min="0" max="100" step="1" value={highSharePct} onChange={(event) => onHighShareChange(Number(event.target.value))} />
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>0 % HIGH</span><span>{100 - highSharePct} % STD</span><span>100 % HIGH</span></div>
      </div>
    </section>
  );
}

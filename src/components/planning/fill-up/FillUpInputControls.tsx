import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { VropsTimeSeriesImport } from "@/domain/models/types";
import { FILL_UP_UI } from "@/lib/glossaries/planning";

export function FillUpInputControls({
  imports,
  selectedImportId,
  onImportChange,
  includeN2,
  onIncludeN2Change,
  highSharePct,
  onHighShareChange,
  cpuDemandConcurrencyPct,
  onCpuDemandConcurrencyChange,
}: {
  imports: readonly VropsTimeSeriesImport[];
  selectedImportId: string | null;
  onImportChange: (id: string) => void;
  includeN2: boolean;
  onIncludeN2Change: (value: boolean) => void;
  highSharePct: number;
  onHighShareChange: (value: number) => void;
  cpuDemandConcurrencyPct: number;
  onCpuDemandConcurrencyChange: (value: number) => void;
}) {
  return (
    <section className="grid gap-4 border-b bg-muted/20 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_auto_minmax(12rem,1fr)_minmax(12rem,1fr)] xl:items-end">
      <div className="space-y-1.5">
        <InfoTooltip entry={FILL_UP_UI.timeSeriesImport} side="bottom"><Label htmlFor="fill-up-import" className="w-fit cursor-help text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zeitreihenimport</Label></InfoTooltip>
        <Select value={selectedImportId ?? ""} onValueChange={onImportChange} disabled={imports.length === 0}>
          <SelectTrigger id="fill-up-import" aria-label="vROps-Zeitreihenimport auswählen"><SelectValue placeholder="Kein vollständiger Import verfügbar" /></SelectTrigger>
          <SelectContent>
            {imports.map((entry) => <SelectItem key={entry.id} value={entry.id}>{new Date(entry.importedAt).toLocaleString("de-DE")} · {entry.expectedSlots} Stunden</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{imports.length === 0 ? "Noch kein vollständig gespeicherter vROps-Dateisatz. Der Upload-Dialog zeigt nach dem Speichern eine eindeutige Bestätigung und das vollständige Protokoll." : `${imports.length.toLocaleString("de-DE")} lokal gespeicherte Dateisätze verfügbar.`}</p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
        <div><InfoTooltip entry={FILL_UP_UI.n2} side="bottom"><Label htmlFor="fill-up-n2" className="w-fit cursor-help text-sm">N-2 analysieren</Label></InfoTooltip><p className="text-xs text-muted-foreground">Policy entscheidet über harte Grenze.</p></div>
        <Switch id="fill-up-n2" checked={includeN2} onCheckedChange={onIncludeN2Change} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><InfoTooltip entry={FILL_UP_UI.highShare} side="bottom"><Label htmlFor="fill-up-high-share" className="w-fit cursor-help text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zusätzlicher HIGH-Anteil</Label></InfoTooltip><span className="font-mono text-sm tabular-nums">{highSharePct} %</span></div>
        <Input id="fill-up-high-share" aria-label="HIGH-Anteil in Prozent" type="range" min="0" max="100" step="1" value={highSharePct} onChange={(event) => onHighShareChange(Number(event.target.value))} />
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>0 % HIGH</span><span>{100 - highSharePct} % STD</span><span>100 % HIGH</span></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><InfoTooltip entry={FILL_UP_UI.cpuConcurrency} side="bottom"><Label htmlFor="fill-up-cpu-concurrency" className="w-fit cursor-help text-xs font-semibold uppercase tracking-wide text-muted-foreground">CPU-Gleichzeitigkeit</Label></InfoTooltip><span className="font-mono text-sm tabular-nums">{cpuDemandConcurrencyPct} %</span></div>
        <Input id="fill-up-cpu-concurrency" aria-label="CPU-Gleichzeitigkeitsfaktor in Prozent" type="range" min="0" max="100" step="5" value={cpuDemandConcurrencyPct} onChange={(event) => onCpuDemandConcurrencyChange(Number(event.target.value))} />
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Ø Demand</span><span>P95 Demand</span></div>
      </div>
    </section>
  );
}

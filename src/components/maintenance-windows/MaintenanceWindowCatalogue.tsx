import { CalendarRange, FileText, Plus, Search, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import { summarizeWeeklySlots } from "@/lib/maintenanceWindows";
import { cn } from "@/lib/utils";

const HANDLING_LABEL: Record<MaintenanceWindowDefinition["handling"], string> = {
  regular: "Regulär",
  always: "Immer verfügbar",
  "approval-required": "Freigabe erforderlich",
  external: "Extern verwaltet",
};

function systemLabel(count: number): string {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "System" : "Systeme"}`;
}

export function MaintenanceWindowCatalogue({
  definitions,
  totalDefinitions,
  selectedId,
  systemsByDefinition,
  search,
  onSearchChange,
  onSelect,
  onCreate,
  onImport,
}: {
  definitions: readonly MaintenanceWindowDefinition[];
  totalDefinitions: number;
  selectedId: string | null;
  systemsByDefinition: ReadonlyMap<string, readonly TechInfoLatest[]>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <section className="space-y-3" aria-labelledby="maintenance-catalog-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="maintenance-catalog-title" className="text-base font-semibold">Katalog</h2>
          <p className="text-xs text-muted-foreground">Kompakte Auswahl aller Definitionen und Zuordnungen.</p>
        </div>
        <Badge variant="outline" className="font-mono-data tabular-nums">{definitions.length} / {totalDefinitions}</Badge>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Fenster oder System suchen"
          aria-label="Wartungsfenster oder System suchen"
        />
      </div>

      {definitions.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="space-y-4 p-5 text-sm text-muted-foreground">
            <p>{totalDefinitions === 0 ? "Noch keine Wartungsfenster definiert. Es werden keine Beispieldaten angelegt." : "Keine Definition oder Systemzuordnung passt zur Suche."}</p>
            {totalDefinitions === 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={onCreate}><Plus className="mr-2 h-4 w-4" />Manuell anlegen</Button>
                <Button size="sm" variant="outline" onClick={onImport}><FileText className="mr-2 h-4 w-4" />Aus Text importieren</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[42rem] space-y-1.5 overflow-y-auto pr-1" role="list" aria-label="Wartungsfenster-Katalog">
          {definitions.map((definition) => {
            const systemCount = systemsByDefinition.get(definition.id)?.length ?? 0;
            const active = selectedId === definition.id;
            const schedule = summarizeWeeklySlots(definition.weeklySlots);
            return (
              <div key={definition.id} role="listitem" className="[content-visibility:auto] [contain-intrinsic-size:0_82px]">
                <button
                  type="button"
                  aria-label={`${definition.abbreviation || "Unbenanntes Fenster"} auswählen`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(definition.id)}
                  className={cn(
                    "group relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left outline-none",
                    "transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary/70 bg-primary/5 shadow-sm"
                      : "border-border/70 bg-card/60 hover:border-primary/40 hover:bg-muted/25",
                  )}
                >
                  <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-r", active ? "bg-primary" : "bg-transparent group-hover:bg-primary/35")} />
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarRange className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-mono-data text-sm font-semibold">{definition.abbreviation || "Ohne Abkürzung"}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{HANDLING_LABEL[definition.handling]}</Badge>
                  </div>
                  <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{definition.description || "Keine Beschreibung"}</p>
                  <div className="mt-2 flex items-center gap-3 border-t border-border/45 pt-2 pl-6 text-[11px] text-muted-foreground">
                    <span className="flex shrink-0 items-center gap-1 font-medium text-foreground/80">
                      <Server className="h-3 w-3" aria-hidden="true" />
                      {systemLabel(systemCount)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right" title={schedule}>{schedule}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

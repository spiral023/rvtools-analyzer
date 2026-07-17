import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, FileText, Plus, Search, Server, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { MaintenanceWeekGrid } from "@/components/maintenance-windows/MaintenanceWeekGrid";
import { MaintenanceWindowEditor } from "@/components/maintenance-windows/MaintenanceWindowEditor";
import { MaintenanceWindowImportDialog } from "@/components/maintenance-windows/MaintenanceWindowImportDialog";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import { useAllTechInfoLatest } from "@/hooks/useActiveSnapshots";
import { useMaintenanceWindows } from "@/hooks/useMaintenanceWindows";
import {
  assignMaintenanceWindows,
  createEmptyWeeklySlots,
  normalizeMaintenanceAbbreviation,
  summarizeWeeklySlots,
} from "@/lib/maintenanceWindows";

const handlingLabel: Record<MaintenanceWindowDefinition["handling"], string> = {
  regular: "Regulär",
  always: "Immer verfügbar",
  "approval-required": "Freigabe erforderlich",
  external: "Extern verwaltet",
};

const MAX_CATALOGUE_CARDS = 120;

function systemLabel(count: number): string {
  return `${count} ${count === 1 ? "System" : "Systeme"}`;
}

function valueLabel(count: number): string {
  return `${count} ${count === 1 ? "unbekannter Wert" : "unbekannte Werte"}`;
}

function cloneDefinition(value: MaintenanceWindowDefinition): MaintenanceWindowDefinition {
  return {
    ...value,
    weeklySlots: value.weeklySlots.map((day) => [...day]) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: value.calendarRules.map((rule) => ({ ...rule, occurrences: [...rule.occurrences] })),
  };
}

function createDefinition(): MaintenanceWindowDefinition {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    abbreviation: "",
    normalizedAbbreviation: "",
    description: "",
    handling: "regular",
    weeklySlots: createEmptyWeeklySlots(),
    calendarRules: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function uniqueCopyAbbreviation(definition: MaintenanceWindowDefinition, definitions: readonly MaintenanceWindowDefinition[]): string {
  const existing = new Set(definitions.map((item) => normalizeMaintenanceAbbreviation(item.abbreviation)));
  const base = `${definition.abbreviation.trim() || "Wartungsfenster"}-Kopie`;
  let candidate = base;
  let index = 2;
  while (existing.has(normalizeMaintenanceAbbreviation(candidate))) {
    candidate = `${base} ${index}`;
    index += 1;
  }
  return candidate;
}

function AssignmentSystems({ systems, label }: { systems: readonly TechInfoLatest[]; label: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-label={`Systeme für ${label} anzeigen`}>
          {systemLabel(systems.length)}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60 px-3 py-2">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {systems.map((system) => <li key={system.vmNameNorm} className="font-mono-data text-xs">{system.vmName}</li>)}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MaintenanceWindows() {
  const { definitions, isLoading: definitionsLoading, error, isMutating, save, remove, upsert } = useMaintenanceWindows();
  const { data: techInfoRows = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftDefinition, setDraftDefinition] = useState<MaintenanceWindowDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const assignments = useMemo(
    () => assignMaintenanceWindows(definitions, techInfoRows),
    [definitions, techInfoRows],
  );
  const assignedSystems = assignments.known.reduce((sum, group) => sum + group.systems.length, 0);
  const unknownSystems = assignments.unknown.reduce((sum, group) => sum + group.systems.length, 0);
  const normalizedSearch = search.trim().toLocaleLowerCase("de-DE");
  const visibleDefinitions = useMemo(() => definitions
    .filter((definition) => !normalizedSearch || [definition.abbreviation, definition.description, handlingLabel[definition.handling]]
      .some((value) => value.toLocaleLowerCase("de-DE").includes(normalizedSearch)))
    .sort((left, right) => left.abbreviation.localeCompare(right.abbreviation, "de-DE", { numeric: true, sensitivity: "base" })),
  [definitions, normalizedSearch]);
  const catalogueDefinitions = visibleDefinitions.slice(0, MAX_CATALOGUE_CARDS);
  const selectedDefinition = draftDefinition ?? definitions.find((definition) => definition.id === selectedId) ?? null;
  const systemsByDefinition = useMemo(
    () => new Map(assignments.known.map((group) => [group.definition.id, group.systems])),
    [assignments.known],
  );

  const setSelection = (id: string) => {
    if (selectedDefinition?.id === id) return;
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen und anderes Wartungsfenster öffnen?")) return;
    setActionError(null);
    setDirty(false);
    setDraftDefinition(null);
    setSelectedId(id);
  };

  const createNew = () => {
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen und neues Wartungsfenster anlegen?")) return;
    setActionError(null);
    setDirty(false);
    setSelectedId(null);
    setDraftDefinition(createDefinition());
  };

  const handleSave = async (value: MaintenanceWindowDefinition) => {
    setActionError(null);
    try {
      await save(value);
      setDirty(false);
      setDraftDefinition(null);
      setSelectedId(value.id);
      toast.success("Wartungsfenster gespeichert.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.";
      setActionError(message);
      toast.error("Wartungsfenster konnte nicht gespeichert werden.");
      throw saveError;
    }
  };

  const handleDelete = async (value: MaintenanceWindowDefinition) => {
    if (!window.confirm(`Wartungsfenster „${value.abbreviation || "ohne Abkürzung"}“ wirklich löschen?`)) return;
    setActionError(null);
    try {
      await remove(value.id);
      setDirty(false);
      setDraftDefinition(null);
      setSelectedId(null);
      toast.success("Wartungsfenster gelöscht.");
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : "Löschen fehlgeschlagen.";
      setActionError(message);
      toast.error("Wartungsfenster konnte nicht gelöscht werden.");
    }
  };

  const handleDuplicate = (value: MaintenanceWindowDefinition) => {
    const timestamp = new Date().toISOString();
    const abbreviation = uniqueCopyAbbreviation(value, definitions);
    const duplicate = cloneDefinition({
      ...value,
      id: crypto.randomUUID(),
      abbreviation,
      normalizedAbbreviation: normalizeMaintenanceAbbreviation(abbreviation),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setActionError(null);
    setDirty(false);
    setSelectedId(null);
    setDraftDefinition(duplicate);
  };

  const handleImport = async (incoming: MaintenanceWindowDefinition[]) => {
    setActionError(null);
    try {
      await upsert(incoming);
      const next = incoming[0];
      if (next) {
        setSelectedId(next.id);
        setDraftDefinition(null);
      }
      toast.success(incoming.length === 1 ? "Wartungsfenster importiert." : `${incoming.length} Wartungsfenster importiert.`);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Import fehlgeschlagen.";
      setActionError(message);
      toast.error("Wartungsfenster konnten nicht importiert werden.");
      throw importError;
    }
  };

  if (definitionsLoading || techInfoLoading) return <PageLoadingState title="Wartungsfenster" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <CalendarRange className="h-4 w-4 text-primary" /> Betriebsplanung
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Wartungsfenster</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Lokaler Katalog für Zeitpläne und ihre Zuordnung zu Systemen aus Tech-Info – ohne Server oder externe Synchronisierung.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><FileText className="mr-2 h-4 w-4" />Aus Text importieren</Button>
          <Button onClick={createNew}><Plus className="mr-2 h-4 w-4" />Neues Wartungsfenster</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Definierte Fenster" value={definitions.length} icon={<CalendarRange className="h-4 w-4" />} />
        <KpiCard title="Systeme zugeordnet" value={assignedSystems} subtitle={systemLabel(assignedSystems)} icon={<Server className="h-4 w-4" />} severity={assignedSystems > 0 ? "ok" : undefined} />
        <KpiCard title="Unbekannte Werte" value={assignments.unknown.length} subtitle={valueLabel(assignments.unknown.length)} icon={<TriangleAlert className="h-4 w-4" />} severity={assignments.unknown.length ? "warn" : "ok"} />
        <KpiCard title="Systeme unbekannt" value={unknownSystems} subtitle={systemLabel(unknownSystems)} icon={<TriangleAlert className="h-4 w-4" />} severity={unknownSystems ? "warn" : "ok"} />
      </div>

      {(actionError || error) && <Alert variant="destructive"><AlertTitle>Aktion fehlgeschlagen</AlertTitle><AlertDescription>{actionError ?? error?.message}</AlertDescription></Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(32rem,1.45fr)] xl:items-start">
        <section className="space-y-3" aria-labelledby="maintenance-catalog-title">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="maintenance-catalog-title" className="text-base font-semibold">Katalog</h2><p className="text-xs text-muted-foreground">Definitionen bleiben sichtbar, auch ohne Systeme.</p></div>
            <Badge variant="outline" className="tabular-nums">{visibleDefinitions.length}</Badge>
          </div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fenster durchsuchen" aria-label="Wartungsfenster durchsuchen" /></div>
          {visibleDefinitions.length === 0 ? (
            <Card className="border-dashed shadow-none"><CardContent className="space-y-4 p-5 text-sm text-muted-foreground">
              <p>{definitions.length === 0 ? "Noch keine Wartungsfenster definiert. Es werden keine Beispieldaten angelegt." : "Keine Definition passt zur Suche."}</p>
              {definitions.length === 0 && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={createNew}>Manuell anlegen</Button><Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Aus Text importieren</Button></div>}
            </CardContent></Card>
          ) : <div className="space-y-2">
            <div className="max-h-[42rem] space-y-2 overflow-y-auto pr-1">
            {catalogueDefinitions.map((definition) => {
              const systems = systemsByDefinition.get(definition.id) ?? [];
              const active = selectedDefinition?.id === definition.id;
              return <button key={definition.id} type="button" aria-label={`${definition.abbreviation || "Unbenanntes Fenster"} auswählen`} onClick={() => setSelection(definition.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-card hover:border-primary/45 hover:bg-muted/30"}`}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-mono-data text-sm font-semibold">{definition.abbreviation || "Ohne Abkürzung"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{definition.description || "Keine Beschreibung"}</p></div><Badge variant="secondary" className="shrink-0 text-[10px]">{handlingLabel[definition.handling]}</Badge></div>
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground"><span>{systemLabel(systems.length)}</span><span className="truncate text-right" title={summarizeWeeklySlots(definition.weeklySlots)}>{summarizeWeeklySlots(definition.weeklySlots)}</span></div>
                <div className="mt-2 overflow-hidden rounded border border-border/50"><MaintenanceWeekGrid value={definition.weeklySlots} onChange={() => {}} paintMode="allow" compact /></div>
              </button>;
            })}
            </div>
            {visibleDefinitions.length > MAX_CATALOGUE_CARDS && <p className="text-center text-xs text-muted-foreground">Es werden die ersten {MAX_CATALOGUE_CARDS} Treffer gezeigt. Verfeinern Sie die Suche.</p>}
          </div>}
        </section>

        <section aria-label="Fensterdefinition bearbeiten" className="min-w-0">
          {selectedDefinition ? <MaintenanceWindowEditor
            value={selectedDefinition}
            existingAbbreviations={visibleDefinitions.filter((definition) => definition.id !== selectedDefinition.id).map((definition) => definition.abbreviation)}
            isSaving={isMutating}
            onSave={handleSave}
            onDelete={(definition) => { void handleDelete(definition); }}
            onDuplicate={handleDuplicate}
            onDirtyChange={setDirty}
          /> : <Card className="min-h-[18rem] border-dashed shadow-none"><CardHeader><CardTitle className="text-base">Definition auswählen</CardTitle><CardDescription>Wählen Sie ein Wartungsfenster im Katalog oder legen Sie ein neues an.</CardDescription></CardHeader></Card>}
        </section>
      </div>

      <section className="space-y-3 border-t border-border/70 pt-5" aria-labelledby="maintenance-assignments-title">
        <div><h2 id="maintenance-assignments-title" className="text-base font-semibold">Systemzuordnungen</h2><p className="text-sm text-muted-foreground">Aus allen zuletzt importierten Tech-Info-Zeilen; unabhängig von RVTools-Snapshots.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-none"><CardHeader className="px-4 py-3"><CardTitle className="text-sm">Bekannte Fenster</CardTitle></CardHeader><CardContent className="space-y-2 px-4 pb-4">
            {assignments.known.map((group) => <div key={group.definition.id} className="rounded-md border border-border/60"><div className="flex items-center justify-between gap-2 px-3 py-2"><div className="min-w-0"><span className="font-mono-data text-sm font-semibold">{group.definition.abbreviation || "Ohne Abkürzung"}</span><span className="ml-2 text-xs text-muted-foreground">{group.definition.description || handlingLabel[group.definition.handling]}</span></div><AssignmentSystems systems={group.systems} label={group.definition.abbreviation || "ohne Abkürzung"} /></div></div>)}
            {assignments.known.length === 0 && <p className="text-sm text-muted-foreground">Keine Definitionen vorhanden.</p>}
          </CardContent></Card>
          <Card className="border-amber-500/25 shadow-none"><CardHeader className="px-4 py-3"><CardTitle className="text-sm">Unbekannte Werte</CardTitle></CardHeader><CardContent className="space-y-2 px-4 pb-4">
            {assignments.unknown.map((group) => <div key={group.normalizedAbbreviation} className="rounded-md border border-amber-500/25 bg-amber-500/5"><div className="flex items-center justify-between gap-2 px-3 py-2"><div className="min-w-0"><span className="font-mono-data text-sm font-semibold">{group.abbreviation}</span><p className="text-xs text-muted-foreground">Nicht im Katalog definiert</p></div><AssignmentSystems systems={group.systems} label={group.abbreviation} /></div></div>)}
            {assignments.unknown.length === 0 && <p className="text-sm text-muted-foreground">Keine unbekannten Werte in Tech-Info.</p>}
          </CardContent></Card>
        </div>
      </section>

      <MaintenanceWindowImportDialog open={importOpen} onOpenChange={setImportOpen} existing={definitions} onImport={handleImport} isImporting={isMutating} />
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { CalendarOff, CalendarRange, FileText, Percent, Plus, Server, TriangleAlert } from "lucide-react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { MaintenanceAssignmentsPanel } from "@/components/maintenance-windows/MaintenanceAssignmentsPanel";
import { MaintenanceWindowCatalogue } from "@/components/maintenance-windows/MaintenanceWindowCatalogue";
import { MaintenanceWindowEditor } from "@/components/maintenance-windows/MaintenanceWindowEditor";
import { MaintenanceCoverageChart } from "@/components/maintenance-windows/MaintenanceCoverageChart";
import { MaintenanceWindowImportDialog } from "@/components/maintenance-windows/MaintenanceWindowImportDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import { useAllTechInfoLatest } from "@/hooks/useActiveSnapshots";
import { useMaintenanceWindows } from "@/hooks/useMaintenanceWindows";
import { MAINTENANCE_WINDOWS_KPI } from "@/lib/glossaries/maintenanceWindows";
import {
  assignMaintenanceWindows,
  createEmptyWeeklySlots,
  normalizeMaintenanceAbbreviation,
} from "@/lib/maintenanceWindows";

const handlingLabel: Record<MaintenanceWindowDefinition["handling"], string> = {
  regular: "Regulär",
  always: "Immer verfügbar",
  "approval-required": "Freigabe erforderlich",
  external: "Extern verwaltet",
};

function systemLabel(count: number): string {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "System" : "Systeme"}`;
}

function valueLabel(count: number): string {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "unbekannter Wert" : "unbekannte Werte"}`;
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

export default function MaintenanceWindows() {
  const { definitions, isLoading: definitionsLoading, error, isMutating, save, remove, upsert } = useMaintenanceWindows();
  const { data: techInfoRows = [], isLoading: techInfoLoading, error: techInfoError } = useAllTechInfoLatest();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftDefinition, setDraftDefinition] = useState<MaintenanceWindowDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const blocker = useBlocker(dirty && !isMutating);

  useBeforeUnload(useCallback((event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  }, [dirty]));

  const assignments = useMemo(
    () => assignMaintenanceWindows(definitions, techInfoRows),
    [definitions, techInfoRows],
  );
  const assignedSystems = assignments.known.reduce((sum, group) => sum + group.systems.length, 0);
  const unassignedSystems = Math.max(0, techInfoRows.length - assignedSystems);
  const assignmentCoverage = techInfoRows.length > 0 ? (assignedSystems / techInfoRows.length) * 100 : null;
  const unusedDefinitions = assignments.known.filter((group) => group.systems.length === 0).length;
  const systemsByDefinition = useMemo(
    () => new Map(assignments.known.map((group) => [group.definition.id, group.systems])),
    [assignments.known],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("de-DE");
  const visibleDefinitions = useMemo(() => definitions
    .filter((definition) => !normalizedSearch
      || [definition.abbreviation, definition.description, handlingLabel[definition.handling]]
        .some((value) => value.toLocaleLowerCase("de-DE").includes(normalizedSearch))
      || (systemsByDefinition.get(definition.id) ?? [])
        .some((system) => system.vmName.toLocaleLowerCase("de-DE").includes(normalizedSearch)))
    .sort((left, right) => left.abbreviation.localeCompare(right.abbreviation, "de-DE", { numeric: true, sensitivity: "base" })),
  [definitions, normalizedSearch, systemsByDefinition]);
  const selectedDefinition = draftDefinition ?? definitions.find((definition) => definition.id === selectedId) ?? null;
  const existingAbbreviations = useMemo(() => {
    const result: string[] = [];
    for (const definition of definitions) {
      if (definition.id !== selectedDefinition?.id) result.push(definition.abbreviation);
    }
    return result;
  }, [definitions, selectedDefinition?.id]);

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

  const handleDuplicate = async (value: MaintenanceWindowDefinition) => {
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
    try {
      await save(duplicate);
      setDirty(false);
      setDraftDefinition(null);
      setSelectedId(duplicate.id);
      toast.success("Wartungsfenster dupliziert.");
    } catch (duplicateError) {
      const message = duplicateError instanceof Error ? duplicateError.message : "Duplizieren fehlgeschlagen.";
      setActionError(message);
      toast.error("Wartungsfenster konnte nicht dupliziert werden.");
    }
  };

  const handleImport = async (incoming: MaintenanceWindowDefinition[]) => {
    setActionError(null);
    try {
      await upsert(incoming);
      const next = incoming[0];
      if (!dirty && next) {
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
      <PageHeader
        title="Wartungsfenster"
        subtitle="Lokaler Katalog für Zeitpläne und ihre Zuordnung zu Systemen aus Tech-Info – ohne Server oder externe Synchronisierung."
        meta={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><FileText className="mr-2 h-4 w-4" />Aus Text importieren</Button>
            <Button onClick={createNew}><Plus className="mr-2 h-4 w-4" />Neues Wartungsfenster</Button>
          </div>
        )}
      />

      <KpiGrid>
        <KpiCard title="Definierte Fenster" value={definitions.length} icon={<CalendarRange className="h-4 w-4" />} info={MAINTENANCE_WINDOWS_KPI.definitions} />
        <KpiCard title="Systeme zugeordnet" value={assignedSystems} subtitle={systemLabel(assignedSystems)} icon={<Server className="h-4 w-4" />} severity={assignedSystems > 0 ? "ok" : undefined} info={MAINTENANCE_WINDOWS_KPI.assignedSystems} />
        <KpiCard title="Zuordnungsquote" value={assignmentCoverage === null ? "—" : `${assignmentCoverage.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`} subtitle={techInfoRows.length > 0 ? `${assignedSystems.toLocaleString("de-DE")} von ${techInfoRows.length.toLocaleString("de-DE")} Systemen` : "Keine Tech-Info-Daten"} icon={<Percent className="h-4 w-4" />} severity={assignmentCoverage === null ? undefined : assignmentCoverage >= 95 ? "ok" : assignmentCoverage >= 80 ? "warn" : "crit"} info={MAINTENANCE_WINDOWS_KPI.coverage} />
        <KpiCard title="Ungenutzte Fenster" value={unusedDefinitions} subtitle={`${unusedDefinitions.toLocaleString("de-DE")} ohne Systeme`} icon={<CalendarOff className="h-4 w-4" />} severity={unusedDefinitions > 0 ? "warn" : "ok"} info={MAINTENANCE_WINDOWS_KPI.unusedDefinitions} />
        <KpiCard title="Unbekannte Werte" value={assignments.unknown.length} subtitle={valueLabel(assignments.unknown.length)} icon={<TriangleAlert className="h-4 w-4" />} severity={assignments.unknown.length ? "warn" : "ok"} info={MAINTENANCE_WINDOWS_KPI.unknownValues} />
        <KpiCard title="Systeme ohne Zuordnung" value={unassignedSystems} subtitle={systemLabel(unassignedSystems)} icon={<TriangleAlert className="h-4 w-4" />} severity={unassignedSystems ? "warn" : "ok"} info={MAINTENANCE_WINDOWS_KPI.unassignedSystems} />
      </KpiGrid>

      <MaintenanceCoverageChart known={assignments.known} />

      {(actionError || error) && <Alert variant="destructive"><AlertTitle>Aktion fehlgeschlagen</AlertTitle><AlertDescription>{actionError ?? error?.message}</AlertDescription></Alert>}
      {techInfoError && <Alert variant="destructive"><AlertTitle>Tech-Info-Zuordnungen konnten nicht geladen werden</AlertTitle><AlertDescription>{techInfoError instanceof Error ? techInfoError.message : "Tech-Info konnte nicht geladen werden. Die Zuordnungen sind möglicherweise unvollständig."}</AlertDescription></Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(32rem,1.45fr)] xl:items-start">
        <MaintenanceWindowCatalogue
          definitions={visibleDefinitions}
          totalDefinitions={definitions.length}
          selectedId={selectedDefinition?.id ?? null}
          systemsByDefinition={systemsByDefinition}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelection}
          onCreate={createNew}
          onImport={() => setImportOpen(true)}
        />

        <section aria-label="Fensterdefinition bearbeiten" className="min-w-0">
          {selectedDefinition ? <MaintenanceWindowEditor
            value={selectedDefinition}
            existingAbbreviations={existingAbbreviations}
            isSaving={isMutating}
            onSave={handleSave}
            onDelete={(definition) => { void handleDelete(definition); }}
            onDuplicate={(definition) => { void handleDuplicate(definition); }}
            onDirtyChange={setDirty}
          /> : <Card className="min-h-[18rem] border-dashed shadow-none"><CardHeader><CardTitle className="text-base">Definition auswählen</CardTitle><CardDescription>Wählen Sie ein Wartungsfenster im Katalog oder legen Sie ein neues an.</CardDescription></CardHeader></Card>}
        </section>
      </div>

      <MaintenanceAssignmentsPanel assignments={assignments} search={search} />

      <MaintenanceWindowImportDialog open={importOpen} onOpenChange={setImportOpen} existing={definitions} onImport={handleImport} isImporting={isMutating} />
      <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => { if (!open) blocker.reset?.(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ungespeicherte Änderungen</DialogTitle>
            <DialogDescription>Ihre Änderungen am Wartungsfenster wurden noch nicht gespeichert. Möchten Sie die Navigation wirklich fortsetzen?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>Bleiben</Button>
            <Button type="button" variant="destructive" onClick={() => { setDirty(false); setDraftDefinition(null); blocker.proceed?.(); }}>Verwerfen &amp; navigieren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

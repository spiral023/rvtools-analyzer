import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleAlert, FilePlus2, RefreshCw } from "lucide-react";
import type { MaintenanceWindowDefinition, MonthlyOccurrence } from "@/domain/models/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DAY_LABELS } from "@/lib/maintenanceWindows";
import {
  buildMaintenanceImportPreview,
  parseMaintenanceWindowText,
  type MaintenanceImportIssue,
  type MaintenanceImportPreviewRow,
} from "@/lib/maintenanceWindowImport";
import { MaintenanceWeekGrid } from "./MaintenanceWeekGrid";

export interface MaintenanceWindowImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: MaintenanceWindowDefinition[];
  onImport: (definitions: MaintenanceWindowDefinition[]) => void | Promise<void>;
  isImporting?: boolean;
}

const statusLabels = {
  new: "Neu",
  update: "Aktualisierung",
  unchanged: "Unverändert",
} as const;

const handlingLabels: Record<MaintenanceWindowDefinition["handling"], string> = {
  regular: "Regulär",
  always: "Immer verfügbar",
  external: "Extern verwaltet",
  "approval-required": "Freigabe erforderlich",
};

const occurrenceLabels: Record<MonthlyOccurrence, string> = {
  1: "erster",
  2: "zweiter",
  3: "dritter",
  4: "vierter",
  5: "fünfter",
  last: "letzter",
};

function issueText(issue: MaintenanceImportIssue): string {
  const location = [
    `Block ${issue.block}`,
    issue.field ? `Feld ${issue.field}` : null,
  ].filter(Boolean).join(", ");
  return `${location}: ${issue.message}`;
}

function calendarRuleText(definition: MaintenanceWindowDefinition): string | null {
  if (definition.calendarRules.length === 0) return null;
  return definition.calendarRules.map((rule) => (
    `${DAY_LABELS[rule.weekday]}: ${rule.occurrences.map((occurrence) => occurrenceLabels[occurrence]).join(", ")}`
  )).join("; ");
}

function isValidChanged(row: MaintenanceImportPreviewRow): boolean {
  return row.status !== "unchanged" && !row.issues.some((issue) => issue.severity === "error");
}

function statusVariant(status: MaintenanceImportPreviewRow["status"]): "default" | "secondary" | "outline" {
  if (status === "new") return "default";
  if (status === "update") return "secondary";
  return "outline";
}

export function MaintenanceWindowImportDialog({
  open,
  onOpenChange,
  existing,
  onImport,
  isImporting = false,
}: MaintenanceWindowImportDialogProps) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<MaintenanceImportPreviewRow[] | null>(null);
  const [standaloneIssues, setStandaloneIssues] = useState<MaintenanceImportIssue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wasOpen = useRef(open);

  const isBusy = isImporting || isSubmitting;
  const selectedRows = (preview ?? []).filter((row) => selectedIds.has(row.definition.id) && isValidChanged(row));

  const reset = () => {
    setText("");
    setPreview(null);
    setStandaloneIssues([]);
    setSelectedIds(new Set());
    setImportError(null);
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (open && !wasOpen.current) reset();
    wasOpen.current = open;
  }, [open]);

  const clearPreview = () => {
    setPreview(null);
    setStandaloneIssues([]);
    setSelectedIds(new Set());
    setImportError(null);
  };

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    if (preview !== null || standaloneIssues.length > 0 || selectedIds.size > 0 || importError !== null) {
      clearPreview();
    }
  };

  const handleCheck = () => {
    if (isBusy) return;
    setImportError(null);
    try {
      const parsed = parseMaintenanceWindowText(text);
      const nextPreview = buildMaintenanceImportPreview(parsed.entries, existing);
      setPreview(nextPreview);
      setStandaloneIssues(parsed.errors.filter((issue) => !nextPreview.some((row) => row.sourceBlock === issue.block)));
      setSelectedIds(new Set(nextPreview.filter(isValidChanged).map((row) => row.definition.id)));
    } catch (error) {
      setPreview(null);
      setStandaloneIssues([]);
      setSelectedIds(new Set());
      setImportError(error instanceof Error ? error.message : "Der Text konnte nicht geprüft werden.");
    }
  };

  const toggleRow = (row: MaintenanceImportPreviewRow, checked: boolean) => {
    if (isBusy || !isValidChanged(row)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(row.definition.id);
      else next.delete(row.definition.id);
      return next;
    });
  };

  const handleImport = async () => {
    if (isBusy || selectedRows.length === 0 || selectedRows.some((row) => !isValidChanged(row))) return;
    setImportError(null);
    setIsSubmitting(true);
    try {
      await onImport(selectedRows.map((row) => row.definition));
      reset();
      onOpenChange(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Der Import konnte nicht abgeschlossen werden.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const counts = (preview ?? []).reduce<Record<MaintenanceImportPreviewRow["status"], number>>(
    (current, row) => ({ ...current, [row.status]: current[row.status] + 1 }),
    { new: 0, update: 0, unchanged: 0 },
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isBusy) onOpenChange(nextOpen); }}>
      <DialogContent
        className="max-h-[90dvh] max-w-4xl overflow-y-auto overscroll-contain"
        onEscapeKeyDown={(event) => { if (isBusy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (isBusy) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Wartungsfenster importieren</DialogTitle>
          <DialogDescription>
            Text aus der RVTools-Wartungsfensterübersicht einfügen, prüfen und gezielt übernehmen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="maintenance-window-import-text">Wartungsfenster-Text</Label>
          <Textarea
            id="maintenance-window-import-text"
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            disabled={isBusy}
            rows={10}
            placeholder="Abkürzung, Details und sieben Tagesmasken aus RVTools einfügen"
          />
          <Button type="button" variant="secondary" onClick={handleCheck} disabled={isBusy}>
            Text prüfen
          </Button>
        </div>

        {importError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{importError}</p> : null}

        {preview ? (
          <section className="space-y-3" aria-label="Importvorschau">
            <div className="flex flex-wrap gap-2" aria-label="Vorschau-Zusammenfassung">
              <Badge variant="default">Neu: {counts.new}</Badge>
              <Badge variant="secondary">Aktualisierung: {counts.update}</Badge>
              <Badge variant="outline">Unverändert: {counts.unchanged}</Badge>
              <Badge variant={standaloneIssues.length > 0 || preview.some((row) => row.issues.some((issue) => issue.severity === "error")) ? "destructive" : "outline"}>
                Fehler: {standaloneIssues.length + preview.flatMap((row) => row.issues).filter((issue) => issue.severity === "error").length}
              </Badge>
              <Badge variant="outline">Warnungen: {preview.flatMap((row) => row.issues).filter((issue) => issue.severity === "warning").length}</Badge>
            </div>

            {standaloneIssues.length > 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
                <p className="font-medium">Fehlerhafte Textblöcke</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {standaloneIssues.map((issue, index) => <li key={`${issue.block}-${issue.code}-${index}`}>{issueText(issue)}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="space-y-3">
              {preview.map((row) => {
                const isSelectable = isValidChanged(row);
                const hasErrors = row.issues.some((issue) => issue.severity === "error");
                const calendarText = calendarRuleText(row.definition);
                const checkboxId = `maintenance-import-${row.definition.id}`;
                return (
                  <article className="rounded-lg border bg-card p-4" key={row.definition.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{row.definition.abbreviation}</h3>
                          <Badge variant={statusVariant(row.status)}>{statusLabels[row.status]}</Badge>
                          {hasErrors ? <Badge variant="destructive"><CircleAlert className="mr-1 h-3.5 w-3.5" />Fehler</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{row.definition.description || "Keine Beschreibung"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={selectedIds.has(row.definition.id)}
                          disabled={!isSelectable || isBusy}
                          onCheckedChange={(checked) => toggleRow(row, checked === true)}
                        />
                        <Label htmlFor={checkboxId} className="text-sm">{row.definition.abbreviation} auswählen</Label>
                      </div>
                    </div>

                    <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      <div><dt className="inline text-muted-foreground">Behandlung: </dt><dd className="inline">{handlingLabels[row.definition.handling]}</dd></div>
                      <div><dt className="inline text-muted-foreground">Monatsregeln: </dt><dd className="inline">{calendarText ?? "Keine"}</dd></div>
                    </dl>
                    <div className="mt-3 rounded-md bg-muted/50 p-2">
                      <MaintenanceWeekGrid value={row.definition.weeklySlots} onChange={() => {}} paintMode="allow" compact />
                    </div>
                    {row.issues.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm" aria-label={`Hinweise zu ${row.definition.abbreviation}`}>
                        {row.issues.map((issue, index) => (
                          <li className={issue.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"} key={`${issue.code}-${index}`}>
                            {issue.severity === "error" ? <CircleAlert className="mr-1 inline h-4 w-4" /> : <AlertTriangle className="mr-1 inline h-4 w-4" />}
                            {issueText(issue)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Abbrechen</Button>
          <Button type="button" onClick={handleImport} disabled={isBusy || selectedRows.length === 0}>
            {isBusy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
            Auswahl importieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

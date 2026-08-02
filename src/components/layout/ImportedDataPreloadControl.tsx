import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock3, DatabaseZap, HardDrive, Loader2, MemoryStick } from "lucide-react";
import { hasImportedData } from "@/data/db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  useImportedDataPreload,
  type ImportedDataPreloadRunner,
} from "@/hooks/useImportedDataPreload";
import { useOptionalImportController } from "@/hooks/useImportController";
import { preloadImportedData, type PreloadProgress } from "@/lib/preloadImportedData";
import { QUERY_CACHE_DURATION_MS } from "@/lib/queryCache";

/**
 * Die drei Abschnitte, die `preloadImportedData` nacheinander durchläuft. Der Dialog spiegelt damit
 * den echten Ablauf – vor allem den Rechenschritt am Ende, der den Großteil der Wartezeit ausmacht,
 * während die Fortschrittsleiste kaum noch steigt.
 */
const PRELOAD_STAGES: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Inventar erfassen",
    description: "Importierte Snapshots, Rohdaten-Sheets und Zusatzquellen ermitteln",
  },
  {
    title: "Daten in den Arbeitsspeicher laden",
    description: "RVTools-Entitäten und -Rohdaten, Tech-Info, CDP, IPAM, Eramon und vROps",
  },
  {
    title: "Fill-Up-Auswertung berechnen",
    description: "Workload-Durchschnitte und Clustervergleich für den neuesten vROps-Import",
  },
];

const STAGE_INDEX_BY_PHASE: Record<PreloadProgress["phase"], number> = {
  preparing: 0,
  loading: 1,
  computing: 2,
};

const STAGE_STATE_LABEL = {
  done: "abgeschlossen",
  active: "läuft",
  pending: "steht aus",
} as const;

interface ImportedDataPreloadControlProps {
  preload?: ImportedDataPreloadRunner;
  hasData?: () => Promise<boolean>;
}

export function ImportedDataPreloadControl({
  preload = preloadImportedData,
  hasData = hasImportedData,
}: ImportedDataPreloadControlProps) {
  const { data: dataAvailable = false, isPending: availabilityPending } = useQuery({
    queryKey: ["hasImportedData"],
    queryFn: hasData,
    staleTime: QUERY_CACHE_DURATION_MS,
  });
  const { status, progress, error, start, dismissError, isRunning, isPreloaded } = useImportedDataPreload(preload);
  const dialogOpen = status !== "idle";
  const activeStage = STAGE_INDEX_BY_PHASE[progress.phase] ?? 0;

  // Nach einem erfolgreichen Datei-Upload automatisch alle Daten vorladen.
  const importController = useOptionalImportController();
  const lastSeenSuccessSignal = useRef<number | null>(null);
  useEffect(() => {
    const signal = importController?.importSuccessSignal;
    if (signal === undefined) return;
    if (lastSeenSuccessSignal.current === null) {
      lastSeenSuccessSignal.current = signal;
      return;
    }
    if (signal !== lastSeenSuccessSignal.current) {
      lastSeenSuccessSignal.current = signal;
      void start();
    }
  }, [importController?.importSuccessSignal, start]);

  return (
    <>
      {dataAvailable && !availabilityPending && !isPreloaded && (
        <Button
          variant="destructive"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label="Alle importierten Daten vorladen"
          disabled={isRunning}
          onClick={() => void start()}
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {isRunning ? "Vorladen läuft…" : "Daten vorladen"}
        </Button>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !isRunning) dismissError();
        }}
      >
        <DialogContent
          className={`max-w-xl overflow-hidden border-border/80 p-0 shadow-2xl ${isRunning ? "[&>button]:hidden" : ""}`}
          overlayClassName="bg-background/75 backdrop-blur-md"
          onEscapeKeyDown={(event) => {
            if (isRunning) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isRunning) event.preventDefault();
          }}
        >
          <div className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5">
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                {status === "error" ? <AlertTriangle className="h-5 w-5" /> : <DatabaseZap className="h-5 w-5" />}
              </div>
              <DialogTitle>Daten vorladen und Auswertungen berechnen</DialogTitle>
              <DialogDescription className="leading-relaxed">
                Ein Durchlauf liest alle importierten Dateien aus der dauerhaften IndexedDB in den Arbeitsspeicher
                und berechnet die Fill-Up-Standardauswertung im Voraus. Danach öffnen sich die Analyseseiten sofort,
                ohne Nachladen und ohne Skeleton-Anzeigen.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 pb-6 pt-5">
            {status === "error" ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4" role="alert">
                <p className="text-sm font-medium text-destructive">Vorladen abgebrochen</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Bereits geladene Bereiche bleiben im Arbeitsspeicher. Starte den Durchlauf erneut, um die
                  restlichen Schritte nachzuholen.
                </p>
              </div>
            ) : (
              <div className="space-y-5" aria-live="polite">
                <ol className="space-y-0">
                  {PRELOAD_STAGES.map((stage, index) => {
                    const state = index < activeStage ? "done" : index === activeStage ? "active" : "pending";
                    const isLast = index === PRELOAD_STAGES.length - 1;
                    return (
                      <li key={stage.title} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors ${
                              state === "done"
                                ? "border-primary/30 bg-primary/15 text-primary"
                                : state === "active"
                                  ? "border-primary bg-background text-primary"
                                  : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            {state === "done" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : state === "active" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          {!isLast && (
                            <span
                              className={`w-px flex-1 ${index < activeStage ? "bg-primary/30" : "bg-border"}`}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                          <p
                            className={`text-sm font-medium leading-6 ${
                              state === "pending" ? "text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {stage.title}
                            <span className="sr-only"> – {STAGE_STATE_LABEL[state]}</span>
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{stage.description}</p>
                          {state === "active" && (
                            <p className="mt-1.5 truncate font-mono text-xs text-primary">{progress.currentLabel}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <div className="space-y-2 border-t border-border/60 pt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Gesamtfortschritt
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-primary">{progress.percent}%</span>
                  </div>
                  <Progress
                    value={progress.percent}
                    aria-label="Fortschritt beim Vorladen"
                    aria-valuenow={progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {progress.totalSteps > 0
                        ? `${progress.completedSteps.toLocaleString("de-DE")} von ${progress.totalSteps.toLocaleString("de-DE")} Bereichen`
                        : "Dateninventar wird vorbereitet"}
                    </span>
                    <span>{progress.processedRecords.toLocaleString("de-DE")} Datensätze verarbeitet</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <Clock3 className="h-4 w-4 text-primary" /> 1–2 Minuten
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Die Berechnung am Ende dauert am längsten. Lass den Tab so lange geöffnet.
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <MemoryStick className="h-4 w-4 text-primary" /> Rund eine Stunde gültig
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Reload, Tab schließen oder Speicherdruck leeren den Arbeitsspeicher früher.
                </p>
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border border-border/60 bg-background p-3 text-xs leading-relaxed text-muted-foreground">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Deine Importdaten in der IndexedDB bleiben unverändert. Das Vorladen legt nur eine temporäre Kopie
                im Arbeitsspeicher dieses Tabs an und schreibt nichts zurück.
              </p>
            </div>

            {status === "error" ? (
              <DialogFooter>
                <Button variant="outline" onClick={dismissError}>Schließen</Button>
                <Button onClick={() => void start()}>Erneut versuchen</Button>
              </DialogFooter>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

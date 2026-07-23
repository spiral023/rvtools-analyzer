import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, DatabaseZap, HardDrive, Loader2, MemoryStick } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useImportedDataPreload,
  type ImportedDataPreloadRunner,
} from "@/hooks/useImportedDataPreload";
import { preloadImportedData } from "@/lib/preloadImportedData";
import { QUERY_CACHE_DURATION_MS } from "@/lib/queryCache";

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
  const { status, progress, error, start, dismissError, isRunning } = useImportedDataPreload(preload);
  const dialogOpen = status !== "idle";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Alle importierten Daten vorladen"
            disabled={availabilityPending || !dataAvailable || isRunning}
            onClick={() => void start()}
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {dataAvailable ? "Alle importierten Daten vorladen" : "Keine importierten Daten vorhanden"}
        </TooltipContent>
      </Tooltip>

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
              <DialogTitle>Importierte Daten werden vorgeladen</DialogTitle>
              <DialogDescription className="leading-relaxed">
                Alle importierten Dateien werden aus der dauerhaften IndexedDB in den schnellen Arbeitsspeicher
                geladen. Dadurch erscheinen Analyseseiten beim Wechsel deutlich schneller und benötigen weniger
                Skeleton-Ladeanzeigen.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 pt-5 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <Clock3 className="h-4 w-4 text-primary" /> Etwa 1–3 Minuten
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Die Dauer hängt von Datenmenge, Gerät und Browser ab.
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <MemoryStick className="h-4 w-4 text-primary" /> Bis zu eine Stunde schnell
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Reload, Tab-Schließen oder Speicherdruck können den schnellen Cache früher leeren.
                </p>
              </div>
            </div>

            {status === "error" ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4" role="alert">
                <p className="text-sm font-medium text-destructive">Vorladen nicht abgeschlossen</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Bereits geladene Bereiche bleiben im Cache. Du kannst den Vorgang erneut starten.
                </p>
              </div>
            ) : (
              <div className="space-y-3" aria-live="polite">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aktueller Bereich</p>
                    <p className="mt-1 truncate text-sm font-medium">{progress.currentLabel}</p>
                  </div>
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
            )}

            <div className="flex gap-3 rounded-lg border border-border/60 bg-background p-3 text-xs leading-relaxed text-muted-foreground">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Deine dauerhaften Importdaten bleiben unverändert in IndexedDB gespeichert. Das Vorladen erzeugt
                nur eine schnelle, temporäre Kopie im Arbeitsspeicher des aktuellen Tabs.
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

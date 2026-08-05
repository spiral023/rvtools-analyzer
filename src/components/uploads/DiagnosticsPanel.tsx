import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Database, Gauge, HardDrive, Layers3, Timer } from "lucide-react";
import type { DiagnosticsResult } from "@/hooks/useDiagnostics";
import { formatBytes } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AnalysisExportCard } from "@/components/uploads/AnalysisExportCard";

/**
 * Messwerte und Analyse-Export der Diagnose. Der Auslöser für eine neue Messung liegt bewusst
 * nicht hier, sondern als „Aktualisieren“ in der Kopfzeile der Uploads-Seite – deshalb kommen
 * `data` und `isFetching` von außen und nicht aus einem eigenen `useDiagnostics`-Aufruf: zwei
 * Instanzen des Hooks hätten getrennte Abfragen, und der Knopf würde diese Ansicht nicht erneuern.
 */
export function DiagnosticsPanel({
  data,
  isFetching,
}: {
  data: DiagnosticsResult | undefined;
  isFetching: boolean;
}) {
  return (
    <div className="space-y-4">
      {data && (
        <section aria-label="Diagnose-Kennzahlen">
          <KpiGrid>
            <KpiCard title="Snapshots" value={data.snapshots.length.toLocaleString("de-DE")} subtitle="RVTools-Exporte" icon={<Database aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="IndexedDB-Einträge" value={data.stores.reduce((sum, store) => sum + store.count, 0).toLocaleString("de-DE")} subtitle="über alle Stores" icon={<HardDrive aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Speicher belegt" value={data.storage.supported ? formatBytes(data.storage.usageBytes) : "—"} subtitle="Browser-Schätzung" icon={<Gauge aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Daten-Stores" value={data.stores.length.toLocaleString("de-DE")} subtitle="IndexedDB-Bereiche" icon={<Layers3 aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Query-Cache" value={data.cache.reduce((sum, entry) => sum + entry.entryCount, 0).toLocaleString("de-DE")} subtitle="zwischengespeicherte Datensätze" icon={<Boxes aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Messungen" value={data.queryTimings.length.toLocaleString("de-DE")} subtitle="Seiten-Ladezeiten" icon={<Timer aria-hidden="true" className="h-4 w-4" />} />
          </KpiGrid>
        </section>
      )}

      {/* Steht außerhalb der `data`-Bedingung: der Export hängt an den importierten Daten,
          nicht an den Messwerten der Diagnose. */}
      <AnalysisExportCard />

      {!data && isFetching && (
        <p className="text-sm text-muted-foreground">Lade Diagnosedaten…</p>
      )}

      {data && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Datei- &amp; Datenvolumen pro Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.snapshots.length === 0 && <p className="text-sm text-muted-foreground">Keine Snapshots vorhanden.</p>}
                {data.snapshots.map((snapshot) => {
                  const totalRows = Object.values(snapshot.sheetStats).reduce((sum, value) => sum + value.rowCount, 0);
                  return (
                    <div key={snapshot.snapshotId} className="flex items-center justify-between gap-4 border-b border-border/40 py-2 text-sm last:border-0">
                      <span className="min-w-0 truncate font-medium" title={snapshot.fileName}>{snapshot.fileName}</span>
                      <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                        {snapshot.fileSizeBytes !== undefined ? formatBytes(snapshot.fileSizeBytes) : "k. A."}
                        {" · "}{totalRows.toLocaleString("de-DE")} Zeilen
                        {" · "}{snapshot.importDurationMs !== undefined ? `${(snapshot.importDurationMs / 1000).toFixed(1)} s Import` : "k. A."}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">IndexedDB-Auslastung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                Browser-Speicher gesamt: {data.storage.supported
                  ? `${formatBytes(data.storage.usageBytes)} von ${formatBytes(data.storage.quotaBytes)} Kontingent (Schätzung)`
                  : "nicht verfügbar in diesem Browser"}
              </p>
              <div className="space-y-1">
                {data.stores.map((store) => (
                  <div key={store.storeName} className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 truncate" title={store.storeName}>{store.storeName}</span>
                    <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                      {store.count.toLocaleString("de-DE")} Einträge · ~{formatBytes(store.estimatedSizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Beispiel-Abfrage: {data.sampleQuery.rowCount.toLocaleString("de-DE")} Zeilen in {data.sampleQuery.durationMs} ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Seiten-Ladezeiten (langsamste zuerst)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.queryTimings.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Messungen — beim Navigieren durch die Seiten werden hier die tatsächlichen Ladezeiten protokolliert.
                  </p>
                )}
                {data.queryTimings.map((timing) => (
                  <div key={timing.queryKey} className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 truncate font-mono-data" title={timing.queryKey}>{timing.queryKey}</span>
                    <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                      zuletzt {timing.lastDurationMs.toLocaleString("de-DE")} ms · Ø {timing.avgDurationMs.toLocaleString("de-DE")} ms
                      {" · "}{timing.lastRowCount.toLocaleString("de-DE")} Zeilen · {timing.sampleCount} Messung{timing.sampleCount !== 1 && "en"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Browser-Laufzeit</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                JS-Heap: {data.memory.supported
                  ? `${formatBytes(data.memory.usedJSHeapSizeBytes)} von ${formatBytes(data.memory.totalJSHeapSizeBytes)} belegt`
                  : "nicht verfügbar in diesem Browser"}
              </p>
              <div className="space-y-1">
                {data.cache.map((cacheEntry) => (
                  <div key={cacheEntry.queryKey} className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 truncate" title={cacheEntry.queryKey}>{cacheEntry.queryKey}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{cacheEntry.entryCount.toLocaleString("de-DE")} Datensätze im Cache</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
        </>
      )}
    </div>
  );
}

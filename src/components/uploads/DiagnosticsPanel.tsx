import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { formatBytes } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Database, Gauge, HardDrive, Timer } from "lucide-react";

export function DiagnosticsPanel() {
  const { data, isFetching, refresh } = useDiagnostics(true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Diagnose</h2>
          <p className="text-sm text-muted-foreground">Technischer Überblick über lokale Daten, Speicher und Ladezeiten.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Aktualisieren
        </Button>
      </div>

      {!data && isFetching && (
        <p className="text-sm text-muted-foreground">Lade Diagnosedaten…</p>
      )}

      {data && (
        <>
          <section aria-label="Diagnose-Kennzahlen" className="mb-4">
            <KpiGrid className="grid-cols-2 sm:grid-cols-4 md:grid-cols-4">
              <KpiCard title="Snapshots" value={data.snapshots.length.toLocaleString("de-DE")} subtitle="RVTools-Exporte" icon={<Database aria-hidden="true" className="h-4 w-4" />} />
              <KpiCard title="IndexedDB-Einträge" value={data.stores.reduce((sum, store) => sum + store.count, 0).toLocaleString("de-DE")} subtitle="über alle Stores" icon={<HardDrive aria-hidden="true" className="h-4 w-4" />} />
              <KpiCard title="Speicher belegt" value={data.storage.supported ? formatBytes(data.storage.usageBytes) : "—"} subtitle="Browser-Schätzung" icon={<Gauge aria-hidden="true" className="h-4 w-4" />} />
              <KpiCard title="Messungen" value={data.queryTimings.length.toLocaleString("de-DE")} subtitle="Seiten-Ladezeiten" icon={<Timer aria-hidden="true" className="h-4 w-4" />} />
            </KpiGrid>
          </section>

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

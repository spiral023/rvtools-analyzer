import { Link } from "react-router-dom";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";

export default function Diagnostics() {
  const { data, isFetching, refresh } = useDiagnostics(true);

  const handleRefresh = () => {
    refresh();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/upload">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">Diagnose</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Aktualisieren
        </Button>
      </div>

      {!data && isFetching && (
        <p className="text-sm text-muted-foreground">Lade Diagnosedaten…</p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Datei- &amp; Datenvolumen pro Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.snapshots.length === 0 && <p className="text-sm text-muted-foreground">Keine Snapshots vorhanden.</p>}
                {data.snapshots.map((s) => {
                  const totalRows = Object.values(s.sheetStats).reduce((sum, v) => sum + v.rowCount, 0);
                  return (
                    <div key={s.snapshotId} className="flex items-center justify-between text-sm border-b border-border/40 py-2 last:border-0">
                      <span className="font-medium">{s.fileName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.fileSizeBytes !== undefined ? formatBytes(s.fileSizeBytes) : "k. A."}
                        {" · "}{totalRows.toLocaleString("de-DE")} Zeilen
                        {" · "}{s.importDurationMs !== undefined ? `${(s.importDurationMs / 1000).toFixed(1)} s Import` : "k. A."}
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
                  <div key={store.storeName} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                    <span>{store.storeName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {store.count.toLocaleString("de-DE")} Einträge · ~{formatBytes(store.estimatedSizeBytes)} (geschätzt)
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Beispiel-Abfrage (alle VMs über alle Snapshots): {data.sampleQuery.rowCount.toLocaleString("de-DE")} Zeilen in {data.sampleQuery.durationMs} ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Seiten-Ladezeiten (langsamste zuerst)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.queryTimings.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Messungen — beim Navigieren durch die Seiten werden hier die tatsächlichen Ladezeiten je Datenquelle protokolliert.
                  </p>
                )}
                {data.queryTimings.map((t) => (
                  <div key={t.queryKey} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                    <span className="font-mono-data">{t.queryKey}</span>
                    <span className="text-muted-foreground tabular-nums">
                      zuletzt {t.lastDurationMs.toLocaleString("de-DE")} ms · Ø {t.avgDurationMs.toLocaleString("de-DE")} ms
                      {" · "}{t.lastRowCount.toLocaleString("de-DE")} Zeilen · {t.sampleCount} Messung{t.sampleCount !== 1 && "en"}
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
                {data.cache.map((c) => (
                  <div key={c.queryKey} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                    <span>{c.queryKey}</span>
                    <span className="text-muted-foreground tabular-nums">{c.entryCount.toLocaleString("de-DE")} Datensätze im Cache</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

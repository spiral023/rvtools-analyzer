import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { useAnalysisExport } from "@/hooks/useAnalysisExport";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, RefreshCw, Loader2, Download } from "lucide-react";
import { formatBytes } from "@/lib/utils";

export default function Diagnostics() {
  const { data, isFetching, refresh } = useDiagnostics(true);
  const { exportData, isExporting, progressLabel } = useAnalysisExport();
  const [includeSeries, setIncludeSeries] = useState(true);
  const [pseudonymize, setPseudonymize] = useState(true);

  const handleRefresh = () => {
    refresh();
  };

  const handleExport = async () => {
    try {
      const result = await exportData({ includeSeries, pseudonymize });
      toast.success("Analyse-Export erstellt", {
        description: `${result.fileName} · ${formatBytes(result.sizeBytes)} · ${result.vmCount.toLocaleString("de-DE")} VMs · ${result.seriesFileCount} Messreihen`,
      });
    } catch (error) {
      toast.error("Analyse-Export fehlgeschlagen", {
        description: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    }
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

      <Card>
        <CardHeader><CardTitle className="text-sm">Analyse-Export</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Inventar, berechnete Profilkennzahlen und die stündlichen vROps-Rohreihen in einem
            speicheroptimierten Format. Die Messreihen werden als Differenzwerte statt mit
            wiederholten Zeitstempeln gespeichert — dadurch bleibt der Export auch bei mehreren
            tausend VMs und einem Monat Messwerten bei wenigen MB.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="analysis-export-series" className="text-sm">Stündliche Rohreihen einschließen</Label>
                <p className="text-xs text-muted-foreground">
                  Ohne Rohreihen enthält der Export nur die verdichteten Kennzahlen und bleibt unter einem MB.
                </p>
              </div>
              <Switch id="analysis-export-series" checked={includeSeries} onCheckedChange={setIncludeSeries} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="analysis-export-pseudonym" className="text-sm">Pseudonymisieren</Label>
                <p className="text-xs text-muted-foreground">
                  Ersetzt Namen durch Kürzel, die über mehrere Exporte hinweg stabil bleiben und damit vergleichbar sind.
                </p>
              </div>
              <Switch id="analysis-export-pseudonym" checked={pseudonymize} onCheckedChange={setPseudonymize} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Analyse-Export herunterladen
            </Button>
            {progressLabel && <span className="text-xs text-muted-foreground">{progressLabel}</span>}
          </div>
        </CardContent>
      </Card>

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

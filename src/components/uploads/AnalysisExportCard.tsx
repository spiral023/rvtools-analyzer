import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAnalysisExport } from "@/hooks/useAnalysisExport";
import { formatBytes } from "@/lib/utils";

/**
 * Erzeugt den speicheroptimierten Analyse-Export für die externe Auswertung des
 * CPU-Rightsizings. Bewusst in der Diagnose angesiedelt: Der Export richtet sich
 * an Auswertungswerkzeuge, nicht an Berichtsempfänger — dafür gibt es das
 * Export Studio.
 */
export function AnalysisExportCard() {
  const { exportData, isExporting, progressLabel } = useAnalysisExport();
  const [includeSeries, setIncludeSeries] = useState(true);
  const [pseudonymize, setPseudonymize] = useState(true);

  const handleExport = async () => {
    try {
      const result = await exportData({ includeSeries, pseudonymize });
      toast.success("Analyse-Export erstellt", {
        description: `${result.fileName} · ${formatBytes(result.sizeBytes)} · `
          + `${result.vmCount.toLocaleString("de-DE")} VMs · ${result.seriesFileCount} Messreihen`,
        duration: 10_000,
      });
    } catch (error) {
      toast.error("Analyse-Export fehlgeschlagen", {
        description: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Analyse-Export</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Inventar, berechnete Profilkennzahlen und die stündlichen vROps-Rohreihen als ZIP.
          Die Messreihen werden als Differenzwerte gespeichert statt mit einem wiederholten
          Zeitstempel je Messpunkt — dadurch bleibt der Export auch bei mehreren tausend VMs
          und einem Monat Messwerten überschaubar.
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
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Analyse-Export herunterladen
          </Button>
          {progressLabel && <span className="text-xs text-muted-foreground">{progressLabel}</span>}
        </div>
        {isExporting && (
          <p className="text-xs text-muted-foreground">
            Bei mehreren tausend VMs über einen Monat dauert das ein bis drei Minuten; die Oberfläche
            reagiert währenddessen verzögert.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

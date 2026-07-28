import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { VropsDataQualityReport, VropsTimeSeriesImport } from "@/domain/models/types";
import type { GlossaryEntry } from "@/lib/glossary";
import { FILL_UP_UI } from "@/lib/glossaries/planning";

const CONFIDENCE_LABEL = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" } as const;

export function VropsDataQualityCard({ importMeta, quality }: { importMeta: VropsTimeSeriesImport | null; quality: VropsDataQualityReport | null }) {
  if (!importMeta) return <Card className="border-dashed"><CardContent className="py-5 text-sm text-muted-foreground">Wähle einen vollständigen VM-, Cluster- und Host-Zeitreihenimport, um die Fill-Up-Berechnung zu starten.</CardContent></Card>;
  const blocking = quality?.findings.filter((finding) => finding.severity === "blocking").length ?? 0;
  const warnings = quality?.findings.filter((finding) => finding.severity === "warning").length ?? 0;
  const confidence = quality?.confidence ?? "not-computable";
  return <Card className="border-l-4 border-l-primary">
    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-3"><div><InfoTooltip entry={FILL_UP_UI.dataQuality} side="right"><CardTitle className="w-fit cursor-help text-base">Datenstand & Vertrauensniveau</CardTitle></InfoTooltip><CardDescription>{importMeta.expectedSlots.toLocaleString("de-DE")} erwartete Stunden · {new Date(importMeta.rangeStartUtc).toLocaleDateString("de-DE")} bis {new Date(importMeta.rangeEndUtc).toLocaleDateString("de-DE")}</CardDescription></div><Badge variant={confidence === "high" ? "default" : confidence === "not-computable" ? "destructive" : "secondary"}>Vertrauen: {CONFIDENCE_LABEL[confidence]}</Badge></CardHeader>
    <CardContent className="grid gap-3 text-sm sm:grid-cols-3"><Fact label="Objekte" entry={FILL_UP_UI.dataObjects} value={Object.values(importMeta.qualitySummary.objectCountByType).reduce((sum, count) => sum + count, 0)} /><Fact label="Blockierende Befunde" entry={FILL_UP_UI.blockingFindings} value={blocking} danger={blocking > 0} /><Fact label="Warnungen" entry={FILL_UP_UI.warnings} value={warnings} /></CardContent>
  </Card>;
}

function Fact({ label, entry, value, danger }: { label: string; entry: GlossaryEntry; value: number; danger?: boolean }) {
  return <div className="rounded-md border bg-muted/20 px-3 py-2"><InfoTooltip entry={entry} side="bottom"><p className="w-fit cursor-help text-xs text-muted-foreground">{label}</p></InfoTooltip><p className={danger ? "font-mono text-lg font-semibold text-destructive" : "font-mono text-lg font-semibold"}>{value.toLocaleString("de-DE")}</p></div>;
}

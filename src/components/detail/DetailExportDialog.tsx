import { useState } from "react";
import {
  ClipboardCopy,
  Download,
  FileCode2,
  FileText,
  Loader2,
  Share2,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildDossierConfluence,
  buildDossierJson,
  buildDossierMarkdown,
  detailFileName,
  downloadDetailText,
  pseudonymizeDetailDossier,
  type DetailDossier,
  type DetailExportOptions,
} from "@/lib/detailExport";

type FileFormat = "markdown" | "confluence" | "json" | "pdf";
type CopyFormat = "markdown" | "confluence" | "json";

/**
 * Einziger Ausgang der Detailansichten: Kopieren und Exportieren teilen einen Dialog, weil sie
 * dieselben Einstellungen brauchen (Pseudonymisierung, Umfang der Zeitreihe) und sich nur im Ziel
 * unterscheiden. Aufgebaut wie der Tabellenexport – Datei links, Zwischenablage rechts.
 */
export function DetailExportDialog({ dossier }: { dossier: DetailDossier }) {
  const [open, setOpen] = useState(false);
  const [pseudonymized, setPseudonymized] = useState(false);
  const [includeTimeSeries, setIncludeTimeSeries] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const trendPointCount = dossier.trend?.points.length ?? 0;
  const exportDossier = pseudonymized ? pseudonymizeDetailDossier(dossier) : dossier;
  // PDF und Durchschnittswoche bleiben verdichtet; die Rohreihe wirkt nur auf Text- und JSON-Ausgaben.
  const options: DetailExportOptions = { pseudonymized, includeTimeSeries };

  const buildContent = (format: FileFormat | CopyFormat): string => {
    if (format === "json") return buildDossierJson(exportDossier, pseudonymized, options);
    if (format === "confluence") return buildDossierConfluence(exportDossier, pseudonymized, options);
    return buildDossierMarkdown(exportDossier, pseudonymized, options);
  };

  const exportFile = (format: Exclude<FileFormat, "pdf">) => {
    const extensions: Record<Exclude<FileFormat, "pdf">, string> = {
      markdown: "md",
      confluence: "txt",
      json: "json",
    };
    const labels: Record<Exclude<FileFormat, "pdf">, string> = {
      markdown: "Markdown",
      confluence: "Confluence Wiki",
      json: "JSON",
    };
    downloadDetailText(
      buildContent(format),
      detailFileName(dossier.kind, exportDossier.title, pseudonymized, extensions[format]),
      format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
    );
    toast.success(`${labels[format]} wurde exportiert.`);
    setOpen(false);
  };

  const copyToClipboard = async (format: CopyFormat) => {
    const labels: Record<CopyFormat, string> = {
      markdown: "Markdown",
      confluence: "Confluence Wiki-Markup",
      json: "JSON",
    };
    try {
      await navigator.clipboard.writeText(buildContent(format));
      toast.success(`${labels[format]} wurde in die Zwischenablage kopiert.`);
      setOpen(false);
    } catch {
      toast.error(`${labels[format]} konnte nicht kopiert werden.`);
    }
  };

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const [{ pdf }, { SystemDossierPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/detail/SystemDossierPdf"),
      ]);
      const blob = await pdf(<SystemDossierPdf dossier={exportDossier} pseudonymized={pseudonymized} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = detailFileName(dossier.kind, exportDossier.title, pseudonymized, "pdf");
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF-Datenblatt wurde erstellt.");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Das PDF-Datenblatt konnte nicht erstellt werden.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="min-h-10 px-3.5">
          <Share2 />
          Kopieren / Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5 pr-14">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <Download className="h-4 w-4" aria-hidden="true" /> Systemdatenblatt
          </div>
          <DialogTitle className="text-balance">{dossier.kind} {dossier.title} weitergeben</DialogTitle>
          <DialogDescription>
            Enthalten sind {dossier.kpis.length} Kennzahlen und {dossier.sections.length} Abschnitte
            – genau die Inhalte der geöffneten Detailansicht.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
            <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-semibold">Als Datei</h3></div>
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => exportFile("markdown")}><FileText className="h-4 w-4" /> Markdown (.md)</Button>
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => exportFile("confluence")}><FileCode2 className="h-4 w-4" /> Confluence Wiki (.txt)</Button>
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => exportFile("json")}><FileCode2 className="h-4 w-4" /> JSON (.json)</Button>
              <Button type="button" variant="outline" className="justify-start gap-2" disabled={pdfBusy} onClick={() => void exportPdf()}>
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF · A4
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
            <div className="mb-3 flex items-center gap-2"><ClipboardCopy className="h-4 w-4 text-primary" /><h3 className="font-semibold">In die Zwischenablage</h3></div>
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void copyToClipboard("markdown")}><ClipboardCopy className="h-4 w-4" /> Markdown</Button>
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void copyToClipboard("confluence")}><ClipboardCopy className="h-4 w-4" /> Confluence Wiki-Markup</Button>
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void copyToClipboard("json")}><ClipboardCopy className="h-4 w-4" /> JSON</Button>
            </div>
          </section>
        </div>

        <div className="space-y-3 border-t border-border/60 bg-muted/10 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={pseudonymized}
              onCheckedChange={(checked) => setPseudonymized(checked === true)}
              aria-label="Pseudonymisierte Fassung"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-3.5 text-primary" />Pseudonymisierte Fassung</span>
              <span className="block text-[11px] text-muted-foreground">Bezeichner, Personen, Texte und Netzwerkdaten ersetzen</span>
            </span>
          </label>

          {trendPointCount > 0 && (
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={includeTimeSeries}
                onCheckedChange={(checked) => setIncludeTimeSeries(checked === true)}
                aria-label="Vollständige vROps-Zeitreihe einschließen"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium"><Waves className="size-3.5 text-primary" />Vollständige vROps-Zeitreihe einschließen</span>
                <span className="block text-[11px] text-muted-foreground">
                  {trendPointCount.toLocaleString("de-DE")} stündliche Messpunkte unverdichtet – für eine Analyse
                  durch ein LLM. Wirkt auf Markdown, Confluence und JSON; PDF bleibt verdichtet.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

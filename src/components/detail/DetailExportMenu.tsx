import { useState } from "react";
import { ChevronDown, Copy, Download, FileCode2, FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildDossierConfluence,
  buildDossierMarkdown,
  detailFileName,
  downloadDetailText,
  pseudonymizeDetailDossier,
  type DetailDossier,
} from "@/lib/detailExport";

export function DetailExportMenu({ dossier }: { dossier: DetailDossier }) {
  const [pseudonymized, setPseudonymized] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const exportDossier = pseudonymized ? pseudonymizeDetailDossier(dossier) : dossier;

  const exportText = (format: "markdown" | "confluence") => {
    const markdown = format === "markdown";
    const content = markdown
      ? buildDossierMarkdown(exportDossier, pseudonymized)
      : buildDossierConfluence(exportDossier, pseudonymized);
    downloadDetailText(
      content,
      detailFileName(dossier.kind, exportDossier.title, pseudonymized, markdown ? "md" : "txt"),
      "text/plain;charset=utf-8",
    );
    toast.success(`${markdown ? "Markdown" : "Confluence Wiki"} wurde exportiert.`);
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildDossierMarkdown(exportDossier, pseudonymized));
      toast.success("Markdown wurde in die Zwischenablage kopiert.");
    } catch {
      toast.error("Markdown konnte nicht kopiert werden.");
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
    } catch (error) {
      console.error(error);
      toast.error("Das PDF-Datenblatt konnte nicht erstellt werden.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10"
        onClick={() => void copyMarkdown()}
        aria-label={`${dossier.kind}-Details als Markdown kopieren`}
        title="Markdown kopieren"
      >
        <Copy className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="min-h-10 pl-3.5 pr-3 transition-[color,background-color,box-shadow,transform]"
            disabled={pdfBusy}
          >
            {pdfBusy ? <Loader2 className="animate-spin" /> : <Download />}
            Exportieren
            <ChevronDown className="ml-0.5 size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-xl p-1.5 shadow-xl">
        <DropdownMenuLabel className="px-2.5 pb-0.5 pt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Systemdatenblatt
        </DropdownMenuLabel>
        <DropdownMenuItem className="min-h-10 rounded-lg px-2.5" onSelect={() => exportText("markdown")}>
          <FileText className="mr-2 size-4 text-muted-foreground" />
          <span><span className="block">Markdown</span><span className="block text-[11px] text-muted-foreground">Strukturiertes .md-Dokument</span></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 rounded-lg px-2.5" onSelect={() => exportText("confluence")}>
          <FileCode2 className="mr-2 size-4 text-muted-foreground" />
          <span><span className="block">Confluence Wiki</span><span className="block text-[11px] text-muted-foreground">Wiki-Markup zum Einfügen</span></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 rounded-lg px-2.5" onSelect={() => void exportPdf()}>
          <Download className="mr-2 size-4 text-muted-foreground" />
          <span><span className="block">PDF · A4</span><span className="block text-[11px] text-muted-foreground">Durchsuchbares Light-Mode-Datenblatt</span></span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuCheckboxItem
          checked={pseudonymized}
          onCheckedChange={(checked) => setPseudonymized(checked === true)}
          onSelect={(event) => event.preventDefault()}
          className="min-h-11 rounded-lg py-2 pl-9 pr-2.5"
        >
          <ShieldCheck className="mr-2 size-4 text-primary" />
          <span>
            <span className="block">Pseudonymisierte Fassung</span>
            <span className="block text-[11px] font-normal text-muted-foreground">Bezeichner, Personen, Texte und Netzwerkdaten ersetzen</span>
          </span>
        </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

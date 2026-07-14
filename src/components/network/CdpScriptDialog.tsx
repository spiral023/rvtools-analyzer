import { useEffect, useState } from "react";
import { Highlight, Prism, themes } from "prism-react-renderer";
import { Copy, Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/app/layout/ThemeProvider";
import { downloadTextFile } from "@/lib/export/tableExport";
import cdpScriptSource from "@/../scripts/Get-CdpNetworkInfo.ps1?raw";

const SCRIPT_FILE_NAME = "Get-CdpNetworkInfo.ps1";

/**
 * prism-react-renderer bündelt eine eigene Prism-Instanz, liefert aber keine
 * PowerShell-Grammatik mit. Die Grammatik-Datei aus `prismjs` registriert sich
 * auf dem globalen `Prism`, daher muss dieser vor dem Import gesetzt sein. Der
 * Import läuft asynchron (eigener Chunk) – bis er fertig ist, zeigen wir den
 * Code ungefärbt an und färben danach nach.
 */
function usePowershellGrammar(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
    void import("prismjs/components/prism-powershell").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

interface CdpScriptDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CdpScriptDialog({ open, onClose }: CdpScriptDialogProps) {
  const { theme } = useTheme();
  const grammarReady = usePowershellGrammar();
  const prismTheme = theme === "light" ? themes.vsLight : themes.vsDark;

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(cdpScriptSource);
      toast.success("Skript in die Zwischenablage kopiert.");
    } catch {
      toast.error("Skript konnte nicht kopiert werden.");
    }
  };

  const downloadScript = () => {
    downloadTextFile(cdpScriptSource, SCRIPT_FILE_NAME, "text/plain;charset=utf-8");
    toast.success(`„${SCRIPT_FILE_NAME}" wird heruntergeladen.`);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileCode2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold">CDP-Abruf-Skript (PowerCLI)</DialogTitle>
              <DialogDescription className="text-xs">
                Liest die CDP-Daten aller ESXi-Hosts eines vCenters aus und erzeugt eine
                CSV, die sich hier importieren lässt. Voraussetzung: VMware PowerCLI.
              </DialogDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyScript()}>
              <Copy className="mr-1.5 h-4 w-4" />
              Kopieren
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadScript}>
              <Download className="mr-1.5 h-4 w-4" />
              Als .ps1 herunterladen
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
          <Highlight
            theme={prismTheme}
            code={cdpScriptSource.replace(/\n$/, "")}
            language={grammarReady ? "powershell" : "plaintext"}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={`${className} m-0 p-4 text-xs leading-relaxed`} style={style}>
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line });
                  return (
                    <div key={i} {...lineProps} className={`${lineProps.className} table-row`}>
                      <span className="table-cell select-none pr-4 text-right text-muted-foreground/50 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="table-cell">
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        </div>
      </DialogContent>
    </Dialog>
  );
}

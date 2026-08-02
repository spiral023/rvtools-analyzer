import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { buildAnalysisErrorReport } from "@/lib/analysisErrorReport";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Zwischenablage ist nicht verfügbar.");
}

export function AnalysisErrorPage({ error }: { error: unknown }) {
  const [report] = useState(() => buildAnalysisErrorReport(error, {
    pathname: window.location.pathname,
    search: window.location.search,
    href: window.location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    appVersion: __APP_VERSION__,
    buildTime: __BUILD_TIME__,
  }));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyReport = async () => {
    try {
      await copyText(report.copyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/35 px-4 py-10 sm:px-6">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,hsl(var(--destructive)/0.08),transparent_34%),radial-gradient(circle_at_82%_82%,hsl(var(--primary)/0.07),transparent_32%)]" />
      <section role="alert" className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_24px_80px_hsl(var(--foreground)/0.12)]">
        <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="flex flex-row items-center gap-4 border-b border-border/70 bg-destructive/[0.055] px-5 py-5 lg:flex-col lg:items-start lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/15">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-destructive">Analyse gestoppt</p>
              <p className="mt-1 font-mono text-xs font-semibold tabular-nums">{report.id}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{report.area}</p>
            </div>
          </aside>

          <div className="space-y-6 p-5 sm:p-7 lg:p-8">
            <header>
              <p className="text-xs font-semibold text-destructive">{report.category}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{report.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">{report.summary}</p>
            </header>

            <div className="rounded-xl bg-muted/45 p-4 shadow-[inset_3px_0_0_hsl(var(--destructive))]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Empfohlener nächster Schritt</p>
              <p className="mt-1.5 text-sm leading-6">{report.nextStep}</p>
            </div>

            <details className="group rounded-xl border border-border/75 bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium marker:hidden">
                <span>Technische Analysedetails</span>
                <span className="font-mono text-[10px] text-muted-foreground group-open:hidden">anzeigen</span>
                <span className="hidden font-mono text-[10px] text-muted-foreground group-open:inline">ausblenden</span>
              </summary>
              <div className="border-t border-border/70 px-4 py-3">
                <dl className="grid gap-3 text-xs sm:grid-cols-[120px_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">Fehlertyp</dt>
                  <dd className="break-words font-mono">{report.errorName}</dd>
                  <dt className="text-muted-foreground">Meldung</dt>
                  <dd className="break-words font-mono leading-5">{report.message}</dd>
                </dl>
                {report.stack && <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/55 p-3 font-mono text-[10px] leading-5 text-muted-foreground">{report.stack}</pre>}
              </div>
            </details>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" onClick={() => window.location.reload()} className="min-h-11">
                  <RefreshCw className="size-4" /> Neu laden
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/overview"><ArrowLeft className="size-4" /> Zur Übersicht</Link>
                </Button>
              </div>
              <Button type="button" variant="secondary" onClick={() => void copyReport()} className="min-h-11">
                {copyState === "copied" ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                {copyState === "copied" ? "Analysedetails kopiert" : "Analysedetails kopieren"}
              </Button>
            </div>
            <p aria-live="polite" className="text-right text-[11px] text-muted-foreground">
              {copyState === "failed"
                ? "Kopieren war nicht möglich. Öffne die technischen Details und kopiere den Text manuell."
                : "Der Bericht enthält Laufzeit- und Browserdaten, aber keine importierten Tabellen oder Zeitreihen."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

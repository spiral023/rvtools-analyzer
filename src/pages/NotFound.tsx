import { useEffect } from "react";
import { ArrowLeft, AlertTriangle, Upload } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-[calc(100svh-3.5rem)] items-center justify-center overflow-hidden bg-muted/35 px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,hsl(var(--destructive)/0.08),transparent_34%),radial-gradient(circle_at_82%_82%,hsl(var(--primary)/0.07),transparent_32%)]"
      />
      <section
        role="alert"
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_24px_80px_hsl(var(--foreground)/0.12)]"
      >
        <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="flex flex-row items-center gap-4 border-b border-border/70 bg-destructive/[0.055] px-5 py-5 lg:flex-col lg:items-start lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/15">
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-destructive">Navigation</p>
              <p className="mt-1 font-mono text-xs font-semibold tabular-nums">404 / NOT FOUND</p>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{location.pathname}</p>
            </div>
          </aside>

          <div className="space-y-6 p-5 sm:p-7 lg:p-8">
            <header>
              <p className="text-xs font-semibold text-destructive">404 · ROUTE NICHT GEFUNDEN</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Diese Seite gibt es nicht.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
                Der angeforderte Pfad konnte nicht gefunden werden. Prüfe die Adresse oder kehre zur Übersicht zurück.
              </p>
            </header>

            <div className="rounded-xl bg-muted/45 p-4 shadow-[inset_3px_0_0_hsl(var(--destructive))]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Empfohlener nächster Schritt</p>
              <p className="mt-1.5 text-sm leading-6">Kehre zur Übersicht zurück oder starte einen neuen Upload.</p>
            </div>

            <details className="group rounded-xl border border-border/75 bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium marker:hidden">
                <span>Angeforderten Pfad anzeigen</span>
                <span className="font-mono text-[10px] text-muted-foreground group-open:hidden">anzeigen</span>
                <span className="hidden font-mono text-[10px] text-muted-foreground group-open:inline">ausblenden</span>
              </summary>
              <div className="border-t border-border/70 px-4 py-3">
                <dl className="grid gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-muted-foreground">Pfad</dt>
                  <dd className="break-words font-mono text-xs">{location.pathname}</dd>
                </dl>
              </div>
            </details>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild className="min-h-11">
                <Link to="/overview">
                  <ArrowLeft className="size-4" />
                  Zur Übersicht
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/upload">
                  <Upload className="size-4" />
                  Zum Upload
                </Link>
              </Button>
            </div>

            <p className="text-right text-[11px] text-muted-foreground">HTTP 404 · Die Anwendung läuft weiter.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NotFound;

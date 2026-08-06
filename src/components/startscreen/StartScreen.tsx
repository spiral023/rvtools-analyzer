import { useState, type CSSProperties, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, Moon, Sun, Users } from "lucide-react";
import { useTheme } from "@/app/layout/ThemeProvider";
import { useImportController } from "@/hooks/useImportController";
import { StartScreenImportStatus } from "@/components/startscreen/StartScreenImportStatus";
import { dragContainsFiles } from "@/lib/fileDrag";
import { cn } from "@/lib/utils";

/**
 * Die beiden Datensatzarten, die die Anwendung annimmt. Sie sind keine Auswahl,
 * sondern eine Folge: Welcher Modus startet, erkennt der Import am Paketinhalt.
 * Deshalb stehen sie als Ergebniszweige unter der Ablagefläche, nicht als Buttons.
 */
const DATASET_MODES = [
  {
    icon: Boxes,
    /** Farbtoken aus dem App-Schema – der Startbildschirm führt keine eigenen Farben ein. */
    accentToken: "--primary",
    title: "Vollständiger Datensatz",
    description: "Der gesamte Analyzer-Bestand. Öffnet alle Auswertungen über die komplette Umgebung. Bitte etwas Geduld beim Ladevorgang.",
  },
  {
    icon: Users,
    accentToken: "--chart-4",
    title: "Bereichs-Datensatz",
    description: "Das Paket einer Abteilung oder eines Systemverantwortlichen. Öffnet den Bereichsmodus mit den eigenen Systemen im Fokus.",
  },
] as const;

/**
 * Erster Bildschirm, solange kein Datenbestand vorliegt – ohne Sidebar und ohne
 * Kopfleiste, weil ohne Daten keine Navigation etwas zu zeigen hätte.
 *
 * Die Ablagefläche nimmt Drops auf dem gesamten Bildschirm an, nicht nur innerhalb
 * ihres Rahmens: Wer eine Datei über ein leeres Fenster zieht, zielt nicht.
 */
export function StartScreen() {
  const { theme, toggleTheme } = useTheme();
  const { importing, items, importFiles, rejectedFileNames } = useImportController();
  const [dragActive, setDragActive] = useState(false);
  const showStatus = importing || items.length > 0;

  const handleDragOver = (event: DragEvent) => {
    if (!dragContainsFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (!importing) setDragActive(true);
  };

  const handleDrop = (event: DragEvent) => {
    if (!dragContainsFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragActive(false);
    if (!importing) void importFiles(event.dataTransfer.files);
  };

  return (
    <div
      className="startscreen-shell h-svh w-full overflow-y-auto bg-background text-foreground"
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.relatedTarget) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {/* Die Ablage gilt für das ganze Fenster – der Rahmen sagt das, ohne den Blick vom Panel zu ziehen. */}
      {dragActive ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 bg-primary/[0.04] shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
        />
      ) : null}
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
        <main className="startscreen-rise flex flex-1 flex-col justify-center gap-8 py-10 sm:gap-10">
          <div>
            <div className="flex items-center gap-4">
              <img
                src="/favicon-master.png"
                alt=""
                aria-hidden="true"
                className="startscreen-logo size-14 shrink-0 rounded-2xl object-cover sm:size-16"
              />
              <h1 className="startscreen-heading text-3xl font-semibold sm:text-4xl">
                RVTools Analyzer
              </h1>
            </div>
            <p className="mt-5 max-w-xl text-pretty leading-7 text-muted-foreground">
              Der Analyzer liest Systeminformationen aus VMware-Umgebungen – Cluster, Hosts,
              VMs, Netzwerk, Kapazität – und wertet sie vollständig in diesem Browser-Tab aus.
              Es wird nichts an einen Server gesendet.
            </p>
          </div>

          <section
            data-drag={dragActive ? "true" : "false"}
            aria-busy={importing}
            className={cn(
              "startscreen-panel relative overflow-hidden rounded-2xl border-2 border-dashed bg-card/40",
              dragActive ? "border-solid border-primary bg-primary/5" : "hover:border-primary/45",
            )}
          >
            {showStatus ? (
              <StartScreenImportStatus />
            ) : (
              <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-1 px-6 py-10 text-center">
                <input
                  type="file"
                  accept=".zip"
                  multiple
                  className="peer sr-only"
                  aria-label="ZIP-Datensatz auswählen"
                  onChange={(event) => {
                    if (event.target.files?.length) void importFiles(event.target.files);
                  }}
                />
                <span className="text-lg font-medium peer-focus-visible:underline peer-focus-visible:decoration-primary peer-focus-visible:underline-offset-4">
                  {dragActive ? "Loslassen zum Öffnen" : "ZIP-Datensatz hier ablegen"}
                </span>
                <span className="text-sm text-muted-foreground">oder klicken, um eine Datei auszuwählen</span>
                <span className="mt-4 font-mono-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  .zip · ablage überall im fenster
                </span>
              </label>
            )}
          </section>

          {rejectedFileNames.length > 0 ? (
            <p role="alert" className="-mt-4 flex items-start gap-2 text-sm text-destructive sm:-mt-6">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Nicht unterstützt: {rejectedFileNames.join(", ")}
            </p>
          ) : null}

          <section>
            <div className="flex items-center gap-3">
              <h2 className="font-mono-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Der Datensatz bestimmt den Modus
              </h2>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {DATASET_MODES.map(({ icon: Icon, accentToken, title, description }) => (
                <article
                  key={title}
                  className="startscreen-mode"
                  style={{ "--startscreen-mode-accent": `var(${accentToken})` } as CSSProperties}
                >
                  <Icon className="size-4" style={{ color: `hsl(var(${accentToken}))` }} aria-hidden="true" />
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                </article>
              ))}
            </div>
          </section>
        </main>

        {/* Nebenschalter gehören zusammen: Design und Impressum stehen in derselben Zeile. */}
        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="font-mono-data uppercase tracking-[0.14em]">
            Verarbeitung im Browser · Speicherung lokal · kein Server
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              {theme === "dark" ? "Hell" : "Dunkel"}
            </button>
            <Link
              to="/impressum"
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Impressum
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

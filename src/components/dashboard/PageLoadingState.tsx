import { Skeleton } from "@/components/ui/skeleton";

interface PageLoadingStateProps {
  /** Seitentitel, damit die Überschrift beim Umschlagen von Laden → Inhalt nicht springt. */
  title: string;
}

/**
 * Platzhalter, solange die Snapshot-Metadaten noch aus IndexedDB geladen werden.
 * Verhindert, dass Seiten fälschlich "Keine Daten" anzeigen, bevor die
 * snapshots-Query abgeschlossen ist.
 */
export function PageLoadingState({ title }: PageLoadingStateProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">{title}</h1>
      <PanelLoadingState />
    </div>
  );
}

/**
 * Wie {@link PageLoadingState}, aber ohne eigene Überschrift — für Panels
 * innerhalb einer Tab-Ansicht, deren Seitentitel bereits von der übergeordneten
 * Seite gerendert wird (z. B. die Netzwerk-Tabs).
 */
export function PanelLoadingState() {
  return (
    <div role="status" aria-label="Daten werden geladen" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { fileKindLabel, useImportController, type ImportQueueItem } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";

/**
 * Verlauf des laufenden Imports, dargestellt an der Stelle der Ablagefläche: Der
 * Bildschirm füllt sich genau dort, wo eben noch die Aufforderung stand. Nach einem
 * erfolgreichen Import verschwindet der Startbildschirm ohnehin – sichtbar bleibt
 * diese Ansicht also vor allem für Fortschritt und Fehlschläge.
 */
export function StartScreenImportStatus() {
  const { importing, items } = useImportController();
  const failed = items.filter((item) => item.status === "error");

  return (
    <div aria-live="polite" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        {importing ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        ) : failed.length > 0 ? (
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
        )}
        <p className="text-sm font-medium">
          {importing
            ? "Datensatz wird gelesen"
            : failed.length > 0
              ? "Datensatz konnte nicht gelesen werden"
              : "Datensatz gelesen"}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <ImportQueueRow key={item.id} item={item} />
        ))}
      </ul>

      {failed.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Lege einen anderen Datensatz ab, um es erneut zu versuchen.
        </p>
      ) : null}
    </div>
  );
}

function ImportQueueRow({ item }: { item: ImportQueueItem }) {
  const percent = item.progress?.percent ?? (item.status === "queued" ? 0 : 100);

  return (
    <li className="flex flex-col gap-1.5 rounded-lg bg-background/60 px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{item.fileName}</span>
        {item.fileKind ? (
          <span className="hidden shrink-0 font-mono-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            {fileKindLabel(item.fileKind)}
          </span>
        ) : null}
        <span className="shrink-0 font-mono-data text-[11px] tabular-nums text-muted-foreground">
          {item.status === "error" ? <X className="size-3.5 text-destructive" aria-label="fehlgeschlagen" /> : `${percent} %`}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            item.status === "error" ? "bg-destructive" : item.status === "warning" ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {item.progress?.step ? (
        <p className="truncate text-xs text-muted-foreground">{item.progress.step}</p>
      ) : null}
      {item.result?.errors.length ? (
        <p className="text-xs text-destructive">{item.result.errors.join(", ")}</p>
      ) : null}
    </li>
  );
}

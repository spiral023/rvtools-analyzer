import { fileKindLabel, useImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";

export function OnboardingImportStatus() {
  const { importing, items } = useImportController();
  const item =
    items.find((entry) => entry.status === "running") ??
    items.find((entry) => entry.status === "queued") ??
    items.at(-1);

  if (!item) return null;

  const label = importing
    ? item.progress?.step ?? "Import läuft"
    : item.status === "error"
      ? "Import fehlgeschlagen"
      : item.status === "warning"
        ? "Import mit Warnungen abgeschlossen"
        : "Import abgeschlossen";

  return (
    <div
      aria-live="polite"
      className="flex min-w-0 items-center rounded-full border bg-background/80 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
    >
      <span
        className={cn(
          "mr-2 inline-block h-2 w-2 shrink-0 rounded-full",
          importing
            ? "animate-pulse bg-primary"
            : item.status === "error"
              ? "bg-destructive"
              : item.status === "warning"
                ? "bg-warning"
                : "bg-success",
        )}
        aria-hidden="true"
      />
      <span className="shrink-0">{label}</span>
      <span className="ml-2 hidden max-w-40 truncate text-muted-foreground sm:inline">
        {item.fileName}
      </span>
      {item.fileKind ? (
        <span className="ml-2 hidden shrink-0 font-mono text-muted-foreground lg:inline">
          {fileKindLabel(item.fileKind)}
        </span>
      ) : null}
      {item.progress ? (
        <span className="ml-2 shrink-0 font-mono text-muted-foreground">
          {item.progress.percent} %
        </span>
      ) : null}
    </div>
  );
}

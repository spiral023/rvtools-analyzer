import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { useImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";

export function OnboardingImportPage() {
  const { importing, items, importFiles, rejectedFileNames } = useImportController();
  const [dragOver, setDragOver] = useState(false);
  const notices = items.flatMap((item) => [
    ...(item.result?.warnings.map((message) => ({
      key: `${item.id}-warning-${message}`,
      message: `${item.fileName}: ${message}`,
      tone: "warning" as const,
    })) ?? []),
    ...(item.result?.errors.map((message) => ({
      key: `${item.id}-error-${message}`,
      message: `${item.fileName}: ${message}`,
      tone: "error" as const,
    })) ?? []),
  ]);

  return (
    <section className="onboarding-stagger mx-auto flex min-h-full max-w-4xl flex-col justify-center">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
        Daten importieren
      </p>
      <h2
        tabIndex={-1}
        className="onboarding-heading mt-3 text-3xl font-semibold tracking-tight sm:text-5xl"
      >
        Datenbasis hinzufügen
      </h2>
      <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
        Mehrere RVTools-, Tech-Info-Server- und Tech-Info-Client-Dateien können
        gemeinsam ausgewählt werden. Die Tour läuft während des Imports weiter.
      </p>
      <label
        className={cn(
          "mt-8 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 p-8 text-center transition-[border-color,background-color,transform]",
          dragOver && "scale-[1.01] border-primary bg-primary/5",
          importing && "cursor-progress",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!importing) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!importing) void importFiles(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          disabled={importing}
          className="sr-only"
          aria-label="RVTools- und Tech-Info-Excel-Dateien auswählen"
          onChange={(event) => {
            if (event.target.files) void importFiles(event.target.files);
          }}
        />
        {importing ? (
          <FileSpreadsheet className="h-10 w-10 animate-pulse text-primary" aria-hidden="true" />
        ) : (
          <Upload className="h-10 w-10 text-primary" aria-hidden="true" />
        )}
        <strong className="mt-4">Excel-Dateien ablegen oder auswählen</strong>
        <span className="mt-2 font-mono text-xs text-muted-foreground">
          .XLSX · .XLS · MEHRFACHAUSWAHL
        </span>
      </label>
      {rejectedFileNames.length > 0 ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Nicht unterstützt: {rejectedFileNames.join(", ")}
        </p>
      ) : null}
      {notices.length > 0 ? (
        <div className="mt-4 max-h-28 space-y-2 overflow-y-auto rounded-xl border bg-card/60 p-3">
          {notices.map((notice) => (
            <p
              key={notice.key}
              className={cn(
                "flex items-start gap-2 text-xs",
                notice.tone === "error" ? "text-destructive" : "text-warning",
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {notice.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

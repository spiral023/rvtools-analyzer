import { Upload } from "lucide-react";

export function OnboardingImportPage() {
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
      <div className="mt-8 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 p-8 text-center">
        <Upload className="h-10 w-10 text-primary" aria-hidden="true" />
        <strong className="mt-4">Excel-Dateien ablegen oder auswählen</strong>
        <span className="mt-2 font-mono text-xs text-muted-foreground">
          .XLSX · .XLS · MEHRFACHAUSWAHL
        </span>
      </div>
    </section>
  );
}

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FeaturesPage,
  FilterPage,
  WelcomePage,
} from "@/components/onboarding/OnboardingContent";
import { OnboardingImportPage } from "@/components/onboarding/OnboardingImportPage";
import { OnboardingImportStatus } from "@/components/onboarding/OnboardingImportStatus";
import { useImportController } from "@/hooks/useImportController";
import { useOnboarding } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

const pageTitles = ["Willkommen", "Daten importieren", "Systemfilter", "Werkzeuge"] as const;

function OnboardingPage({ page }: { page: number }) {
  switch (page) {
    case 0:
      return <WelcomePage />;
    case 1:
      return <OnboardingImportPage />;
    case 2:
      return <FilterPage />;
    default:
      return <FeaturesPage />;
  }
}

export function OnboardingDialog() {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const { items } = useImportController();
  const { open, page, direction, dismiss, next, previous } = useOnboarding();

  useEffect(() => {
    if (!open || page === 0) return;
    const frame = requestAnimationFrame(() => {
      pageRef.current?.querySelector<HTMLElement>(".onboarding-heading")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, page]);

  const finish = () => {
    dismiss();
    navigate("/overview");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <DialogContent
        ref={dialogRef}
        className="onboarding-surface flex h-[84vh] w-[90vw] max-w-[1360px] flex-col gap-0 overflow-hidden border-primary/20 bg-background p-0 outline-none max-sm:h-[96dvh] max-sm:w-[96vw] sm:rounded-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialogRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Einführung in den RVTools Analyzer</DialogTitle>
        <DialogDescription className="sr-only">
          Vierseitige Produkttour mit optionalem Excel-Import.
        </DialogDescription>
        <header className="flex min-h-20 items-center justify-between gap-5 border-b px-6 py-4 pr-14">
          <div>
            <span className="font-mono text-xs text-primary">0{page + 1} / 04</span>
            <p className="text-sm font-medium">{pageTitles[page]}</p>
          </div>
          {page >= 1 && items.length > 0 ? <OnboardingImportStatus /> : null}
          <button
            type="button"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={dismiss}
          >
            Überspringen
          </button>
        </header>
        <main
          ref={pageRef}
          key={page}
          data-direction={direction}
          className="onboarding-page flex-1 overflow-y-auto p-6 sm:p-10"
        >
          <OnboardingPage page={page} />
        </main>
        <footer className="grid min-h-20 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t bg-card/70 px-4 py-4 sm:px-6">
          <Button
            variant="ghost"
            className="justify-self-start"
            onClick={previous}
            disabled={page === 0}
          >
            Zurück
          </Button>
          <div className="onboarding-progress-track" aria-label="Onboarding-Fortschritt">
            {pageTitles.map((title, index) => (
              <span
                key={title}
                className={cn(
                  "h-1.5 w-5 rounded-full transition-colors sm:w-8",
                  index <= page ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          {page === 0 ? (
            <Button className="justify-self-end" onClick={next}>
              Tour starten
            </Button>
          ) : page < 3 ? (
            <Button className="justify-self-end" onClick={next}>
              Weiter
            </Button>
          ) : (
            <Button className="justify-self-end" onClick={finish}>
              Analyse öffnen
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

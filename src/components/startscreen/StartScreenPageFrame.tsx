import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/layout/ThemeProvider";

/**
 * Rahmen für die wenigen Seiten, die auch ohne Datenbestand erreichbar bleiben.
 * Bewusst ohne Sidebar und Filterleiste: Beide hätten ohne Daten nichts zu zeigen.
 */
export function StartScreenPageFrame({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-svh overflow-y-auto bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zurück zum Start
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">{children}</main>
    </div>
  );
}

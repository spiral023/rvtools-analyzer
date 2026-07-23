import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useTheme } from "./ThemeProvider";
import { Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalFilterControl } from "@/components/global-filter/GlobalFilterControl";
import { Link } from "react-router-dom";
import { ImportedDataPreloadControl } from "@/components/layout/ImportedDataPreloadControl";

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <SidebarProvider>
      {/* Feste Viewport-Höhe, damit <main> der Scroll-Container ist (sticky Header/Dock kleben sonst nicht). */}
      <div className="flex h-svh w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="z-20 flex min-h-14 items-center gap-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            {/* Slot für die seitenspezifische FilterBar (per Portal aus PageHeader befüllt). */}
            <div id="app-header-slot" className="flex min-w-0 flex-1 flex-wrap items-center gap-2" />
            <div className="flex items-center gap-2">
              <GlobalFilterControl />
              <ImportedDataPreloadControl />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Settings öffnen"
                title="Settings"
              >
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={theme === "dark" ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

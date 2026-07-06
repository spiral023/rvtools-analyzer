import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Einheitliches Raster für KPI-Karten. `auto-fit` mit fester Mindestbreite
 * verhindert, dass lange Titel oder Werte bei vielen Karten pro Reihe
 * abgeschnitten werden (vorher: starre lg:grid-cols-7/8/9).
 */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 md:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FilterBar } from "@/components/dashboard/FilterBar";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Meta-Info rechts neben dem Titel, z. B. der Snapshot-Zähler. */
  meta?: ReactNode;
  /** Weitere Kopfzeilen-Inhalte im Seitenfluss, z. B. eine TabsList. */
  children?: ReactNode;
}

/**
 * Seitenkopf: rendert Überschrift/Subline/Meta im Seitenfluss und portalt die
 * FilterBar in den Slot der obersten App-Leiste (#app-header-slot im
 * AppLayout), wo sie dauerhaft sichtbar bleibt.
 */
export function PageHeader({ title, subtitle, meta, children }: PageHeaderProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("app-header-slot"));
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight [text-wrap:balance]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">{subtitle}</p>}
        </div>
        {meta && <div className="pb-1 text-xs tabular-nums text-muted-foreground">{meta}</div>}
      </div>
      {slot && createPortal(<FilterBar />, slot)}
      {children}
    </>
  );
}

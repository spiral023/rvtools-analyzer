import * as React from "react";
import { Database } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { GlossaryEntry } from "@/lib/glossary";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Glossar-Eintrag, der erklärt wird. Ist er `undefined`, wird nur `children` ohne Tooltip gerendert. */
  entry?: GlossaryEntry;
  /** Das Element, das den Tooltip bei Hover/Fokus auslöst (ganze KPI-Karte, Spaltenkopf, Menüpunkt …). */
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Öffnungsverzögerung in ms (Standard 250 – flotter als der globale Default). */
  delayDuration?: number;
}

/**
 * Wickelt ein beliebiges Element als Hover-/Fokus-Auslöser für einen erklärenden
 * Tooltip. Die Darstellung ist die „Fachbegriff-Karte": Begriff, Erklärung und –
 * wo vorhanden – die RVTools-Herkunft des Werts.
 */
export function InfoTooltip({
  entry,
  children,
  side = "top",
  align = "start",
  delayDuration = 250,
}: InfoTooltipProps) {
  if (!entry) return <>{children}</>;

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className="max-w-[300px] border-border/80 bg-popover p-0 shadow-lg"
      >
        <GlossaryCard entry={entry} />
      </TooltipContent>
    </Tooltip>
  );
}

function GlossaryCard({ entry, className }: { entry: GlossaryEntry; className?: string }) {
  return (
    <div className={cn("px-3 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
        {entry.term}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-popover-foreground/90">
        {entry.description}
      </p>
      {entry.source && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[10px] font-mono-data text-muted-foreground">
          <Database className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate" title={entry.source}>
            {entry.source}
          </span>
        </div>
      )}
    </div>
  );
}

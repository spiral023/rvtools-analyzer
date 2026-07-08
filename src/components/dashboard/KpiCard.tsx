import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import type { GlossaryEntry } from "@/lib/glossary";
import type { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  severity?: "ok" | "warn" | "crit";
  trend?: { delta: number; direction: "up" | "down" | "flat" };
  className?: string;
  /** Erklärender Tooltip, der beim Überfahren der ganzen Karte erscheint. */
  info?: GlossaryEntry;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  severity,
  trend,
  className,
  info,
}: KpiCardProps) {
  const card = (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-md",
        severity === "crit" && "border-l-4 border-l-destructive",
        severity === "warn" && "border-l-4 border-l-warning",
        severity === "ok" && "border-l-4 border-l-success",
        !severity && "border-l-4 border-l-transparent",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground" title={info ? undefined : title}>
            {title}
          </p>
          {icon && (
            <div className="shrink-0 text-muted-foreground/50">{icon}</div>
          )}
        </div>
        <p className="mt-2 truncate text-2xl font-bold font-mono tracking-tight" title={typeof value === "string" ? value : undefined}>
          {value}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          {subtitle && (
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</span>
          )}
          {trend && (
            <span
              className={cn(
                "inline-flex items-center text-xs font-medium",
                trend.direction === "up" && "text-success",
                trend.direction === "down" && "text-destructive",
                trend.direction === "flat" && "text-muted-foreground"
              )}
            >
              {trend.direction === "up" && "↑"}
              {trend.direction === "down" && "↓"}
              {trend.direction === "flat" && "→"}
              {" "}{Math.abs(trend.delta).toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!info) return card;

  return (
    <InfoTooltip entry={info} side="bottom">
      {card}
    </InfoTooltip>
  );
}

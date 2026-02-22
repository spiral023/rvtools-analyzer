import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  severity?: "ok" | "warn" | "crit";
  trend?: { delta: number; direction: "up" | "down" | "flat" };
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  severity,
  trend,
  className,
}: KpiCardProps) {
  return (
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
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {icon && (
            <div className="text-muted-foreground/50">{icon}</div>
          )}
        </div>
        <p className="mt-2 text-2xl font-bold font-mono tracking-tight">
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
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
}

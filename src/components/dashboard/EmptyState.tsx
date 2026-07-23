import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  /** Zusätzliche Aktion(en), unterhalb des Primär-Buttons gerendert (z. B. ein sekundärer Button). */
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/50 px-6 py-16 text-center animate-fade-in">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon || <Upload aria-hidden="true" className="h-6 w-6" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {(actionLabel && actionTo) || children ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && actionTo && (
            <Button asChild>
              <Link to={actionTo}>{actionLabel}</Link>
            </Button>
          )}
          {children}
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { SOURCE_LABELS } from "@/components/network/AuditSourceStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type {
  NetworkAuditCheckSummary,
  NetworkAuditScope,
} from "@/lib/networkAuditViewModel";
import { cn } from "@/lib/utils";

interface AuditDetailViewProps {
  title: string;
  description: string;
  summary: NetworkAuditCheckSummary;
  scope: NetworkAuditScope;
  visibleCount: number;
  totalCount: number;
  search: string;
  onBack: () => void;
  onScopeChange: (scope: NetworkAuditScope) => void;
  children: ReactNode;
}

const SCOPE_OPTIONS: Array<{ value: NetworkAuditScope; label: string }> = [
  { value: "attention", label: "Handlungsbedarf" },
  { value: "passed", label: "Bestanden" },
  { value: "all", label: "Alle" },
];

function isNetworkAuditScope(value: string): value is NetworkAuditScope {
  return SCOPE_OPTIONS.some((option) => option.value === value);
}

export function AuditDetailView({
  title,
  description,
  summary,
  scope,
  visibleCount,
  totalCount,
  search,
  onBack,
  onScopeChange,
  children,
}: AuditDetailViewProps) {
  const missingSources = [...new Set([...summary.missingRequired, ...summary.missingOptional])];
  const missingLabels = missingSources.map((source) => SOURCE_LABELS[source]);
  const missingText = missingLabels.join(", ");

  return (
    <section aria-labelledby="network-audit-detail-heading" className="space-y-5">
      <div className="space-y-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Zur Übersicht
        </Button>
        <div className="space-y-1">
          <h2 id="network-audit-detail-heading" className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {summary.readiness === "limited" && missingLabels.length > 0 && (
        <Alert className="border-warning/45 bg-warning/5">
          <Info aria-hidden="true" className="h-4 w-4 text-warning" />
          <AlertTitle>
            Eingeschränkte Prüfung – {missingText} {missingLabels.length === 1 ? "fehlt" : "fehlen"}
          </AlertTitle>
          <AlertDescription>
            Die fehlende Datenbasis begrenzt den Abgleich; die vorhandenen Ergebnisse bleiben nutzbar.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="radiogroup"
          aria-label="Ergebnisfilter"
          className="inline-flex w-fit items-center rounded-md border bg-muted/25 p-1"
        >
          {SCOPE_OPTIONS.map((option) => (
            <span key={option.value}>
              <input
                id={`network-audit-scope-${option.value}`}
                className="peer sr-only"
                type="radio"
                name="network-audit-scope"
                value={option.value}
                checked={scope === option.value}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isNetworkAuditScope(value)) onScopeChange(value);
                }}
              />
              <label
                htmlFor={`network-audit-scope-${option.value}`}
                className={cn(
                  "block cursor-pointer rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                  "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                  scope === option.value && "bg-background text-foreground shadow-sm",
                )}
              >
                {option.label}
              </label>
            </span>
          ))}
        </div>

        <div className="text-sm text-muted-foreground">
          <p aria-live="polite" className="font-mono tabular-nums text-foreground">
            {visibleCount.toLocaleString("de-DE")} von {totalCount.toLocaleString("de-DE")} Einträgen
          </p>
          {search && <p className="mt-1 text-xs">Ergebnisse zusätzlich gefiltert nach „{search}“.</p>}
        </div>
      </div>

      {children}
    </section>
  );
}

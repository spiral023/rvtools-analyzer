import type { ReactNode } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS } from "@/lib/networkAuditLabels";
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

function getAdjacentScope(current: NetworkAuditScope, key: string): NetworkAuditScope | null {
  const direction = key === "ArrowLeft" || key === "ArrowUp"
    ? -1
    : key === "ArrowRight" || key === "ArrowDown"
      ? 1
      : 0;
  if (direction === 0) return null;
  const currentIndex = SCOPE_OPTIONS.findIndex((option) => option.value === current);
  const nextIndex = (currentIndex + direction + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
  return SCOPE_OPTIONS[nextIndex].value;
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
        <Button type="button" variant="ghost" size="sm" className="-ml-3 min-h-11 min-w-11" onClick={onBack}>
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
        <div className="max-w-full overflow-x-auto">
          <div
            role="radiogroup"
            aria-label="Ergebnisfilter"
            className="inline-flex min-w-max items-center rounded-md border bg-muted/25 p-1"
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
                  onKeyDown={(event) => {
                    const nextScope = getAdjacentScope(option.value, event.key);
                    if (!nextScope) return;
                    event.preventDefault();
                    const nextInput = event.currentTarget
                      .closest('[role="radiogroup"]')
                      ?.querySelector<HTMLInputElement>(`[value="${nextScope}"]`);
                    nextInput?.focus();
                    onScopeChange(nextScope);
                  }}
                />
                <label
                  htmlFor={`network-audit-scope-${option.value}`}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                    "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                    scope === option.value && "bg-background text-foreground shadow-sm",
                  )}
                >
                  {option.label}
                </label>
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-0 text-sm text-muted-foreground">
          <p aria-live="polite" className="font-mono tabular-nums text-foreground">
            {visibleCount.toLocaleString("de-DE")} von {totalCount.toLocaleString("de-DE")} Einträgen
          </p>
          {search && (
            <p className="mt-1 break-words text-xs [overflow-wrap:anywhere]">
              Ergebnisse zusätzlich gefiltert nach „{search}“.
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

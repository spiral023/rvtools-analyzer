import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, CircleDashed, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  NetworkAuditSourceFacts,
  NetworkAuditSourceKey,
} from "@/lib/networkAuditViewModel";
import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components -- Öffentliche API dieses UI-Bausteins laut Network-Audit-Spezifikation.
export const SOURCE_LABELS: Record<NetworkAuditSourceKey, string> = {
  rvtools: "RVTools",
  cdp: "CDP",
  eramonIface: "Eramon Interface",
  eramonL2: "Eramon L2",
  ipam: "IPAM",
  techInfo: "Tech-Info",
};

const SOURCE_ORDER = Object.keys(SOURCE_LABELS) as NetworkAuditSourceKey[];

function formatImportedAt(importedAt: string | null) {
  if (!importedAt) return "Noch nicht importiert";
  const date = new Date(importedAt);
  if (Number.isNaN(date.getTime())) return "Datum nicht verfügbar";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AuditSourceStatus({ sources }: { sources: NetworkAuditSourceFacts }) {
  return (
    <section aria-labelledby="network-audit-sources-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id="network-audit-sources-heading" className="text-lg font-semibold tracking-tight">
            Datenbasis
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Umfang und Aktualität der lokalen Importe bestimmen, welche Prüfungen belastbar ausführbar sind.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11 self-start sm:self-auto">
          <Link to="/upload">
            Importe verwalten
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {SOURCE_ORDER.map((sourceKey) => {
          const source = sources[sourceKey];
          const isReady = source.count > 0;
          const StatusIcon = isReady ? CheckCircle2 : CircleDashed;

          return (
            <article
              key={sourceKey}
              aria-label={SOURCE_LABELS[sourceKey]}
              className={cn(
                "min-w-0 rounded-lg border bg-card p-3",
                isReady ? "border-l-4 border-l-success" : "border-l-4 border-l-muted-foreground/35",
              )}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide">
                  {SOURCE_LABELS[sourceKey]}
                </h3>
                <Database aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <p className="mt-3 font-mono text-xl font-bold tabular-nums">
                {source.count.toLocaleString("de-DE")}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <StatusIcon
                  aria-hidden="true"
                  className={cn("h-3.5 w-3.5", isReady ? "text-success" : "text-muted-foreground")}
                />
                <Badge
                  variant="outline"
                  className={cn(
                    "px-1.5 py-0 text-[10px]",
                    isReady ? "border-success/40 text-success" : "text-muted-foreground",
                  )}
                >
                  {isReady ? "Bereit" : "Fehlt"}
                </Badge>
              </div>
              <p className="mt-2 truncate text-[11px] text-muted-foreground" title={formatImportedAt(source.importedAt)}>
                {formatImportedAt(source.importedAt)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatNetworkAuditSourceList,
  getNetworkAuditImportLabel,
} from "@/lib/networkAuditLabels";
import type {
  NetworkAuditCheckSummary,
  NetworkAuditScope,
  NetworkAuditStatus,
} from "@/lib/networkAuditViewModel";
import { cn } from "@/lib/utils";

interface AuditCheckCardProps {
  index: number;
  title: string;
  question: string;
  actionLabel: string;
  summary: NetworkAuditCheckSummary;
  onOpen: (scope: NetworkAuditScope) => void;
}

const STATUS: Record<
  NetworkAuditStatus,
  { label: string; Icon: LucideIcon; edge: string; badge: string }
> = {
  critical: {
    label: "Kritisch",
    Icon: AlertOctagon,
    edge: "border-l-destructive",
    badge: "border-destructive/40 text-destructive",
  },
  review: {
    label: "Prüfen",
    Icon: AlertTriangle,
    edge: "border-l-warning",
    badge: "border-warning/40 text-warning",
  },
  passed: {
    label: "Bestanden",
    Icon: CheckCircle2,
    edge: "border-l-success",
    badge: "border-success/40 text-success",
  },
  unavailable: {
    label: "Nicht ausführbar",
    Icon: Ban,
    edge: "border-l-muted-foreground/35",
    badge: "text-muted-foreground",
  },
};

export function AuditCheckCard({
  index,
  title,
  question,
  actionLabel,
  summary,
  onOpen,
}: AuditCheckCardProps) {
  const status = STATUS[summary.status];
  const openCount = summary.counts.critical + summary.counts.review;
  const isUnavailable = summary.status === "unavailable" || summary.readiness === "unavailable";
  const scope: NetworkAuditScope = summary.status === "passed" ? "all" : "attention";
  const missingSourceList = formatNetworkAuditSourceList(summary.missingRequired);
  const missingSourcePrefix = summary.missingRequired.length === 1
    ? "Fehlende Pflichtquelle"
    : "Fehlende Pflichtquellen";

  return (
    <Card className={cn("relative z-10 flex h-full flex-col border-l-4", status.edge, isUnavailable && "bg-muted/25")}>
      <CardHeader className="space-y-4 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
            {String(index).padStart(2, "0")}
          </span>
          <Badge variant="outline" className={cn("gap-1.5", status.badge)}>
            <status.Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {status.label}
          </Badge>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold leading-snug tracking-tight">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{question}</p>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 p-4 pt-3">
        {isUnavailable ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Nicht auswertbar</p>
            <p className="text-xs text-muted-foreground">
              {missingSourcePrefix}: {missingSourceList}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            <span className="font-mono font-bold tabular-nums text-foreground">
              {openCount.toLocaleString("de-DE")}
            </span>{" "}
            offen
          </p>
        )}
        {isUnavailable ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-auto min-h-11 w-full min-w-0 justify-center whitespace-normal px-3 py-2.5 text-center leading-snug"
          >
            <Link to="/upload">
              <span className="min-w-0 break-words">
                {getNetworkAuditImportLabel(summary.missingRequired)}
              </span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant={summary.status === "critical" ? "default" : "outline"}
            size="sm"
            className="h-auto min-h-11 w-full min-w-0 justify-center whitespace-normal px-3 py-2.5 text-center leading-snug"
            onClick={() => onOpen(scope)}
          >
            <span className="min-w-0 break-words">{actionLabel}</span>
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

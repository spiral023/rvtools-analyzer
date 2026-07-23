import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { AuditCheckCard } from "@/components/network/AuditCheckCard";
import { AuditSourceStatus } from "@/components/network/AuditSourceStatus";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Button } from "@/components/ui/button";
import { NET_AUDIT_KPI } from "@/lib/glossaries/networking";
import type {
  NetworkAuditCheckId,
  NetworkAuditScope,
  NetworkAuditViewModel,
} from "@/lib/networkAuditViewModel";

interface NetworkAuditOverviewProps {
  viewModel: NetworkAuditViewModel;
  onOpenCheck: (check: NetworkAuditCheckId, scope: NetworkAuditScope) => void;
}

const CHECK_COPY: Record<
  NetworkAuditCheckId,
  { title: string; question: string; action: (openCount: number) => string }
> = {
  ports: {
    title: "Switch-Port-Zuordnungen",
    question: "Stimmen Portbeschriftung, Link-Status und CDP-Nachbar überein?",
    action: (count) => count > 0 ? `${count.toLocaleString("de-DE")} Port-Befunde prüfen` : "Alle Port-Prüfungen anzeigen",
  },
  hosts: {
    title: "Host-Datenqualität",
    question: "Sind alle ESXi-Hosts in Tech-Info und IPAM dokumentiert?",
    action: (count) => count > 0 ? `${count.toLocaleString("de-DE")} Datenlücken prüfen` : "Alle Host-Prüfungen anzeigen",
  },
  mac: {
    title: "ESXi-MAC-Abgleich",
    question: "Werden die Host-Adapter am erwarteten Switch-Port gesehen?",
    action: (count) => count > 0 ? `${count.toLocaleString("de-DE")} MAC-Befunde prüfen` : "Alle MAC-Prüfungen anzeigen",
  },
  discovery: {
    title: "Unbekannte Geräte",
    question: "Welche Geräte lassen sich weder CDP noch IPAM zuordnen?",
    action: (count) => count > 0 ? `${count.toLocaleString("de-DE")} unbekannte Geräte prüfen` : "Netz-Discovery anzeigen",
  },
};

const CHECK_ORDER: NetworkAuditCheckId[] = ["ports", "hosts", "mac", "discovery"];

export function NetworkAuditOverview({ viewModel, onOpenCheck }: NetworkAuditOverviewProps) {
  return (
    <div className="space-y-6">
      <AuditSourceStatus sources={viewModel.sources} />

      <section aria-label="Prüfergebnisse" className="space-y-3">
        <KpiGrid className="grid-cols-1 sm:grid-cols-3 md:grid-cols-3">
          <KpiCard
            title="Kritisch"
            value={viewModel.totals.critical.toLocaleString("de-DE")}
            severity={viewModel.totals.critical > 0 ? "crit" : "ok"}
            icon={<AlertOctagon aria-hidden="true" className="h-4 w-4" />}
            info={NET_AUDIT_KPI.critical}
          />
          <KpiCard
            title="Prüfen"
            value={viewModel.totals.review.toLocaleString("de-DE")}
            severity={viewModel.totals.review > 0 ? "warn" : "ok"}
            icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
            info={NET_AUDIT_KPI.review}
          />
          <KpiCard
            title="Bestanden"
            value={viewModel.totals.passed.toLocaleString("de-DE")}
            severity="ok"
            icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            info={NET_AUDIT_KPI.passed}
          />
        </KpiGrid>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ListChecks aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              {!viewModel.hasExecutableChecks
                ? "Noch keine Netzwerkprüfung ausführbar. Importieren Sie die benötigten Datenquellen."
                : viewModel.nextCheck
                  ? `${viewModel.totals.critical.toLocaleString("de-DE")} kritische und ${viewModel.totals.review.toLocaleString("de-DE")} weitere Befunde sind offen.`
                  : "Keine offenen Netzwerkbefunde."}
            </p>
          </div>
          {viewModel.hasExecutableChecks && viewModel.nextCheck && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => onOpenCheck(viewModel.nextCheck!, "attention")}
            >
              Nächsten Befund prüfen
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="network-audit-path-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="network-audit-path-heading" className="text-lg font-semibold tracking-tight">
            Empfohlener Prüfpfad
          </h2>
          <p className="text-sm text-muted-foreground">
            Beginnen Sie links mit den physischen Zuordnungen und arbeiten Sie sich bis zur Netz-Discovery vor.
          </p>
        </div>
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div
            aria-hidden="true"
            className="absolute left-[8%] right-[8%] top-6 hidden border-t border-border xl:block"
          />
          {CHECK_ORDER.map((checkId, index) => {
            const summary = viewModel.checks[checkId];
            const openCount = summary.counts.critical + summary.counts.review;
            const copy = CHECK_COPY[checkId];
            return (
              <AuditCheckCard
                key={checkId}
                index={index + 1}
                title={copy.title}
                question={copy.question}
                actionLabel={copy.action(openCount)}
                summary={summary}
                onOpen={(scope) => onOpenCheck(checkId, scope)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

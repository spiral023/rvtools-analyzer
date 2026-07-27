import { useMemo, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  HostDataAuditDetail,
  MacAuditDetail,
  NetworkDiscoveryDetail,
  PortAuditDetail,
} from "@/components/network/NetworkAuditDetails";
import { NetworkAuditHelp } from "@/components/network/NetworkAuditHelp";
import { NetworkAuditOverview } from "@/components/network/NetworkAuditOverview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { useFilterState } from "@/hooks/useFilterState";
import { NET_AUDIT_KPI } from "@/lib/glossaries/networking";
import {
  parseNetworkAuditLocation,
  updateNetworkAuditSearch,
} from "@/lib/networkAuditNavigation";
import {
  buildNetworkAuditViewModel,
  type NetworkAuditCheckRoute,
  type NetworkAuditCounts,
  type NetworkAuditScope,
  type NetworkAuditViewModel,
} from "@/lib/networkAuditViewModel";

const AUDIT_SECTIONS = [
  { value: "overview", label: "Übersicht" },
  { value: "ports", label: "Switch-Ports" },
  { value: "hosts", label: "Host-Daten" },
  { value: "mac", label: "MAC-Abgleich" },
  { value: "discovery", label: "Netz-Discovery" },
  { value: "help", label: "Hilfe" },
] as const satisfies ReadonlyArray<{ value: NetworkAuditCheckRoute; label: string }>;

function isNetworkAuditCheckRoute(value: string): value is NetworkAuditCheckRoute {
  return value === "overview"
    || value === "ports"
    || value === "hosts"
    || value === "mac"
    || value === "discovery"
    || value === "help";
}

type NetworkAuditResult = ReturnType<typeof useNetworkAudit>;

function countLabel(count: number, singular: string, plural = singular) {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? singular : plural}`;
}

function NetworkAuditKpiGrid({
  audit,
  check,
  viewModel,
}: {
  audit: NetworkAuditResult;
  check: NetworkAuditCheckRoute;
  viewModel: NetworkAuditViewModel;
}) {
  if (check === "help") return null;

  const counts: NetworkAuditCounts = check === "overview"
    ? viewModel.totals
    : viewModel.checks[check].counts;
  const subtitles = check === "overview"
    ? [
        "Konflikte zwischen den Quellen",
        "Datenlücken und offene Zuordnungen",
        "Bestätigte oder unauffällige Elemente",
      ]
    : check === "ports"
      ? [
          `${countLabel(audit.rows.filter((row) => row.labelConflict).length, "Beschriftungskonflikt", "Beschriftungskonflikte")} · ${countLabel(audit.rows.filter((row) => row.statusConflict).length, "Statuskonflikt", "Statuskonflikte")}`,
          `${countLabel(audit.rows.filter((row) => row.matchStatus === "text-match").length, "RVTools-Treffer")} · ${countLabel(audit.rows.filter((row) => row.matchStatus === "documented-only").length, "nur dokumentiert")} · ${countLabel(audit.rows.filter((row) => row.matchStatus === "unknown").length, "unbekannt")}`,
          `${countLabel(audit.rows.filter((row) => row.matchStatus === "confirmed-cdp").length, "CDP-bestätigt")} · ${countLabel(audit.rows.filter((row) => row.matchStatus === "no-target").length, "ohne Ziel")}`,
        ]
      : check === "hosts"
        ? [
            "Für den Host-Abgleich nicht separat bewertet",
            `${countLabel([...audit.hostQuality.rvtoolsRows, ...audit.hostQuality.techInfoRows].filter((row) => row.finding !== null).length, "Datenlücke", "Datenlücken")}`,
            `${countLabel([...audit.hostQuality.rvtoolsRows, ...audit.hostQuality.techInfoRows].filter((row) => row.finding === null).length, "vollständig abgeglichen")}`,
          ]
        : check === "mac"
          ? [
              `${countLabel(audit.cdpMacRows.filter((row) => row.topologyMismatch).length, "Topologieabweichung", "Topologieabweichungen")}`,
              `${countLabel(audit.cdpMacRows.filter((row) => !row.inL2).length, "MAC nicht in L2")}`,
              `${countLabel(audit.cdpMacRows.filter((row) => row.inL2 && !row.topologyMismatch).length, "MAC korrekt verortet")}`,
            ]
          : [
              "Für Discovery nicht separat bewertet",
              `${countLabel(audit.l2DiscoveryRows.filter((row) => row.classification === "unknown").length, "unbekanntes Gerät", "unbekannte Geräte")}`,
              `${countLabel(audit.l2DiscoveryRows.filter((row) => row.classification !== "unknown").length, "zugeordnetes Gerät", "zugeordnete Geräte")}`,
            ];

  return (
    <section aria-label="Prüfergebnisse" className="space-y-3">
      <KpiGrid className="grid-cols-1 sm:grid-cols-3 md:grid-cols-3">
        <KpiCard
          title="Kritisch"
          value={counts.critical.toLocaleString("de-DE")}
          subtitle={subtitles[0]}
          severity={counts.critical > 0 ? "crit" : "ok"}
          icon={<AlertOctagon aria-hidden="true" className="h-4 w-4" />}
          info={NET_AUDIT_KPI.critical}
        />
        <KpiCard
          title="Prüfen"
          value={counts.review.toLocaleString("de-DE")}
          subtitle={subtitles[1]}
          severity={counts.review > 0 ? "warn" : "ok"}
          icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
          info={NET_AUDIT_KPI.review}
        />
        <KpiCard
          title="Bestanden"
          value={counts.passed.toLocaleString("de-DE")}
          subtitle={subtitles[2]}
          severity="ok"
          icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
          info={NET_AUDIT_KPI.passed}
        />
      </KpiGrid>
    </section>
  );
}

function NetworkAuditSuccess({
  audit,
  search,
}: {
  audit: NetworkAuditResult;
  search: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { check, scope } = parseNetworkAuditLocation(searchParams);
  const viewModel = useMemo(
    () => buildNetworkAuditViewModel({
      sources: audit.sources,
      portRows: audit.rows,
      hostQuality: audit.hostQuality,
      cdpMacRows: audit.cdpMacRows,
      l2DiscoveryRows: audit.l2DiscoveryRows,
    }),
    [
      audit.cdpMacRows,
      audit.hostQuality,
      audit.l2DiscoveryRows,
      audit.rows,
      audit.sources,
    ],
  );

  const navigate = (
    nextCheck: NetworkAuditCheckRoute,
    nextScope: NetworkAuditScope = scope,
  ) => {
    setSearchParams(updateNetworkAuditSearch(searchParams, {
      check: nextCheck,
      scope: nextScope,
    }));
  };

  return (
    <Tabs
        value={check}
        onValueChange={(value) => {
          if (isNetworkAuditCheckRoute(value)) navigate(value, "attention");
        }}
        className="space-y-4"
      >
        <PageHeader
          title="Netzwerk-Kontrolle"
        >
          <div className="w-full overflow-x-auto pb-1">
            <TabsList
              aria-label="Bereich der Netzwerk-Kontrolle"
              className="h-auto w-full min-w-max justify-start gap-1 p-1"
            >
              {AUDIT_SECTIONS.map((section) => (
                <TabsTrigger
                  key={section.value}
                  value={section.value}
                  className="min-h-11 min-w-11"
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </PageHeader>

        <NetworkAuditKpiGrid audit={audit} check={check} viewModel={viewModel} />

        <TabsContent value="overview">
          <NetworkAuditOverview
            viewModel={viewModel}
            onOpenCheck={(nextCheck, nextScope) => navigate(nextCheck, nextScope)}
          />
        </TabsContent>

        <TabsContent value="ports">
          <PortAuditDetail
            summary={viewModel.checks.ports}
            rows={audit.rows}
            scope={scope}
            search={search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("ports", nextScope)}
          />
        </TabsContent>

        <TabsContent value="hosts">
          <HostDataAuditDetail
            summary={viewModel.checks.hosts}
            rvtoolsRows={audit.hostQuality.rvtoolsRows}
            techInfoRows={audit.hostQuality.techInfoRows}
            scope={scope}
            search={search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("hosts", nextScope)}
          />
        </TabsContent>

        <TabsContent value="mac">
          <MacAuditDetail
            summary={viewModel.checks.mac}
            rows={audit.cdpMacRows}
            scope={scope}
            search={search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("mac", nextScope)}
          />
        </TabsContent>

        <TabsContent value="discovery">
          <NetworkDiscoveryDetail
            summary={viewModel.checks.discovery}
            rows={audit.l2DiscoveryRows}
            scope={scope}
            search={search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("discovery", nextScope)}
          />
        </TabsContent>

        <TabsContent value="help">
          <NetworkAuditHelp />
        </TabsContent>
      </Tabs>
  );
}

export function NetworkAuditPanel() {
  const audit = useNetworkAudit();
  const { filters } = useFilterState();
  const [isRetrying, setIsRetrying] = useState(false);
  const retryPendingRef = useRef(false);

  const handleRetry = async () => {
    if (retryPendingRef.current) return;
    retryPendingRef.current = true;
    setIsRetrying(true);
    try {
      await audit.refetch();
    } catch {
      // Der Query-Fehlerzustand bleibt sichtbar und bietet einen erneuten Versuch an.
    } finally {
      retryPendingRef.current = false;
      setIsRetrying(false);
    }
  };

  if (audit.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        <AlertTitle>Netzwerkdaten konnten nicht geladen werden</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Versuchen Sie es erneut. Ihre importierten Daten bleiben erhalten.</p>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 min-w-11"
            disabled={isRetrying}
            aria-busy={isRetrying}
            onClick={() => {
              void handleRetry();
            }}
          >
            {isRetrying ? "Wird erneut versucht…" : "Erneut versuchen"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (audit.isLoading) {
    return <PanelLoadingState />;
  }

  return <NetworkAuditSuccess audit={audit} search={filters.search} />;
}

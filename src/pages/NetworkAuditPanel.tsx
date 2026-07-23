import { useMemo } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import {
  HostDataAuditDetail,
  MacAuditDetail,
  NetworkDiscoveryDetail,
  PortAuditDetail,
} from "@/components/network/NetworkAuditDetails";
import { NetworkAuditOverview } from "@/components/network/NetworkAuditOverview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSnapshotIds, useNetworkAudit } from "@/hooks/useActiveSnapshots";
import {
  parseNetworkAuditLocation,
  updateNetworkAuditSearch,
} from "@/lib/networkAuditNavigation";
import {
  buildNetworkAuditViewModel,
  type NetworkAuditCheckRoute,
  type NetworkAuditScope,
} from "@/lib/networkAuditViewModel";

const AUDIT_SECTIONS = [
  { value: "overview", label: "Übersicht" },
  { value: "ports", label: "Switch-Ports" },
  { value: "hosts", label: "Host-Daten" },
  { value: "mac", label: "MAC-Abgleich" },
  { value: "discovery", label: "Netz-Discovery" },
] as const satisfies ReadonlyArray<{ value: NetworkAuditCheckRoute; label: string }>;

function isNetworkAuditCheckRoute(value: string): value is NetworkAuditCheckRoute {
  return value === "overview"
    || value === "ports"
    || value === "hosts"
    || value === "mac"
    || value === "discovery";
}

export function NetworkAuditPanel() {
  const audit = useNetworkAudit();
  const { filters } = useActiveSnapshotIds();
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
      tab: "audit",
      check: nextCheck,
      scope: nextScope,
    }));
  };

  if (audit.isLoading) {
    return <PanelLoadingState />;
  }

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
            onClick={() => {
              void audit.refetch();
            }}
          >
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="network-audit-heading" className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <ListChecks aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 id="network-audit-heading" className="text-xl font-semibold tracking-tight">
            Netzwerk-Kontrolle
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Prüfen Sie Datenqualität, physische Zuordnungen und unbekannte Geräte.
          </p>
        </div>
      </div>

      <Tabs
        value={check}
        onValueChange={(value) => {
          if (isNetworkAuditCheckRoute(value)) navigate(value, "attention");
        }}
        className="space-y-4"
      >
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList
            aria-label="Bereich der Netzwerk-Kontrolle"
            className="h-auto min-w-max justify-start gap-1 p-1"
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
            search={filters.search}
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
            search={filters.search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("hosts", nextScope)}
          />
        </TabsContent>

        <TabsContent value="mac">
          <MacAuditDetail
            summary={viewModel.checks.mac}
            rows={audit.cdpMacRows}
            scope={scope}
            search={filters.search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("mac", nextScope)}
          />
        </TabsContent>

        <TabsContent value="discovery">
          <NetworkDiscoveryDetail
            summary={viewModel.checks.discovery}
            rows={audit.l2DiscoveryRows}
            scope={scope}
            search={filters.search}
            onBack={() => navigate("overview", "attention")}
            onScopeChange={(nextScope) => navigate("discovery", nextScope)}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

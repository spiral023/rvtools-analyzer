import { Network } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkSecurityPanel } from "@/pages/NetworkSecurity";
import { HostNetworkPanel } from "@/pages/HostNetwork";
import { VlanUsagePanel } from "@/pages/VlanUsage";
import { CdpPanel } from "@/pages/CdpSwitchPorts";
import { IpamPanel } from "@/pages/IpamPanel";
import { EramonIfacePanel } from "@/pages/EramonIfacePanel";
import { EramonL2Panel } from "@/pages/EramonL2Panel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useOptionalAppMode } from "@/hooks/useAppMode";
import { NET_NETWORK_TABS } from "@/lib/glossaries/networking";
import {
  isNetworkTab,
  parseNetworkTab,
  updateNetworkAuditSearch,
  type NetworkTab,
} from "@/lib/networkAuditNavigation";

/**
 * Im SysV-Modus bleibt nur die VLAN-Nutzung übrig: Alle anderen Tabs beschreiben die
 * Netzwerk- und Sicherheitslage der gesamten Umgebung, nicht die eigenen Systeme.
 */
const SYSV_HIDDEN_NETWORK_TABS = new Set<NetworkTab>([
  "security",
  "host",
  "cdp",
  "ipam",
  "eramon-iface",
  "eramon-l2",
]);
const SYSV_FALLBACK_NETWORK_TAB: NetworkTab = "vlan";

function RvtoolsEmptyState() {
  return (
    <EmptyState
      icon={<Network aria-hidden="true" className="h-6 w-6" />}
      title="Keine RVTools-Daten"
      description="Lade RVTools-Daten hoch."
      actionLabel="Zum Upload"
      actionTo="/upload"
    />
  );
}

export default function Networking({ initialTab = "security" }: { initialTab?: NetworkTab }) {
  const { snapshots, snapshotsLoading } = useActiveSnapshotIds();
  const [searchParams, setSearchParams] = useSearchParams();
  const appMode = useOptionalAppMode();
  // Wie in der Navigation: Solange der Modus lädt, bleiben die modusabhängigen Tabs
  // verborgen, damit keine falsche Auswahl aufblinkt.
  const hidesSysvTabs = !(appMode?.isHydrated ?? true) || appMode?.mode === "sysv";
  const isTabVisible = (tab: NetworkTab) => !hidesSysvTabs || !SYSV_HIDDEN_NETWORK_TABS.has(tab);
  const requestedTab = parseNetworkTab(searchParams, initialTab);
  // Ein Deeplink oder Bookmark auf einen verborgenen Tab landet auf dem sichtbaren Rest.
  const activeTab = isTabVisible(requestedTab) ? requestedTab : SYSV_FALLBACK_NETWORK_TAB;
  const hasRvtools = snapshots.length > 0;

  // Alte Bookmarks mit dem früheren Netzwerk-Untertab bleiben gültig.
  if (searchParams.get("tab") === "audit") {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("tab");
    if (!nextSearchParams.has("check")) nextSearchParams.set("check", "overview");
    return <Navigate replace to={`/network-audit?${nextSearchParams.toString()}`} />;
  }

  const setActiveTab = (tab: NetworkTab) => {
    setSearchParams(updateNetworkAuditSearch(searchParams, { tab }));
  };

  const handleTabChange = (value: string) => {
    if (isNetworkTab(value)) setActiveTab(value);
  };

  if (snapshotsLoading) return <PageLoadingState title="Netzwerk" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <PageHeader title="Netzwerk">
          <div className="w-full overflow-x-auto pb-1">
            <TabsList aria-label="Netzwerkbereich" className="min-w-max">
              {isTabVisible("security") && (
                <InfoTooltip entry={NET_NETWORK_TABS.security} side="bottom">
                  <TabsTrigger value="security">Security &amp; Policies</TabsTrigger>
                </InfoTooltip>
              )}
              {isTabVisible("host") && (
                <InfoTooltip entry={NET_NETWORK_TABS.host} side="bottom">
                  <TabsTrigger value="host">Host-Netzwerk</TabsTrigger>
                </InfoTooltip>
              )}
              <InfoTooltip entry={NET_NETWORK_TABS.vlan} side="bottom">
                <TabsTrigger value="vlan">VLAN-Nutzung</TabsTrigger>
              </InfoTooltip>
              {isTabVisible("cdp") && (
                <InfoTooltip entry={NET_NETWORK_TABS.cdp} side="bottom">
                  <TabsTrigger value="cdp">CDP/Switch-Ports</TabsTrigger>
                </InfoTooltip>
              )}
              {isTabVisible("ipam") && (
                <InfoTooltip entry={NET_NETWORK_TABS.ipam} side="bottom">
                  <TabsTrigger value="ipam">IPAM</TabsTrigger>
                </InfoTooltip>
              )}
              {isTabVisible("eramon-iface") && (
                <InfoTooltip entry={NET_NETWORK_TABS.eramonIface} side="bottom">
                  <TabsTrigger value="eramon-iface">Switch-Ports (Eramon)</TabsTrigger>
                </InfoTooltip>
              )}
              {isTabVisible("eramon-l2") && (
                <InfoTooltip entry={NET_NETWORK_TABS.eramonL2} side="bottom">
                  <TabsTrigger value="eramon-l2">MAC-Tabelle (Eramon)</TabsTrigger>
                </InfoTooltip>
              )}
            </TabsList>
          </div>
        </PageHeader>

        <TabsContent value="security" className="space-y-4">
          {hasRvtools ? <NetworkSecurityPanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="host" className="space-y-4">
          {hasRvtools ? <HostNetworkPanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="vlan" className="space-y-4">
          {hasRvtools ? <VlanUsagePanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="cdp" className="space-y-4">
          {hasRvtools ? <CdpPanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="ipam" className="space-y-4">
          {hasRvtools ? <IpamPanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="eramon-iface" className="space-y-4">
          {hasRvtools ? <EramonIfacePanel /> : <RvtoolsEmptyState />}
        </TabsContent>

        <TabsContent value="eramon-l2" className="space-y-4">
          {hasRvtools ? <EramonL2Panel /> : <RvtoolsEmptyState />}
        </TabsContent>

      </Tabs>
    </div>
  );
}

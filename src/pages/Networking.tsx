import { Network } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NET_NETWORK_TABS } from "@/lib/glossaries/networking";
import {
  parseNetworkTab,
  updateNetworkAuditSearch,
  type NetworkTab,
} from "@/lib/networkAuditNavigation";

function RvtoolsEmptyState() {
  return (
    <EmptyState
      icon={<Network className="h-6 w-6" />}
      title="Keine RVTools-Daten"
      description="Laden Sie RVTools-Daten hoch."
      actionLabel="Zum Upload"
      actionTo="/upload"
    />
  );
}

export default function Networking({ initialTab = "security" }: { initialTab?: NetworkTab }) {
  const { snapshots, snapshotsLoading } = useActiveSnapshotIds();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseNetworkTab(searchParams, initialTab);
  const hasRvtools = snapshots.length > 0;

  const setActiveTab = (tab: NetworkTab) => {
    let nextSearchParams = updateNetworkAuditSearch(searchParams, { tab });
    if (tab === "audit" && !searchParams.has("check")) {
      nextSearchParams = updateNetworkAuditSearch(nextSearchParams, { check: "overview" });
    }
    setSearchParams(nextSearchParams);
  };

  const handleTabChange = (value: string) => {
    const tab = parseNetworkTab(new URLSearchParams({ tab: value }), activeTab);
    if (tab === value) setActiveTab(tab);
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
            <TabsList className="h-auto min-w-max justify-start gap-1 p-1">
              <InfoTooltip entry={NET_NETWORK_TABS.security} side="bottom">
                <TabsTrigger value="security" className="min-h-11">Security &amp; Policies</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.host} side="bottom">
                <TabsTrigger value="host" className="min-h-11">Host-Netzwerk</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.vlan} side="bottom">
                <TabsTrigger value="vlan" className="min-h-11">VLAN-Nutzung</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.cdp} side="bottom">
                <TabsTrigger value="cdp" className="min-h-11">CDP/Switch-Ports</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.ipam} side="bottom">
                <TabsTrigger value="ipam" className="min-h-11">IPAM</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.eramonIface} side="bottom">
                <TabsTrigger value="eramon-iface" className="min-h-11">Switch-Ports (Eramon)</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.eramonL2} side="bottom">
                <TabsTrigger value="eramon-l2" className="min-h-11">MAC-Tabelle (Eramon)</TabsTrigger>
              </InfoTooltip>
              <InfoTooltip entry={NET_NETWORK_TABS.audit} side="bottom">
                <TabsTrigger value="audit" className="min-h-11">Kontrolle</TabsTrigger>
              </InfoTooltip>
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

        <TabsContent value="audit" className="space-y-4">
          <NetworkAuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

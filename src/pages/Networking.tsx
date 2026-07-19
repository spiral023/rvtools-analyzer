import { useState } from "react";
import { Network } from "lucide-react";
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
import { SwitchPanel } from "@/pages/SwitchPanel";
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NET_NETWORK_TABS } from "@/lib/glossaries/networking";

type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "cisco-switch" | "audit";

export default function Networking({ initialTab = "security" }: { initialTab?: NetworkTab }) {
  const { snapshots, snapshotsLoading } = useActiveSnapshotIds();
  const [activeTab, setActiveTab] = useState<NetworkTab>(initialTab);

  if (snapshotsLoading) return <PageLoadingState title="Netzwerk" />;

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Netzwerk</h1>
        <EmptyState icon={<Network className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as NetworkTab)}
        className="space-y-4"
      >
        <PageHeader title="Netzwerk">
          <TabsList className="h-auto w-full justify-start gap-1 p-1">
          <InfoTooltip entry={NET_NETWORK_TABS.security} side="bottom">
            <TabsTrigger value="security">Security &amp; Policies</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.host} side="bottom">
            <TabsTrigger value="host">Host-Netzwerk</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.vlan} side="bottom">
            <TabsTrigger value="vlan">VLAN-Nutzung</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.cdp} side="bottom">
            <TabsTrigger value="cdp">CDP/Switch-Ports</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.ipam} side="bottom">
            <TabsTrigger value="ipam">IPAM</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.ciscoSwitch} side="bottom">
            <TabsTrigger value="cisco-switch">Cisco Switch</TabsTrigger>
          </InfoTooltip>
          <InfoTooltip entry={NET_NETWORK_TABS.audit} side="bottom">
            <TabsTrigger value="audit">Kontrolle</TabsTrigger>
          </InfoTooltip>
          </TabsList>
        </PageHeader>

        <TabsContent value="security" className="space-y-4">
          <NetworkSecurityPanel />
        </TabsContent>

        <TabsContent value="host" className="space-y-4">
          <HostNetworkPanel />
        </TabsContent>

        <TabsContent value="vlan" className="space-y-4">
          <VlanUsagePanel />
        </TabsContent>

        <TabsContent value="cdp" className="space-y-4">
          <CdpPanel />
        </TabsContent>

        <TabsContent value="ipam" className="space-y-4">
          <IpamPanel />
        </TabsContent>

        <TabsContent value="cisco-switch" className="space-y-4">
          <SwitchPanel />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <NetworkAuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

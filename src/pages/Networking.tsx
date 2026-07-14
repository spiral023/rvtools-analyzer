import { useState } from "react";
import { Network } from "lucide-react";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkSecurityPanel } from "@/pages/NetworkSecurity";
import { HostNetworkPanel } from "@/pages/HostNetwork";
import { VlanUsagePanel } from "@/pages/VlanUsage";
import { CdpPanel } from "@/pages/CdpSwitchPorts";

type NetworkTab = "security" | "host" | "vlan" | "cdp";

export default function Networking({ initialTab = "security" }: { initialTab?: NetworkTab }) {
  const { snapshots } = useActiveSnapshotIds();
  const [activeTab, setActiveTab] = useState<NetworkTab>(initialTab);

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
      <h1 className="text-2xl font-bold">Netzwerk</h1>
      <FilterBar />
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as NetworkTab)}
        className="space-y-4"
      >
        <TabsList className="h-auto w-full justify-start gap-1 p-1">
          <TabsTrigger value="security">Security &amp; Policies</TabsTrigger>
          <TabsTrigger value="host">Host-Netzwerk</TabsTrigger>
          <TabsTrigger value="vlan">VLAN-Nutzung</TabsTrigger>
          <TabsTrigger value="cdp">CDP/Switch-Ports</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  );
}

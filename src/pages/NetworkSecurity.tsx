import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots } from "@/data/db";
import { Network } from "lucide-react";

export default function NetworkSecurity() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Network / Security</h1>
      {snapshots.length > 0 && <FilterBar />}
      <EmptyState icon={<Network className="h-6 w-6" />} title="Netzwerk & Security Analyse" description="VLAN-Inventar, Policy-Drift, MTU-Konsistenz — verfügbar in Phase 2." actionLabel={snapshots.length === 0 ? "Zum Upload" : undefined} actionTo={snapshots.length === 0 ? "/upload" : undefined} />
    </div>
  );
}

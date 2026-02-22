import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots } from "@/data/db";
import { GitCompare } from "lucide-react";

export default function FleetCompare() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Fleet Compare</h1>
      {snapshots.length > 0 && <FilterBar />}
      <EmptyState icon={<GitCompare className="h-6 w-6" />} title="Multi-vCenter Vergleich" description="Plattform-Benchmark, Trend-Analyse, Wachstumsprognosen — verfügbar in Phase 3." actionLabel={snapshots.length === 0 ? "Zum Upload" : undefined} actionTo={snapshots.length === 0 ? "/upload" : undefined} />
    </div>
  );
}

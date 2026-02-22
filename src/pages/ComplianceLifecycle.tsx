import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots } from "@/data/db";
import { Shield } from "lucide-react";

export default function ComplianceLifecycle() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Compliance / Lifecycle</h1>
      {snapshots.length > 0 && <FilterBar />}
      <EmptyState icon={<Shield className="h-6 w-6" />} title="Compliance & Lifecycle Analyse" description="Secure Boot, HW-Version Drift, Tools-Hygiene — verfügbar in Phase 2." actionLabel={snapshots.length === 0 ? "Zum Upload" : undefined} actionTo={snapshots.length === 0 ? "/upload" : undefined} />
    </div>
  );
}

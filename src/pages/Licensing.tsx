import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/data/db";
import { Key } from "lucide-react";

export default function Licensing() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: () => db.snapshots.toArray() });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Licensing</h1>
      {snapshots.length > 0 && <FilterBar />}
      <EmptyState
        icon={<Key className="h-6 w-6" />}
        title="Lizenz-Management"
        description="Lizenzauslastung, Ablauf-Monitoring, Feature-Mapping — verfügbar in Phase 3."
        actionLabel={snapshots.length === 0 ? "Zum Upload" : undefined}
        actionTo={snapshots.length === 0 ? "/upload" : undefined}
      />
    </div>
  );
}

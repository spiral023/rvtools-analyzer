import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots } from "@/data/db";
import { Database } from "lucide-react";

export default function StorageBackup() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Storage / Backup</h1>
      {snapshots.length > 0 && <FilterBar />}
      <EmptyState icon={<Database className="h-6 w-6" />} title="Storage & Backup Analyse" description="Backup-Frische, Partition Free%, Multipath-Stabilität — verfügbar in Phase 2." actionLabel={snapshots.length === 0 ? "Zum Upload" : undefined} actionTo={snapshots.length === 0 ? "/upload" : undefined} />
    </div>
  );
}

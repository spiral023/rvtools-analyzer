import { useCallback, useMemo, useState } from "react";
import { ClientDetailDialog } from "@/components/client/ClientDetailDialog";
import { useRawSheet } from "@/hooks/useActiveSnapshots";
import { normalizeVmName } from "@/lib/vmDetail";
import type { NormalizedVm, TechInfoClientLatest } from "@/domain/models/types";

export function useClientDetailDialog(vms: NormalizedVm[]) {
  const [selectedClient, setSelectedClient] = useState<TechInfoClientLatest | null>(null);

  const matchedVm = useMemo(() => {
    if (!selectedClient) return null;
    const norm = normalizeVmName(selectedClient.clientName);
    if (!norm) return null;
    return vms.find((vm) => normalizeVmName(vm.vmName) === norm) ?? null;
  }, [selectedClient, vms]);

  const loadDetailRows = matchedVm !== null;

  const { data: rawCpuRows = [] } = useRawSheet("vCPU", loadDetailRows);
  const { data: rawMemoryRows = [] } = useRawSheet("vMemory", loadDetailRows);
  const { data: rawDiskRows = [] } = useRawSheet("vDisk", loadDetailRows);
  const { data: rawPartitionRows = [] } = useRawSheet("vPartition", loadDetailRows);
  const { data: rawNetworkRows = [] } = useRawSheet("vNetwork", loadDetailRows);
  const { data: rawSnapshotRows = [] } = useRawSheet("vSnapshot", loadDetailRows);
  const { data: rawToolsRows = [] } = useRawSheet("vTools", loadDetailRows);

  const openClientDetail = useCallback((row: TechInfoClientLatest) => {
    setSelectedClient(row);
  }, []);

  const clientDetailDialog = (
    <ClientDetailDialog
      client={selectedClient}
      vm={matchedVm}
      open={!!selectedClient}
      onClose={() => setSelectedClient(null)}
      rawCpuRows={rawCpuRows}
      rawMemoryRows={rawMemoryRows}
      rawDiskRows={rawDiskRows}
      rawPartitionRows={rawPartitionRows}
      rawNetworkRows={rawNetworkRows}
      rawSnapshotRows={rawSnapshotRows}
      rawToolsRows={rawToolsRows}
    />
  );

  return { openClientDetail, selectedClient, clientDetailDialog };
}

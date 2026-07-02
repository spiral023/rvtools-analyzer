import { useCallback, useMemo, useState } from "react";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import { useRawSheet, useTechInfoLatestByVmNames } from "@/hooks/useActiveSnapshots";
import { resolveVmDetailTarget } from "@/lib/vmDetail";
import type { NormalizedVm } from "@/domain/models/types";

export function useVmDetailDialog(vms: NormalizedVm[]) {
  const [selectedVm, setSelectedVm] = useState<NormalizedVm | null>(null);
  const loadDetailRows = selectedVm !== null;

  const techInfoVmNames = useMemo(
    () => (selectedVm ? [selectedVm.vmName] : []),
    [selectedVm],
  );
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(techInfoVmNames, loadDetailRows);

  const vmWithTechInfo = useMemo(() => {
    if (!selectedVm) return null;
    const vmNameNorm = selectedVm.vmName.trim().toLowerCase();
    const techInfo = techInfoLatest.find((entry) => entry.vmNameNorm === vmNameNorm) ?? null;
    return { ...selectedVm, sysv: techInfo?.sysv ?? null };
  }, [selectedVm, techInfoLatest]);

  const { data: rawCpuRows = [] } = useRawSheet("vCPU", loadDetailRows);
  const { data: rawMemoryRows = [] } = useRawSheet("vMemory", loadDetailRows);
  const { data: rawDiskRows = [] } = useRawSheet("vDisk", loadDetailRows);
  const { data: rawPartitionRows = [] } = useRawSheet("vPartition", loadDetailRows);
  const { data: rawNetworkRows = [] } = useRawSheet("vNetwork", loadDetailRows);
  const { data: rawSnapshotRows = [] } = useRawSheet("vSnapshot", loadDetailRows);
  const { data: rawToolsRows = [] } = useRawSheet("vTools", loadDetailRows);

  const openVmDetail = useCallback(
    (row: unknown) => {
      const vm = resolveVmDetailTarget(row, vms);
      if (vm) setSelectedVm(vm);
    },
    [vms],
  );

  const vmDetailDialog = (
    <VmDetailDialog
      vm={vmWithTechInfo}
      open={!!selectedVm}
      onClose={() => setSelectedVm(null)}
      rawCpuRows={rawCpuRows}
      rawMemoryRows={rawMemoryRows}
      rawDiskRows={rawDiskRows}
      rawPartitionRows={rawPartitionRows}
      rawNetworkRows={rawNetworkRows}
      rawSnapshotRows={rawSnapshotRows}
      rawToolsRows={rawToolsRows}
    />
  );

  return { openVmDetail, selectedVm, vmDetailDialog };
}

import { useCallback, useMemo, useState } from "react";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import { ClientDetailDialog } from "@/components/client/ClientDetailDialog";
import {
  useRawSheet,
  useTechInfoLatestByVmNames,
  useTechInfoClientLatestByClientNames,
} from "@/hooks/useActiveSnapshots";
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

  // Passenden TechInfo-Client zur VM nachladen (gleicher Namensabgleich wie in useClientDetailDialog).
  const { data: matchedClients = [], isFetching: clientFetching } =
    useTechInfoClientLatestByClientNames(techInfoVmNames, loadDetailRows);

  const matchedClient = useMemo(() => {
    if (!selectedVm) return null;
    const norm = selectedVm.vmName.trim().toLowerCase();
    return matchedClients.find((entry) => entry.clientNameNorm === norm) ?? null;
  }, [selectedVm, matchedClients]);

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

  // Dialog-Variante erst wählen, wenn der Client-Lookup abgeschlossen ist — vermeidet ein
  // kurzes Aufblitzen der Serveransicht, bevor auf die reiche Client-Ansicht umgeschaltet wird.
  const ready = selectedVm !== null && !clientFetching;
  const showClient = ready && matchedClient !== null;
  const showVm = ready && matchedClient === null;
  const onClose = () => setSelectedVm(null);

  const vmDetailDialog = (
    <>
      <ClientDetailDialog
        client={showClient ? matchedClient : null}
        vm={vmWithTechInfo}
        open={showClient}
        onClose={onClose}
        rawCpuRows={rawCpuRows}
        rawMemoryRows={rawMemoryRows}
        rawDiskRows={rawDiskRows}
        rawPartitionRows={rawPartitionRows}
        rawNetworkRows={rawNetworkRows}
        rawSnapshotRows={rawSnapshotRows}
        rawToolsRows={rawToolsRows}
      />
      <VmDetailDialog
        vm={showVm ? vmWithTechInfo : null}
        open={showVm}
        onClose={onClose}
        rawCpuRows={rawCpuRows}
        rawMemoryRows={rawMemoryRows}
        rawDiskRows={rawDiskRows}
        rawPartitionRows={rawPartitionRows}
        rawNetworkRows={rawNetworkRows}
        rawSnapshotRows={rawSnapshotRows}
        rawToolsRows={rawToolsRows}
      />
    </>
  );

  return { openVmDetail, selectedVm, vmDetailDialog };
}

import { useCallback, useMemo, useState } from "react";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import {
  useRawSheet,
  useTechInfoLatestByVmNames,
  useTechInfoClientLatestByClientNames,
} from "@/hooks/useActiveSnapshots";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import { buildVmRightsizingCandidates } from "@/domain/services/vmRightsizingService";
import { buildVmRamRightsizingCandidates } from "@/domain/services/vmRamRightsizingService";
import { resolveVmDetailTarget } from "@/lib/vmDetail";
import type { NormalizedVm } from "@/domain/models/types";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";
import { useRamRightsizingLevel } from "@/hooks/useRamRightsizingLevel";
import { RAM_RIGHTSIZING_POLICIES } from "@/domain/services/vmRamRightsizingService";

export function useVmDetailDialog(vms: NormalizedVm[]) {
  const { level: rightsizingLevel } = useCpuRightsizingLevel();
  const { level: ramRightsizingLevel } = useRamRightsizingLevel();
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
  const workload = useVmWorkloadProfiles(null, loadDetailRows);
  const rightsizingCandidates = useMemo(
    () => buildVmRightsizingCandidates({ profiles: workload.profiles, hosts: workload.hosts, level: rightsizingLevel }),
    [rightsizingLevel, workload.hosts, workload.profiles],
  );
  const ramRightsizingCandidates = useMemo(
    () => buildVmRamRightsizingCandidates({
      profiles: workload.profiles,
      vms,
      expectedSlots: workload.selectedImport?.expectedSlots,
      hasMemoryWorkloadMax: workload.hasMemoryWorkloadMax,
      policy: RAM_RIGHTSIZING_POLICIES[ramRightsizingLevel],
    }),
    [ramRightsizingLevel, vms, workload.hasMemoryWorkloadMax, workload.profiles, workload.selectedImport?.expectedSlots],
  );

  const matchedClient = useMemo(() => {
    if (!selectedVm) return null;
    const norm = selectedVm.vmName.trim().toLowerCase();
    return matchedClients.find((entry) => entry.clientNameNorm === norm) ?? null;
  }, [selectedVm, matchedClients]);

  const detailData = useMemo(() => {
    if (!selectedVm) return null;
    const vmNameNorm = selectedVm.vmName.trim().toLowerCase();
    const techInfo = techInfoLatest.find((entry) => entry.vmNameNorm === vmNameNorm) ?? null;
    const profile = workload.profiles.find(
      (entry) => entry.rvtoolsObjectKey === selectedVm.vmKey || entry.vmName.trim().toLowerCase() === vmNameNorm,
    ) ?? null;
    const rightsizing = rightsizingCandidates.find(
      (entry) => entry.objectKey === profile?.objectKey || entry.vmName.trim().toLowerCase() === vmNameNorm,
    ) ?? null;
    const ramRightsizing = ramRightsizingCandidates.find(
      (entry) => entry.objectKey === profile?.objectKey || entry.vmName.trim().toLowerCase() === vmNameNorm,
    ) ?? null;
    return { vm: selectedVm, techInfo, profile, rightsizing, ramRightsizing };
  }, [ramRightsizingCandidates, rightsizingCandidates, selectedVm, techInfoLatest, workload.profiles]);

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

  const onClose = () => setSelectedVm(null);

  const vmDetailDialog = (
    <VmDetailDialog
      vm={detailData?.vm ?? null}
      techInfo={detailData?.techInfo ?? null}
      client={matchedClient}
      workloadProfile={detailData?.profile ?? null}
      rightsizing={detailData?.rightsizing ?? null}
      ramRightsizing={detailData?.ramRightsizing ?? null}
      vropsImportedAt={workload.selectedImport?.importedAt ?? null}
      optionalDataLoading={clientFetching || workload.isLoading}
      open={selectedVm !== null}
      onClose={onClose}
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

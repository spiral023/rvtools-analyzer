import { useMemo } from "react";
import { useActiveSnapshotIds, useAllVropsLatest, useVms, useClusters, useRawSheet } from "@/hooks/useActiveSnapshots";
import { computeWhatIf, type WhatIfResult } from "@/domain/services/planningHelpers";
import type { Scenario } from "@/domain/models/types";

export function useWhatIf(scenario: Scenario | null): WhatIfResult | null {
  const { snapshots } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: rawVHost = [] } = useRawSheet("vHost");
  const { data: vropsLatest = [] } = useAllVropsLatest();

  return useMemo(() => {
    if (!scenario || scenario.groups.length === 0) return null;
    const vcenterBySnapshot = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.vcenterId]));
    return computeWhatIf(scenario, vms, rawVHost, clusters, vcenterBySnapshot, vropsLatest);
  }, [scenario, snapshots, vms, rawVHost, clusters, vropsLatest]);
}

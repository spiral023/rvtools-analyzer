import { useMemo } from "react";
import { useVms, useClusters, useRawSheet } from "@/hooks/useActiveSnapshots";
import { computeWhatIf, type WhatIfResult } from "@/domain/services/planningHelpers";
import type { Scenario } from "@/domain/models/types";

export function useWhatIf(scenario: Scenario | null): WhatIfResult | null {
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: rawVHost = [] } = useRawSheet("vHost");

  return useMemo(() => {
    if (!scenario || scenario.groups.length === 0) return null;
    return computeWhatIf(scenario, vms, rawVHost, clusters);
  }, [scenario, vms, rawVHost, clusters]);
}

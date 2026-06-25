import { useCallback, useMemo, useState } from "react";
import { HostDetailDialog } from "@/pages/Hardware";
import { useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { buildHostDetails, type HostDetail } from "@/lib/conversion";

function getHostName(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const value = (row as { host?: unknown }).host;
  return typeof value === "string" ? value.trim() : "";
}

export function useHostDetailDialog() {
  const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);
  const { allVms } = useVms();
  const { data: rawVHost = [] } = useRawSheet("vHost");
  const { data: rawHBA = [] } = useRawSheet("vHBA");
  const { data: rawNIC = [] } = useRawSheet("vNIC");

  const hostDetailsByName = useMemo(() => {
    const map = new Map<string, HostDetail>();
    for (const hostDetail of buildHostDetails(rawVHost)) {
      const key = hostDetail.host.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, hostDetail);
    }
    return map;
  }, [rawVHost]);

  const openHostDetail = useCallback(
    (row: unknown) => {
      const hostName = getHostName(row);
      if (!hostName) return;
      const hostDetail = hostDetailsByName.get(hostName.toLowerCase());
      if (hostDetail) setSelectedHost(hostDetail);
    },
    [hostDetailsByName],
  );

  const hostDetailDialog = (
    <HostDetailDialog
      host={selectedHost}
      hbaRows={rawHBA}
      nicRows={rawNIC}
      vmRows={allVms}
      open={!!selectedHost}
      onClose={() => setSelectedHost(null)}
    />
  );

  return { openHostDetail, selectedHost, hostDetailDialog };
}

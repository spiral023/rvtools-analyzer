import type { NetworkAuditSourceKey } from "@/lib/networkAuditViewModel";

export const SOURCE_LABELS: Record<NetworkAuditSourceKey, string> = {
  rvtools: "RVTools",
  cdp: "CDP",
  eramonIface: "Eramon Interface",
  eramonL2: "Eramon L2",
  ipam: "IPAM",
  techInfo: "Tech-Info",
};

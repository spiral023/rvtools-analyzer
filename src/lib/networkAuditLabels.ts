import type { NetworkAuditSourceKey } from "@/lib/networkAuditViewModel";

export const SOURCE_LABELS: Record<NetworkAuditSourceKey, string> = {
  rvtools: "RVTools",
  cdp: "CDP",
  eramonIface: "Eramon Interface",
  eramonL2: "Eramon L2",
  ipam: "IPAM",
  techInfo: "Tech-Info",
};

export function formatNetworkAuditSourceList(
  sources: NetworkAuditSourceKey[],
): string {
  const labels = sources.map((source) => SOURCE_LABELS[source]);
  if (labels.length === 0) return "benötigte Daten";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} und ${labels.at(-1)}`;
}

export function getNetworkAuditImportLabel(
  sources: NetworkAuditSourceKey[],
): string {
  if (sources.length === 0) return "Importe verwalten";
  return `${formatNetworkAuditSourceList(sources)} importieren`;
}

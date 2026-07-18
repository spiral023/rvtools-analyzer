import type { IpamLatest, NormalizedHost, TechInfoLatest } from "@/domain/models/types";
import { shortHostname } from "@/lib/networkAudit";

export interface RvtoolsHostQualityRow {
  host: string;
  cluster: string | null;
  version: string | null;
  connectionState: string | null;
  techInfoPresent: boolean;
  techInfoServerType: string | null;
  techInfoDepartment: string | null;
  ipamPresent: boolean;
  ipamAddresses: string[];
  ipamNetworks: string[];
  finding: string | null;
}

export interface TechInfoHostQualityRow {
  techInfoName: string;
  serverType: string | null;
  department: string | null;
  maintenanceWindow: string | null;
  rvtoolsPresent: boolean;
  rvtoolsHost: string | null;
  rvtoolsCluster: string | null;
  ipamPresent: boolean;
  ipamAddresses: string[];
  ipamNetworks: string[];
  finding: string | null;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
}

/** Leitet für IPv4-Adressen ein /24 bzw. für IPv6-Adressen ein /64 ab, da IPAM keinen Netzpräfix liefert. */
export function deriveIpamNetwork(ipAddress: string): string {
  const address = ipAddress.trim();
  const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255)) {
    return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  }

  if (address.includes(":")) {
    const [left, right = ""] = address.toLowerCase().split("::");
    const leftParts = left ? left.split(":") : [];
    const rightParts = right ? right.split(":") : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const parts = address.includes("::")
      ? [...leftParts, ...Array(Math.max(0, missing)).fill("0"), ...rightParts]
      : address.split(":");
    if (parts.length === 8 && parts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) {
      return `${parts.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
    }
  }

  return address;
}

function indexByShortHostname<T>(items: T[], getName: (item: T) => string | null) {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const name = getName(item);
    if (!name?.trim()) continue;
    const key = shortHostname(name);
    const entries = index.get(key) ?? [];
    entries.push(item);
    index.set(key, entries);
  }
  return index;
}

function getIpamDetails(entries: IpamLatest[]) {
  return {
    addresses: uniqueSorted(entries.map((entry) => entry.ipAddress)),
    networks: uniqueSorted(entries.map((entry) => deriveIpamNetwork(entry.ipAddress))),
  };
}

export function buildHostDataQualityRows({
  hosts,
  techInfo,
  ipam,
}: {
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}) {
  const hostsByName = indexByShortHostname(hosts, (host) => host.host);
  const techInfoByName = indexByShortHostname(techInfo, (entry) => entry.vmName);
  const ipamByName = indexByShortHostname(ipam, (entry) => entry.name);

  const rvtoolsRows: RvtoolsHostQualityRow[] = hosts.map((host) => {
    const key = shortHostname(host.host);
    const techInfoEntries = techInfoByName.get(key) ?? [];
    const ipamEntries = ipamByName.get(key) ?? [];
    const details = getIpamDetails(ipamEntries);
    const techInfoEntry = techInfoEntries[0];
    const missing = [
      !techInfoEntry && "Tech-Info fehlt",
      ipamEntries.length === 0 && "IPAM fehlt",
    ].filter(Boolean) as string[];

    return {
      host: host.host,
      cluster: host.cluster,
      version: host.version,
      connectionState: host.connectionState,
      techInfoPresent: Boolean(techInfoEntry),
      techInfoServerType: techInfoEntry?.serverType ?? null,
      techInfoDepartment: techInfoEntry?.sysvDepartment ?? null,
      ipamPresent: ipamEntries.length > 0,
      ipamAddresses: details.addresses,
      ipamNetworks: details.networks,
      finding: missing.length > 0 ? missing.join(" · ") : null,
    };
  });

  const techInfoRows: TechInfoHostQualityRow[] = techInfo.map((entry) => {
    const key = shortHostname(entry.vmName);
    const matchingHosts = hostsByName.get(key) ?? [];
    const ipamEntries = ipamByName.get(key) ?? [];
    const details = getIpamDetails(ipamEntries);
    const host = matchingHosts[0];
    const missing = [
      !host && "RVTools-Host fehlt",
      ipamEntries.length === 0 && "IPAM fehlt",
    ].filter(Boolean) as string[];

    return {
      techInfoName: entry.vmName,
      serverType: entry.serverType,
      department: entry.sysvDepartment,
      maintenanceWindow: entry.maintenanceWindow,
      rvtoolsPresent: Boolean(host),
      rvtoolsHost: host?.host ?? null,
      rvtoolsCluster: host?.cluster ?? null,
      ipamPresent: ipamEntries.length > 0,
      ipamAddresses: details.addresses,
      ipamNetworks: details.networks,
      finding: missing.length > 0 ? missing.join(" · ") : null,
    };
  });

  return { rvtoolsRows, techInfoRows };
}

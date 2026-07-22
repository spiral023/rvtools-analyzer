import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest, EramonIfaceLatest, EramonL2Latest } from "@/domain/models/types";

export type PortMatchStatus = "confirmed-cdp" | "no-target" | "text-match" | "documented-only" | "unknown";
export type MatchedSource = "cdp" | "rvtools" | "techinfo" | "ipam";

export interface PortAuditRow {
  switchInterfaceKey: string;
  switchHostname: string;
  interface: string;
  description: string | null;
  status: string | null;
  matchStatus: PortMatchStatus;
  matchedHost: string | null;
  matchedSource: MatchedSource | null;
  labelConflict: boolean;
  labelConflictHost: string | null;
  statusConflict: boolean;
  sources: ("cisco" | "eramon")[];
  bandwidthBps: number | null;
  sourceConflict: boolean;
  finding: string | null;
}

const PORT_SUFFIX_REGEX = /[\s_-]?port\s*\d+$/i;

/** "esxxsrv2270.rbgooe.at" -> "esxxsrv2270"; bereits kurze Namen bleiben (kleingeschrieben) unverändert. */
export function shortHostname(name: string): string {
  return name.trim().split(".")[0].toLowerCase();
}

/** "esxxsrv2270_Port2" -> "esxxsrv2270"; ohne Suffix unverändert (nur getrimmt). */
export function stripPortSuffix(description: string): string {
  return description.trim().replace(PORT_SUFFIX_REGEX, "").trim();
}

/** "grznx93oc18-8.domain.at(SERIAL)" -> "grznx93oc18-8" — Seriennummer in Klammern und Domain abschneiden. */
export function extractCdpDeviceHostname(cdpDeviceId: string): string {
  const withoutSerial = cdpDeviceId.replace(/\([^)]*\)\s*$/, "").trim();
  return shortHostname(withoutSerial);
}

/** "Ethernet1/13" -> "eth1/13"; "Eth1/1" -> "eth1/1". */
export function normalizeInterfaceName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^ethernet/, "eth");
}

/**
 * "00:50:56:AB:CD:EF" | "0050.56ab.cdef" | "00-50-56-ab-cd-ef" -> "005056abcdef".
 * Grundlage jedes CDP<->L2-MAC-Vergleichs.
 */
export function canonicalMac(raw: string | null): string | null {
  if (!raw) return null;
  const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 12 ? hex.slice(0, 12) : null;
}

interface BuildPortAuditRowsInput {
  switchRows: SwitchLatest[];
  eramonIfaceRows?: EramonIfaceLatest[];
  cdpRows: CdpLatest[];
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}

interface MergedPort {
  key: string;
  switchInterfaceKey: string;
  switchHostname: string;
  interface: string;
  ciscoDescription: string | null;
  ciscoStatus: string | null;
  eramonPortDesc: string | null;
  eramonStatusLabel: string | null;
  bandwidthBps: number | null;
  sources: ("cisco" | "eramon")[];
}

export function buildPortAuditRows(input: BuildPortAuditRowsInput): PortAuditRow[] {
  const { switchRows, cdpRows, hosts, techInfo, ipam } = input;
  const eramonIfaceRows = input.eramonIfaceRows ?? [];

  const cdpByPort = new Map<string, CdpLatest>();
  for (const cdp of cdpRows) {
    if (cdp.cdpAvailable !== true || !cdp.cdpDeviceId || !cdp.cdpPortId) continue;
    const key = `${normalizeVmNameForMatch(extractCdpDeviceHostname(cdp.cdpDeviceId))}::${normalizeInterfaceName(cdp.cdpPortId)}`;
    cdpByPort.set(key, cdp);
  }

  const rvtoolsHostSet = new Set(hosts.map((h) => shortHostname(h.host)));
  const techInfoNameSet = new Set(techInfo.map((t) => shortHostname(t.vmName)));
  const ipamNameSet = new Set<string>();
  for (const entry of ipam) {
    if (entry.name) ipamNameSet.add(shortHostname(entry.name));
  }

  const merged = new Map<string, MergedPort>();
  for (const port of switchRows) {
    const key = `${shortHostname(port.hostname)}::${normalizeInterfaceName(port.interface)}`;
    merged.set(key, {
      key,
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.hostname,
      interface: port.interface,
      ciscoDescription: port.description,
      ciscoStatus: port.status,
      eramonPortDesc: null,
      eramonStatusLabel: null,
      bandwidthBps: null,
      sources: ["cisco"],
    });
  }
  for (const iface of eramonIfaceRows) {
    const key = `${shortHostname(iface.deviceName)}::${normalizeInterfaceName(iface.portName)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.eramonPortDesc = iface.portDesc;
      existing.eramonStatusLabel = iface.statusLabel;
      existing.bandwidthBps = iface.bandbreiteBps;
      if (!existing.sources.includes("eramon")) existing.sources.push("eramon");
    } else {
      merged.set(key, {
        key,
        switchInterfaceKey: iface.switchPortKey,
        switchHostname: iface.deviceName,
        interface: iface.portName,
        ciscoDescription: null,
        ciscoStatus: null,
        eramonPortDesc: iface.portDesc,
        eramonStatusLabel: iface.statusLabel,
        bandwidthBps: iface.bandbreiteBps,
        sources: ["eramon"],
      });
    }
  }

  return [...merged.values()].map((port): PortAuditRow => {
    const cdp = cdpByPort.get(port.key);
    const description = port.ciscoDescription ?? port.eramonPortDesc;
    const rawStatus = port.ciscoStatus ?? port.eramonStatusLabel;
    const candidate = description && description !== "--" ? stripPortSuffix(description) : "";
    const candidateShort = candidate ? shortHostname(candidate) : "";
    const switchConnected = port.ciscoStatus ? port.ciscoStatus === "connected" : port.eramonStatusLabel === "aktiv";

    let matchStatus: PortMatchStatus;
    let matchedHost: string | null = null;
    let matchedSource: MatchedSource | null = null;

    if (cdp) {
      matchStatus = "confirmed-cdp";
      matchedHost = cdp.host;
      matchedSource = "cdp";
    } else if (!candidateShort) {
      matchStatus = "no-target";
    } else if (rvtoolsHostSet.has(candidateShort)) {
      matchStatus = "text-match";
      matchedHost = candidate;
      matchedSource = "rvtools";
    } else if (techInfoNameSet.has(candidateShort)) {
      matchStatus = "documented-only";
      matchedHost = candidate;
      matchedSource = "techinfo";
    } else if (ipamNameSet.has(candidateShort)) {
      matchStatus = "documented-only";
      matchedHost = candidate;
      matchedSource = "ipam";
    } else {
      matchStatus = "unknown";
    }

    let labelConflict = false;
    let labelConflictHost: string | null = null;
    let statusConflict = false;

    if (cdp) {
      if (candidateShort && candidateShort !== shortHostname(cdp.host)) {
        labelConflict = true;
        labelConflictHost = cdp.host;
      }
      if (cdp.linkStatus) {
        const cdpUp = cdp.linkStatus.toLowerCase() === "up";
        if (switchConnected !== cdpUp) statusConflict = true;
      }
    }

    let sourceConflict = false;
    let sourceConflictText = "";
    if (port.sources.length > 1) {
      const ciscoCandidate = port.ciscoDescription && port.ciscoDescription !== "--" ? shortHostname(stripPortSuffix(port.ciscoDescription)) : "";
      const eramonCandidate = port.eramonPortDesc && port.eramonPortDesc !== "--" ? shortHostname(stripPortSuffix(port.eramonPortDesc)) : "";
      const labelDiverges = Boolean(ciscoCandidate && eramonCandidate && ciscoCandidate !== eramonCandidate);
      const statusDiverges = port.ciscoStatus !== null && port.eramonStatusLabel !== null
        && (port.ciscoStatus === "connected") !== (port.eramonStatusLabel === "aktiv");
      sourceConflict = labelDiverges || statusDiverges;
      const parts: string[] = [];
      if (labelDiverges) parts.push(`Cisco-Beschriftung "${port.ciscoDescription}" ≠ Eramon "${port.eramonPortDesc}"`);
      if (statusDiverges) parts.push(`Cisco meldet "${port.ciscoStatus}", Eramon meldet "${port.eramonStatusLabel}"`);
      sourceConflictText = parts.join("; ");
    }

    const findingParts: string[] = [];
    if (labelConflict && statusConflict) {
      findingParts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"; Switch meldet "${rawStatus}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (labelConflict) {
      findingParts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"`);
    } else if (statusConflict) {
      findingParts.push(`Switch meldet "${rawStatus}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (matchStatus === "documented-only") {
      findingParts.push(`Nur in ${matchedSource === "techinfo" ? "TechInfo" : "IPAM"} dokumentiert, kein aktiver RVTools-Host`);
    } else if (matchStatus === "unknown") {
      findingParts.push("Kein bekannter Host gefunden");
    }
    if (sourceConflict) findingParts.push(sourceConflictText);

    return {
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.switchHostname,
      interface: port.interface,
      description,
      status: rawStatus,
      matchStatus,
      matchedHost,
      matchedSource,
      labelConflict,
      labelConflictHost,
      statusConflict,
      sources: port.sources,
      bandwidthBps: port.bandwidthBps,
      sourceConflict,
      finding: findingParts.length ? findingParts.join(" · ") : null,
    };
  });
}

export interface CdpMacRow {
  host: string;
  adapter: string;
  mac: string | null;
  macCanonical: string | null;
  inL2: boolean;
  l2Switch: string | null;
  l2Interface: string | null;
  vlan: string | null;
  learnedIp: string | null;
  dnsName: string | null;
  topologyMismatch: boolean;
  finding: string | null;
}

export function buildCdpMacRows(input: { cdpRows: CdpLatest[]; l2Rows: EramonL2Latest[] }): CdpMacRow[] {
  const l2ByMac = new Map<string, EramonL2Latest[]>();
  for (const l2 of input.l2Rows) {
    const macCanonical = canonicalMac(l2.mac);
    if (!macCanonical) continue;
    const matches = l2ByMac.get(macCanonical);
    if (matches) matches.push(l2);
    else l2ByMac.set(macCanonical, [l2]);
  }

  const rows: CdpMacRow[] = [];
  for (const cdp of input.cdpRows) {
    const macCanonical = canonicalMac(cdp.mac);
    if (!macCanonical) continue;

    const matches = l2ByMac.get(macCanonical) ?? [];
    const cdpSwitch = cdp.cdpDeviceId ? extractCdpDeviceHostname(cdp.cdpDeviceId) : null;
    const cdpInterface = cdp.cdpPortId ? normalizeInterfaceName(cdp.cdpPortId) : null;

    if (matches.length === 0) {
      rows.push({
        host: cdp.host,
        adapter: cdp.adapter,
        mac: cdp.mac,
        macCanonical,
        inL2: false,
        l2Switch: null,
        l2Interface: null,
        vlan: null,
        learnedIp: null,
        dnsName: null,
        topologyMismatch: false,
        finding: "MAC nicht in L2-Tabelle",
      });
      continue;
    }

    for (const l2 of matches) {
      const l2Key = `${normalizeVmNameForMatch(shortHostname(l2.switchName))}::${normalizeInterfaceName(l2.interface)}`;
      const cdpKey = cdpSwitch && cdpInterface ? `${normalizeVmNameForMatch(cdpSwitch)}::${cdpInterface}` : null;
      const topologyMismatch = cdpKey !== null && cdpKey !== l2Key;
      rows.push({
        host: cdp.host,
        adapter: cdp.adapter,
        mac: cdp.mac,
        macCanonical,
        inL2: true,
        l2Switch: l2.switchName,
        l2Interface: l2.interface,
        vlan: l2.vlan || null,
        learnedIp: l2.ip,
        dnsName: l2.dnsName,
        topologyMismatch,
        finding: topologyMismatch
          ? `Topologie weicht ab: CDP ${cdpSwitch}/${cdp.cdpPortId}, L2 ${l2.switchName}/${l2.interface}`
          : null,
      });
    }
  }

  return rows;
}

export type L2Classification = "esxi-cdp" | "ipam" | "unknown";

export interface L2DiscoveryRow {
  l2EntryKey: string;
  switchName: string;
  interface: string;
  vlan: string;
  mac: string;
  learnedIp: string | null;
  dnsName: string | null;
  classification: L2Classification;
  esxiHost: string | null;
}

export function buildL2DiscoveryRows(input: {
  l2Rows: EramonL2Latest[];
  cdpRows: CdpLatest[];
  ipam: IpamLatest[];
}): L2DiscoveryRow[] {
  const cdpMacToHost = new Map<string, string>();
  for (const cdp of input.cdpRows) {
    const macCanonical = canonicalMac(cdp.mac);
    if (macCanonical && !cdpMacToHost.has(macCanonical)) cdpMacToHost.set(macCanonical, cdp.host);
  }

  const ipamIps = new Set<string>();
  for (const entry of input.ipam) {
    if (entry.ipAddress) ipamIps.add(entry.ipAddress.trim().toLowerCase());
  }

  return input.l2Rows.map((l2): L2DiscoveryRow => {
    const macCanonical = canonicalMac(l2.mac);
    const esxiHost = macCanonical ? cdpMacToHost.get(macCanonical) ?? null : null;
    const classification: L2Classification = esxiHost
      ? "esxi-cdp"
      : l2.ip && ipamIps.has(l2.ip.trim().toLowerCase())
        ? "ipam"
        : "unknown";

    return {
      l2EntryKey: l2.l2EntryKey,
      switchName: l2.switchName,
      interface: l2.interface,
      vlan: l2.vlan,
      mac: l2.mac,
      learnedIp: l2.ip,
      dnsName: l2.dnsName,
      classification,
      esxiHost,
    };
  });
}

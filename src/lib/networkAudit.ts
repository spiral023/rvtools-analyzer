import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { CdpLatest, NormalizedHost, SheetRow, TechInfoLatest, IpamLatest, EramonIfaceLatest, EramonL2Latest } from "@/domain/models/types";

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
  bandwidthBps: number | null;
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

const LABEL_HOST_CORE_REGEX = /^[\w.-]+/;

/**
 * Extrahiert den führenden Hostnamen-Kandidaten aus oft dekorierten Portbeschriftungen wie
 * "esxivdi1185(Trunk Prod) [E:0010]" oder "esxivdi1193 vSAN [E:0010]" -> "esxivdi1185"/"esxivdi1193".
 * Bricht am ersten Zeichen ab, das kein Bestandteil eines Hostnamens ist (Leerzeichen, Klammern etc.).
 */
export function extractLabelHostCore(description: string): string {
  const match = description.trim().match(LABEL_HOST_CORE_REGEX);
  return match ? shortHostname(match[0]) : "";
}

/**
 * Vergleicht Label- und CDP-Hostkern tolerant gegenüber angehängten Zusätzen: Beschriftungen
 * hängen manchmal ein Team-/Standort-Kürzel direkt an den echten Hostnamen an (z. B.
 * "esxivdi2168_itsp" für Host "esxivdi2168"). Das gilt nur als Zusatz, wenn direkt nach dem
 * gemeinsamen Präfix eine Nicht-alphanumerische Grenze folgt — sonst wäre z. B. "esxivdi216"
 * fälschlich ein Präfix-Treffer für den eigentlich anderen Host "esxivdi2168".
 */
export function hostCoresMatch(labelCore: string, cdpCore: string): boolean {
  if (!labelCore || !cdpCore) return false;
  if (labelCore === cdpCore) return true;
  if (!labelCore.startsWith(cdpCore)) return false;
  const boundary = labelCore[cdpCore.length];
  return boundary !== undefined && !/[a-z0-9]/i.test(boundary);
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
  eramonIfaceRows: EramonIfaceLatest[];
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
  description: string | null;
  status: string | null;
  bandwidthBps: number | null;
}

export function buildPortAuditRows(input: BuildPortAuditRowsInput): PortAuditRow[] {
  const { eramonIfaceRows, cdpRows, hosts, techInfo, ipam } = input;

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
  for (const iface of eramonIfaceRows) {
    const key = `${shortHostname(iface.deviceName)}::${normalizeInterfaceName(iface.portName)}`;
    merged.set(key, {
      key,
      switchInterfaceKey: iface.switchPortKey,
      switchHostname: iface.deviceName,
      interface: iface.portName,
      description: iface.portDesc,
      status: iface.statusLabel,
      bandwidthBps: iface.bandbreiteBps,
    });
  }

  return [...merged.values()].map((port): PortAuditRow => {
    const cdp = cdpByPort.get(port.key);
    const candidate = port.description && port.description !== "--" ? stripPortSuffix(port.description) : "";
    const candidateCore = candidate ? extractLabelHostCore(candidate) : "";
    const switchConnected = port.status === "aktiv";

    let matchStatus: PortMatchStatus;
    let matchedHost: string | null = null;
    let matchedSource: MatchedSource | null = null;

    if (cdp) {
      matchStatus = "confirmed-cdp";
      matchedHost = cdp.host;
      matchedSource = "cdp";
    } else if (!candidateCore) {
      matchStatus = "no-target";
    } else if (rvtoolsHostSet.has(candidateCore)) {
      matchStatus = "text-match";
      matchedHost = candidate;
      matchedSource = "rvtools";
    } else if (techInfoNameSet.has(candidateCore)) {
      matchStatus = "documented-only";
      matchedHost = candidate;
      matchedSource = "techinfo";
    } else if (ipamNameSet.has(candidateCore)) {
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
      if (candidateCore && !hostCoresMatch(candidateCore, shortHostname(cdp.host))) {
        labelConflict = true;
        labelConflictHost = cdp.host;
      }
      if (cdp.linkStatus) {
        const cdpUp = cdp.linkStatus.toLowerCase() === "up";
        if (switchConnected !== cdpUp) statusConflict = true;
      }
    }

    const findingParts: string[] = [];
    if (labelConflict && statusConflict) {
      findingParts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"; Switch meldet "${port.status}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (labelConflict) {
      findingParts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"`);
    } else if (statusConflict) {
      findingParts.push(`Switch meldet "${port.status}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (matchStatus === "documented-only") {
      findingParts.push(`Nur in ${matchedSource === "techinfo" ? "TechInfo" : "IPAM"} dokumentiert, kein aktiver RVTools-Host`);
    } else if (matchStatus === "unknown") {
      findingParts.push("Kein bekannter Host gefunden");
    }
    return {
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.switchHostname,
      interface: port.interface,
      description: port.description,
      status: port.status,
      matchStatus,
      matchedHost,
      matchedSource,
      labelConflict,
      labelConflictHost,
      statusConflict,
      bandwidthBps: port.bandwidthBps,
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

/** VMkernel-Interface eines ESXi-Hosts aus dem RVTools-Blatt `vSC_VMK`. */
export interface VmkAdapter {
  host: string;
  device: string;
  mac: string | null;
}

function sheetText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

/**
 * Liest Host, Gerät und MAC der VMkernel-Interfaces aus den Rohzeilen von `vSC_VMK`. Nur diese drei
 * Felder, weil der Audit-Abgleich rein über die MAC läuft; die übrigen Spalten des Blatts
 * (Port Group, IP, MTU, DHCP) zeigt die Netzwerk-und-Sicherheitsansicht.
 */
export function extractVmkAdapters(rows: readonly SheetRow[]): VmkAdapter[] {
  return rows
    .map((row) => ({
      host: sheetText(row.data["Host"]),
      device: sheetText(row.data["Device"]),
      mac: sheetText(row.data["Mac Address"]) || null,
    }))
    .filter((adapter) => adapter.host !== "" && adapter.mac !== null);
}

export type L2Classification = "esxi-cdp" | "esxi-vmk" | "ipam" | "unknown";

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
  /** Gesetzt, wenn die MAC einem VMkernel-Interface gehört – etwa `vmk0` oder `vmk1`. */
  esxiVmkDevice: string | null;
}

export function buildL2DiscoveryRows(input: {
  l2Rows: EramonL2Latest[];
  cdpRows: CdpLatest[];
  ipam: IpamLatest[];
  /** Optional: ohne RVTools-Import bleibt die Zuordnung wie bisher rein CDP-basiert. */
  vmkAdapters?: VmkAdapter[];
}): L2DiscoveryRow[] {
  const cdpMacToHost = new Map<string, string>();
  for (const cdp of input.cdpRows) {
    const macCanonical = canonicalMac(cdp.mac);
    if (macCanonical && !cdpMacToHost.has(macCanonical)) cdpMacToHost.set(macCanonical, cdp.host);
  }

  const vmkMacToAdapter = new Map<string, VmkAdapter>();
  for (const adapter of input.vmkAdapters ?? []) {
    const macCanonical = canonicalMac(adapter.mac);
    if (macCanonical && !vmkMacToAdapter.has(macCanonical)) vmkMacToAdapter.set(macCanonical, adapter);
  }

  const ipamIps = new Set<string>();
  for (const entry of input.ipam) {
    if (entry.ipAddress) ipamIps.add(entry.ipAddress.trim().toLowerCase());
  }

  return input.l2Rows.map((l2): L2DiscoveryRow => {
    const macCanonical = canonicalMac(l2.mac);
    // CDP hat Vorrang: dort hängt die MAC nachweislich am gemeldeten Switch-Port. Die vmk-Zuordnung
    // belegt nur, dass die MAC zu einem bekannten Host gehört – über welchen Uplink sie gerade
    // gelernt wurde, entscheidet das NIC-Teaming.
    const cdpHost = macCanonical ? cdpMacToHost.get(macCanonical) ?? null : null;
    const vmkAdapter = macCanonical && !cdpHost ? vmkMacToAdapter.get(macCanonical) ?? null : null;
    const esxiHost = cdpHost ?? vmkAdapter?.host ?? null;
    const classification: L2Classification = cdpHost
      ? "esxi-cdp"
      : vmkAdapter
        ? "esxi-vmk"
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
      esxiVmkDevice: vmkAdapter?.device || null,
    };
  });
}

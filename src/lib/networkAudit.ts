import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest } from "@/domain/models/types";

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
  cdpRows: CdpLatest[];
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}

export function buildPortAuditRows(input: BuildPortAuditRowsInput): PortAuditRow[] {
  const { switchRows, cdpRows, hosts, techInfo, ipam } = input;

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

  return switchRows.map((port): PortAuditRow => {
    const key = `${shortHostname(port.hostname)}::${normalizeInterfaceName(port.interface)}`;
    const cdp = cdpByPort.get(key);
    const candidate = port.description && port.description !== "--" ? stripPortSuffix(port.description) : "";
    const candidateShort = candidate ? shortHostname(candidate) : "";

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
        const switchConnected = port.status === "connected";
        if (switchConnected !== cdpUp) statusConflict = true;
      }
    }

    let finding: string | null = null;
    if (labelConflict && statusConflict) {
      finding = `Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"; Switch meldet "${port.status}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`;
    } else if (labelConflict) {
      finding = `Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"`;
    } else if (statusConflict) {
      finding = `Switch meldet "${port.status}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`;
    } else if (matchStatus === "documented-only") {
      finding = `Nur in ${matchedSource === "techinfo" ? "TechInfo" : "IPAM"} dokumentiert, kein aktiver RVTools-Host`;
    } else if (matchStatus === "unknown") {
      finding = "Kein bekannter Host gefunden";
    }

    return {
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.hostname,
      interface: port.interface,
      description: port.description,
      status: port.status,
      matchStatus,
      matchedHost,
      matchedSource,
      labelConflict,
      labelConflictHost,
      statusConflict,
      finding,
    };
  });
}

import type { SheetRow } from "@/domain/models/types";

export interface HostDetail {
  host: string;
  datacenter: string | null;
  cluster: string | null;
  model: string;
  vendor: string;
  serial: string;
  cpuModel: string;
  cpuSockets: number;
  coresPerCpu: number;
  totalCores: number;
  threads: number;
  speedMHz: number;
  memoryMiB: number;
  esxVersion: string;
  biosVendor: string;
  biosVersion: string;
  biosDate: string;
  vmCount: number;
  nicCount: number;
  hbaCount: number;
  htActive: boolean;
  maintenanceMode: boolean;
  serviceTag: string;
}

export function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function bool(v: unknown): boolean {
  if (v == null) return false;
  const s = str(v).toLowerCase();
  return s === "true" || s === "1";
}

export const toNumLoose = num;

export function toBoolLoose(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  const s = str(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export function normalizeHardwareModel(vendor: string, model: string): string {
  const cleaned = model.trim().replace(/^"+|"+$/g, "").replace(/\s+/g, " ");
  const isHitachi = vendor.toLowerCase().includes("hitachi");
  if (!isHitachi) return cleaned;

  const advancedServerMatch = cleaned.match(
    /^advanced server ds(\d+)\s+g2(?:[\s\-_]+#?([a-z0-9]+))?$/i,
  );
  if (advancedServerMatch) {
    const canonicalBase = `Advanced Server DS${advancedServerMatch[1]} G2`;
    const suffix = advancedServerMatch[2];
    if (!suffix) return canonicalBase;
    if (/^\d+$/.test(suffix)) return canonicalBase;
    if (/^[a-z0-9]{8,}$/i.test(suffix)) return canonicalBase;
  }

  return cleaned;
}

export function buildHostDetails(hostRows: SheetRow[]): HostDetail[] {
  return hostRows.map((r) => {
    const d = r.data;
    const vendor = str(d["Vendor"]);
    const rawModel = str(d["Model"]);
    return {
      host: str(d["Host"]),
      datacenter: str(d["Datacenter"]) || null,
      cluster: str(d["Cluster"]) || null,
      model: normalizeHardwareModel(vendor, rawModel),
      vendor,
      serial: str(d["Serial number"]),
      cpuModel: str(d["CPU Model"]),
      cpuSockets: num(d["# CPU"]),
      coresPerCpu: num(d["Cores per CPU"]),
      totalCores: num(d["# Cores"]),
      threads: num(d["NumCpuThreads"]) || num(d["# Cores"]) * 2,
      speedMHz: num(d["Speed"]),
      memoryMiB: num(d["# Memory"]),
      esxVersion: str(d["ESX Version"]),
      biosVendor: str(d["BIOS Vendor"]),
      biosVersion: str(d["BIOS Version"]),
      biosDate: str(d["BIOS Date"]),
      vmCount: num(d["# VMs"]),
      nicCount: num(d["# NICs"]),
      hbaCount: num(d["# HBAs"]),
      htActive: bool(d["HT Active"]),
      maintenanceMode: bool(d["in Maintenance Mode"]),
      serviceTag: str(d["Service tag"]),
    };
  });
}

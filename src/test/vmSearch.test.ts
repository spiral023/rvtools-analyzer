import { describe, expect, it } from "vitest";
import type { NormalizedVm, TechInfoLatest } from "@/domain/models/types";
import { buildTechInfoSearchIndex, matchesVmSearch, normalizeVmSearchTerm } from "@/lib/vmSearch";

function vm(overrides: Partial<NormalizedVm> & { vmName: string }): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmKey: overrides.vmName,
    vmUuid: null,
    cluster: "Cluster A",
    host: "esx01.example.local",
    powerState: "poweredOn",
    cpuCount: 4,
    memoryMiB: 8_192,
    provisionedMiB: null,
    inUseMiB: null,
    osConfig: "Microsoft Windows Server 2019 (64-bit)",
    osTools: "Microsoft Windows Server 2019",
    ...overrides,
  } as NormalizedVm;
}

function techInfo(vmName: string, sysv: string | null, sysvDepartment: string | null = null): TechInfoLatest {
  return {
    vmNameNorm: vmName.trim().toLowerCase(),
    vmName,
    importedAt: "2026-07-30T00:00:00.000Z",
    techInfoImportId: "import-1",
    rowIndex: 0,
    serverType: null,
    maintenanceWindow: null,
    operatingSystem: null,
    comment: null,
    sysv,
    sysvDepartment,
    sysvDeputy: null,
    sysvDeputyDepartment: null,
    bz: null,
    clusterFromTechInfo: null,
    cvBackup: null,
    az: null,
  };
}

const sysvIndex = buildTechInfoSearchIndex([
  techInfo("APP01", "Müller, Anna", "RAITEC/IN-VIA"),
  techInfo("DB01", "Šimon Novák", "RAITEC/BS-DBA"),
  techInfo("WEB01", "   "),
  techInfo("BATCH01", null, "RAITEC/IN-VIA"),
]);

describe("buildTechInfoSearchIndex", () => {
  it("übernimmt Systemverantwortliche und Abteilung, überspringt leere Einträge", () => {
    expect(sysvIndex.get("app01")).toEqual({ sysv: "Müller, Anna", sysvDepartment: "RAITEC/IN-VIA" });
    expect(sysvIndex.has("web01")).toBe(false);
    // Eine Abteilung ohne benannte Person bleibt suchbar.
    expect(sysvIndex.get("batch01")).toEqual({ sysv: null, sysvDepartment: "RAITEC/IN-VIA" });
  });
});

describe("matchesVmSearch – Abteilung", () => {
  it("filtert über die Abteilung auf die VMs dieser Abteilung", () => {
    expect(matchesVmSearch(vm({ vmName: "APP01" }), normalizeVmSearchTerm("VIA"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(vm({ vmName: "DB01" }), normalizeVmSearchTerm("VIA"), sysvIndex)).toBe(false);
    // Auch ohne hinterlegte Person trifft die Abteilung.
    expect(matchesVmSearch(vm({ vmName: "BATCH01" }), normalizeVmSearchTerm("in-via"), sysvIndex)).toBe(true);
  });

  it("trifft ebenso über Bereich, Organisation und den vollständigen Pfad", () => {
    const candidate = vm({ vmName: "DB01" });
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("BS-"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("raitec"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("RAITEC/BS-DBA"), sysvIndex)).toBe(true);
  });
});

describe("matchesVmSearch", () => {
  it("findet über den Systemverantwortlichen aus der Tech-Info", () => {
    expect(matchesVmSearch(vm({ vmName: "APP01" }), normalizeVmSearchTerm("Müller"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(vm({ vmName: "DB01" }), normalizeVmSearchTerm("müller"), sysvIndex)).toBe(false);
  });

  it("findet weiterhin über VM-Name, Cluster, Host und Betriebssystem", () => {
    const candidate = vm({ vmName: "APP01" });
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("app0"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("cluster a"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("ESX01"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("windows server 2019"), sysvIndex)).toBe(true);
    expect(matchesVmSearch(candidate, normalizeVmSearchTerm("linux"), sysvIndex)).toBe(false);
  });

  it("behandelt VMs ohne Tech-Info-Zuordnung und ohne Suchbegriff", () => {
    expect(matchesVmSearch(vm({ vmName: "OHNE-TECHINFO" }), normalizeVmSearchTerm("müller"), sysvIndex)).toBe(false);
    expect(matchesVmSearch(vm({ vmName: "OHNE-TECHINFO" }), "", sysvIndex)).toBe(true);
  });

  it("sucht unabhängig von Groß- und Kleinschreibung, auch bei Sonderzeichen", () => {
    expect(matchesVmSearch(vm({ vmName: "DB01" }), normalizeVmSearchTerm("ŠIMON"), sysvIndex)).toBe(true);
  });
});

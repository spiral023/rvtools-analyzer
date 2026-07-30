import { describe, expect, it } from "vitest";
import type { NormalizedVm, TechInfoLatest } from "@/domain/models/types";
import { buildSysvSearchIndex, matchesVmSearch, normalizeVmSearchTerm } from "@/lib/vmSearch";

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

function techInfo(vmName: string, sysv: string | null): TechInfoLatest {
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
    sysvDepartment: null,
    sysvDeputy: null,
    sysvDeputyDepartment: null,
    bz: null,
    clusterFromTechInfo: null,
    cvBackup: null,
    az: null,
  };
}

const sysvIndex = buildSysvSearchIndex([
  techInfo("APP01", "Müller, Anna"),
  techInfo("DB01", "Šimon Novák"),
  techInfo("WEB01", "   "),
]);

describe("buildSysvSearchIndex", () => {
  it("übernimmt nur belegte Systemverantwortliche", () => {
    expect(sysvIndex.get("app01")).toBe("müller, anna");
    expect(sysvIndex.has("web01")).toBe(false);
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

import { describe, expect, it } from "vitest";
import {
  buildMaintenanceMailTemplate,
  buildMaintenanceRows,
  deriveSettingsEmail,
  parseTechContactName,
  transliterateEmailPart,
} from "@/lib/maintenance";
import type { NormalizedCluster, NormalizedHost, NormalizedVm, SheetRow } from "@/domain/models/types";

describe("maintenance settings mail derivation", () => {
  it("transliterates umlauts, removes spaces and lowercases email parts", () => {
    expect(transliterateEmailPart(" Jörg Weiß GmbH ")).toBe("joergweissgmbh");
    expect(transliterateEmailPart("Müller & Söhne")).toBe("muellersoehne");
  });

  it("derives the fixed .at mail format from settings", () => {
    expect(
      deriveSettingsEmail({
        firstName: "Jörg",
        lastName: "Weiß",
        companyName: "Müller IT",
      }),
    ).toBe("joerg.weiss@muellerit.at");
  });
});

describe("maintenance contact helpers", () => {
  it("splits Tech-Info contact names from 'Nachname Vorname' format", () => {
    expect(parseTechContactName("Mustermann Max Peter")).toEqual({
      lastName: "Mustermann",
      firstName: "Max Peter",
    });
  });
});

describe("maintenance cluster capacity", () => {
  const clusters: NormalizedCluster[] = [
    {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      clusterKey: "cluster-1",
      name: "CL-Prod",
      datacenter: "DC1",
      haEnabled: true,
      drsEnabled: true,
      numHosts: 2,
      numCpuCores: 20,
      numCpuThreads: 40,
      totalMemoryMiB: 196_608,
      totalCpuMHz: 50_000,
      numEffectiveHosts: 2,
    },
  ];

  const hosts: NormalizedHost[] = [
    {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      hostKey: "host-1",
      host: "esx01",
      cluster: "CL-Prod",
      datacenter: "DC1",
      cpuModel: null,
      cpuTotalMHz: 25_000,
      cpuCores: 10,
      cpuThreads: 20,
      memoryTotalMiB: 98_304,
      version: null,
      build: null,
      vendor: null,
      model: null,
      connectionState: null,
      powerState: null,
      maintenanceMode: null,
      vmCount: null,
    },
    {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      hostKey: "host-2",
      host: "esx02",
      cluster: "CL-Prod",
      datacenter: "DC1",
      cpuModel: null,
      cpuTotalMHz: 25_000,
      cpuCores: 10,
      cpuThreads: 20,
      memoryTotalMiB: 98_304,
      version: null,
      build: null,
      vendor: null,
      model: null,
      connectionState: null,
      powerState: null,
      maintenanceMode: null,
      vmCount: null,
    },
  ];

  const vms: NormalizedVm[] = [
    {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      vmKey: "vm-1",
      vmUuid: null,
      vmName: "app01",
      cluster: "CL-Prod",
      host: "esx01",
      powerState: "poweredOn",
      cpuCount: 8,
      memoryMiB: 16_384,
      provisionedMiB: null,
      inUseMiB: null,
      configStatus: null,
      connectionState: null,
      consolidationNeeded: null,
      osConfig: null,
      osTools: null,
      hwVersion: null,
      toolsStatus: null,
      toolsVersion: null,
      datacenter: null,
      folder: null,
      resourcePool: null,
      annotation: null,
      cpuReady: null,
      firmware: null,
      efiSecureBoot: null,
      cbt: null,
    },
    {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      vmKey: "vm-2",
      vmUuid: null,
      vmName: "app02",
      cluster: "CL-Prod",
      host: "esx02",
      powerState: "poweredOn",
      cpuCount: 4,
      memoryMiB: 8_192,
      provisionedMiB: null,
      inUseMiB: null,
      configStatus: null,
      connectionState: null,
      consolidationNeeded: null,
      osConfig: null,
      osTools: null,
      hwVersion: null,
      toolsStatus: null,
      toolsVersion: null,
      datacenter: null,
      folder: null,
      resourcePool: null,
      annotation: null,
      cpuReady: null,
      firmware: null,
      efiSecureBoot: null,
      cbt: null,
    },
  ];

  const rawVHostRows: SheetRow[] = [
    {
      snapshotId: "snap-1",
      sheetName: "vHost",
      rowIndex: 0,
      data: { Cluster: "CL-Prod", Host: "esx01", "# Cores": 10, "# Memory": 98_304, "CPU usage %": 20, "Memory usage %": 40 },
    },
    {
      snapshotId: "snap-1",
      sheetName: "vHost",
      rowIndex: 1,
      data: { Cluster: "CL-Prod", Host: "esx02", "# Cores": 10, "# Memory": 98_304, "CPU usage %": 60, "Memory usage %": 80 },
    },
  ];

  it("builds cluster rows with allocation and weighted host usage percentages", () => {
    const [row] = buildMaintenanceRows({
      clusters,
      hosts,
      vms,
      rawVHostRows,
      assignments: [
        {
          id: "vc-1::CL-Prod",
          vcenterId: "vc-1",
          clusterName: "CL-Prod",
          type: "Spezial",
          windows: [],
          contacts: [{ firstName: "Max", lastName: "Mustermann" }],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(row).toMatchObject({
      name: "CL-Prod",
      hosts: 2,
      cores: 20,
      totalVms: 2,
      cpuAllocationPct: 60,
      cpuUsagePct: 40,
      ramAllocationPct: 12.5,
      ramUsagePct: 60,
      type: "Spezial",
    });
    expect(row.totalCpuGhz).toBe(50);
    expect(row.totalRamMiB).toBe(196_608);
  });
});

describe("maintenance mail template", () => {
  it("builds subject, deduplicated recipients and concise body with special cluster note", () => {
    const template = buildMaintenanceMailTemplate({
      maintenanceType: "ESXi Update",
      settings: { firstName: "Jörg", lastName: "Weiß", companyName: "Müller IT" },
      contactName: "Jörg Weiß",
      clusters: [
        {
          clusterName: "CL-Prod",
          clusterType: "Spezial",
          from: "2026-07-06T22:00",
          to: "2026-07-07T05:00",
          contacts: [
            { firstName: "Max", lastName: "Mustermann" },
            { firstName: "Max", lastName: "Mustermann" },
          ],
        },
      ],
      change: {
        id: "CRX00000234252",
        title: "UCS Firmware Upgrade",
        type: "Normal Change",
      },
      links: [{ label: "Change", url: "https://example.test/change" }],
    });

    expect(template.subject).toBe("Wartungsankündigung: ESXi Update - CRX00000234252");
    expect(template.to).toEqual(["max.mustermann@muellerit.at"]);
    expect(template.body).toContain("CL-Prod | Spezial | 06.07.2026, 22:00 - 07.07.2026, 05:00");
    expect(template.body).toContain("VMs werden live migriert");
    expect(template.body).toContain("Für Spezial-Cluster bitten wir um Abstimmung");
    expect(template.body).toContain("Change ID: CRX00000234252");
    expect(template.body).toContain("LG,\nJörg Weiß");
  });
});

import { describe, expect, it } from "vitest";
import { buildHostDataQualityRows } from "@/lib/hostDataQualityAudit";
import type { IpamLatest, NormalizedHost, TechInfoLatest } from "@/domain/models/types";

function host(name: string): NormalizedHost {
  return { host: name, hostKey: name, snapshotId: "snapshot-1", vcenterId: "vc-1", cluster: "Prod", datacenter: null, cpuModel: null, cpuTotalMHz: null, cpuCores: null, cpuThreads: null, memoryTotalMiB: null, version: "8.0", build: null, vendor: null, model: null, connectionState: "Connected", powerState: "poweredOn", maintenanceMode: null, vmCount: 12 };
}

function techInfo(vmName: string): TechInfoLatest {
  return { vmName, vmNameNorm: vmName.toLowerCase(), importedAt: "2026-07-19T00:00:00.000Z", techInfoImportId: "tech-1", rowIndex: 0, serverType: "ESXi", maintenanceWindow: null, operatingSystem: null, comment: null, sysv: null, sysvDepartment: null, sysvDeputy: null, sysvDeputyDepartment: null, bz: null, clusterFromTechInfo: null, cvBackup: null, az: null };
}

function ipam(name: string, ipAddress: string): IpamLatest {
  return { ipAddress, name, importedAt: "2026-07-19T00:00:00.000Z", ipamImportId: "ipam-1", rowIndex: 0, status: "Used", type: null, usage: null, firstDiscovered: null, lastDiscovered: null, comment: null, site: null, macAddress: null, os: null, netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null };
}

describe("buildHostDataQualityRows", () => {
  it("ordnet RVTools-Hosts Tech-Info und alle zugehörigen IPAM-Netze zu", () => {
    const result = buildHostDataQualityRows({
      hosts: [host("esx01.lab.local"), host("esx02.lab.local")],
      techInfo: [techInfo("ESX01")],
      ipam: [ipam("esx01.lab.local", "10.10.4.11"), ipam("ESX01", "10.11.7.9")],
    });

    expect(result.rvtoolsRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ host: "esx01.lab.local", techInfoPresent: true, ipamPresent: true, ipamNetworks: ["10.10.4.0/24", "10.11.7.0/24"] }),
      expect.objectContaining({ host: "esx02.lab.local", techInfoPresent: false, ipamPresent: false }),
    ]));
  });

  it("zeigt Tech-Info-Objekte ohne RVTools-Host und ihren IPAM-Abgleich", () => {
    const result = buildHostDataQualityRows({
      hosts: [host("esx01.lab.local")],
      techInfo: [techInfo("esx01"), techInfo("esx03.lab.local")],
      ipam: [ipam("esx03", "192.168.20.25")],
    });

    expect(result.techInfoRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ techInfoName: "esx03.lab.local", rvtoolsPresent: false, ipamPresent: true, ipamNetworks: ["192.168.20.0/24"] }),
    ]));
  });
});

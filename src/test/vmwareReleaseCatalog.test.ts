import { describe, expect, it } from "vitest";
import { KNOWN_VMWARE_RELEASES, buildReleaseUsageRows, getLatestRelease } from "@/lib/vmwareReleaseCatalog";

describe("VMware release catalog", () => {
  it("tracks the latest vCenter and ESXi 8.0 Update 3k releases first", () => {
    const latestVcenter = getLatestRelease("vcenter");
    const latestEsxi = getLatestRelease("esxi");

    expect(latestVcenter).toMatchObject({
      title: "VMware vCenter Server 8.0 Update 3k",
      version: "8.0.3.01000",
      releaseDateIso: "2026-07-29",
      build: "25600417",
    });
    expect(latestVcenter?.releaseNotesUrl).toContain("vsphere-vcenter-server-80u3k-release-notes");

    expect(latestEsxi).toMatchObject({
      title: "VMware ESXi 8.0 Update 3k",
      version: "ESXi 8.0.3 P10",
      releaseDateIso: "2026-07-29",
      build: "25595708",
    });
    expect(latestEsxi?.releaseNotesUrl).toContain("vsphere-esxi-80u3k-release-notes");
  });

  it("enthält die elf neuesten vCenter-8.0-Update-3-Releases", () => {
    expect(KNOWN_VMWARE_RELEASES.filter((release) => release.type === "vcenter").map((release) => release.version)).toEqual([
      "8.0.3.01000",
      "8.0.3.00900",
      "8.0.3.00800",
      "8.0.3.00700",
      "8.0.3.00600",
      "8.0.3.00500",
      "8.0.3.00400",
      "8.0.3.00300",
      "8.0.3.00200",
      "8.0.3.00100",
      "8.0.3.00000",
    ]);
  });

  it("contains the 3g through 3k ESXi release train", () => {
    expect(KNOWN_VMWARE_RELEASES.filter((release) => release.type === "esxi").map((release) => release.version)).toEqual([
      "ESXi 8.0.3 P10",
      "ESXi 8.0.3 P09",
      "ESXi 8.0.3 P08",
      "ESXi 8.0.3 P07",
      "ESXi 8.0.3 P06",
    ]);
  });

  it("builds sorted usage rows with adoption percentages", () => {
    const rows = buildReleaseUsageRows("esxi", new Map([["25429389", 2]]), 4);

    expect(rows.map((row) => row.build)).toEqual(["25595708", "25429389", "25205845", "25067014", "24859861"]);
    expect(rows[1].usageCount).toBe(2);
    expect(rows[1].adoptionPct).toBe(50);
    expect(rows[1].releaseDateLabel).toBe("27.5.2026");
  });
});

import { describe, expect, it } from "vitest";
import { KNOWN_VMWARE_RELEASES, buildReleaseUsageRows, getLatestRelease } from "@/lib/vmwareReleaseCatalog";

describe("VMware release catalog", () => {
  it("tracks the latest vCenter and ESXi 8.0 Update 3j releases first", () => {
    const latestVcenter = getLatestRelease("vcenter");
    const latestEsxi = getLatestRelease("esxi");

    expect(latestVcenter).toMatchObject({
      title: "VMware vCenter Server 8.0 Update 3j",
      version: "8.0.3.00900",
      releaseDateIso: "2026-05-27",
      build: "25413364",
    });
    expect(latestVcenter?.releaseNotesUrl).toContain("vsphere-vcenter-server-80u3j-release-notes");

    expect(latestEsxi).toMatchObject({
      title: "VMware ESXi 8.0 Update 3j",
      version: "ESXi 8.0.3 P09",
      releaseDateIso: "2026-05-27",
      build: "25429389",
    });
    expect(latestEsxi?.releaseNotesUrl).toContain("vsphere-esxi-80u3j-release-notes");
  });

  it("contains the 3g through 3j release train for both product types", () => {
    expect(KNOWN_VMWARE_RELEASES.filter((release) => release.type === "vcenter").map((release) => release.version)).toEqual([
      "8.0.3.00900",
      "8.0.3.00800",
      "8.0.3.00700",
      "8.0.3.00600",
    ]);
    expect(KNOWN_VMWARE_RELEASES.filter((release) => release.type === "esxi").map((release) => release.version)).toEqual([
      "ESXi 8.0.3 P09",
      "ESXi 8.0.3 P08",
      "ESXi 8.0.3 P07",
      "ESXi 8.0.3 P06",
    ]);
  });

  it("builds sorted usage rows with adoption percentages", () => {
    const rows = buildReleaseUsageRows("esxi", new Map([["25429389", 2]]), 4);

    expect(rows.map((row) => row.build)).toEqual(["25429389", "25205845", "25067014", "24859861"]);
    expect(rows[0].usageCount).toBe(2);
    expect(rows[0].adoptionPct).toBe(50);
    expect(rows[0].releaseDateLabel).toBe("27.5.2026");
  });
});

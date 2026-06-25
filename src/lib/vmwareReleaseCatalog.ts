export type ReleaseType = "vcenter" | "esxi";

export interface KnownRelease {
  type: ReleaseType;
  title: string;
  version: string;
  releaseDateIso: string;
  build: string;
  releaseNotesUrl: string;
}

export interface ReleaseUsageRow extends KnownRelease {
  releaseDateLabel: string;
  releaseTimestamp: number;
  usageCount: number;
  totalAssets: number;
  adoptionPct: number;
}

export const KNOWN_VMWARE_RELEASES: KnownRelease[] = [
  {
    type: "vcenter",
    title: "VMware vCenter Server 8.0 Update 3j",
    version: "8.0.3.00900",
    releaseDateIso: "2026-05-27",
    build: "25413364",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/vcenter-server-update-and-patch-release-notes/vsphere-vcenter-server-80u3j-release-notes.html",
  },
  {
    type: "vcenter",
    title: "VMware vCenter Server 8.0 Update 3i",
    version: "8.0.3.00800",
    releaseDateIso: "2026-02-24",
    build: "25197330",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/vcenter-server-update-and-patch-release-notes/vsphere-vcenter-server-80u3i-release-notes.html",
  },
  {
    type: "vcenter",
    title: "VMware vCenter Server 8.0 Update 3h",
    version: "8.0.3.00700",
    releaseDateIso: "2025-12-15",
    build: "25092719",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/vcenter-server-update-and-patch-release-notes/vsphere-vcenter-server-80u3h-release-notes.html",
  },
  {
    type: "vcenter",
    title: "VMware vCenter Server 8.0 Update 3g",
    version: "8.0.3.00600",
    releaseDateIso: "2025-07-29",
    build: "24853646",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/vcenter-server-update-and-patch-release-notes/vsphere-vcenter-server-80u3g-release-notes.html",
  },
  {
    type: "esxi",
    title: "VMware ESXi 8.0 Update 3j",
    version: "ESXi 8.0.3 P09",
    releaseDateIso: "2026-05-27",
    build: "25429389",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/esxi-update-and-patch-release-notes/vsphere-esxi-80u3j-release-notes.html",
  },
  {
    type: "esxi",
    title: "VMware ESXi 8.0 Update 3i",
    version: "ESXi 8.0.3 P08",
    releaseDateIso: "2026-02-24",
    build: "25205845",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/esxi-update-and-patch-release-notes/vsphere-esxi-80u3i-release-notes.html",
  },
  {
    type: "esxi",
    title: "VMware ESXi 8.0 Update 3h",
    version: "ESXi 8.0.3 P07",
    releaseDateIso: "2025-12-15",
    build: "25067014",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/esxi-update-and-patch-release-notes/vsphere-esxi-80u3h-release-notes.html",
  },
  {
    type: "esxi",
    title: "VMware ESXi 8.0 Update 3g",
    version: "ESXi 8.0.3 P06",
    releaseDateIso: "2025-07-29",
    build: "24859861",
    releaseNotesUrl:
      "https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/esxi-update-and-patch-release-notes/vsphere-esxi-80u3g-release-notes.html",
  },
];

export function toReleaseTimestamp(releaseDateIso: string): number {
  return new Date(`${releaseDateIso}T00:00:00Z`).getTime();
}

export function formatReleaseDate(releaseDateIso: string): string {
  return new Date(`${releaseDateIso}T00:00:00Z`).toLocaleDateString("de-DE");
}

export function getLatestRelease(type: ReleaseType): KnownRelease | undefined {
  return KNOWN_VMWARE_RELEASES
    .filter((release) => release.type === type)
    .sort((a, b) => toReleaseTimestamp(b.releaseDateIso) - toReleaseTimestamp(a.releaseDateIso))[0];
}

export function buildReleaseUsageRows(
  type: ReleaseType,
  buildCounts: Map<string, number>,
  totalAssets: number,
): ReleaseUsageRow[] {
  return KNOWN_VMWARE_RELEASES
    .filter((release) => release.type === type)
    .map((release) => {
      const usageCount = buildCounts.get(release.build) || 0;
      return {
        ...release,
        releaseDateLabel: formatReleaseDate(release.releaseDateIso),
        releaseTimestamp: toReleaseTimestamp(release.releaseDateIso),
        usageCount,
        totalAssets,
        adoptionPct: totalAssets > 0 ? Math.round((usageCount / totalAssets) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.releaseTimestamp - a.releaseTimestamp);
}

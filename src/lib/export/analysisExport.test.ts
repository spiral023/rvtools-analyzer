import { describe, expect, it } from "vitest";
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
} from "@/domain/models/types";
import { buildAnalysisExportFiles, stablePseudonym } from "@/lib/export/analysisExport";
import { MHZ_ENCODING, decodeAnalysisSeries } from "@/lib/export/analysisSeriesCodec";
import { capacitySignalsFixture, classificationSignalsFixture, metricStatsFixture, rightsizingCandidateFixture, vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_START = Date.UTC(2026, 6, 20, 0, 0, 0);
const SLOTS = 6;

function makeVm(overrides: Partial<NormalizedVm> = {}): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmKey: "vm-key-1",
    vmUuid: "uuid-1",
    vmName: "PROD-SQL-01",
    cluster: "CL-PROD",
    host: "esx-01",
    powerState: "poweredOn",
    cpuCount: 8,
    memoryMiB: 16384,
    provisionedMiB: 102400,
    inUseMiB: 51200,
    configStatus: null,
    connectionState: "connected",
    consolidationNeeded: false,
    osConfig: "Windows Server 2022",
    osTools: "Windows Server 2022",
    hwVersion: "19",
    toolsStatus: "toolsOk",
    toolsVersion: "12345",
    datacenter: "DC-1",
    folder: "Produktion",
    resourcePool: "Team-A/HIGH",
    annotation: null,
    cpuReady: null,
    firmware: "efi",
    efiSecureBoot: true,
    cbt: true,
    ...overrides,
  };
}

function makeHost(): NormalizedHost {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    hostKey: "host-key-1",
    host: "esx-01",
    cluster: "CL-PROD",
    datacenter: "DC-1",
    cpuModel: "Intel Xeon Gold 6338",
    cpuTotalMHz: 64000,
    cpuCores: 32,
    cpuThreads: 64,
    memoryTotalMiB: 524288,
    version: "8.0.2",
    build: "12345",
    vendor: "Dell",
    model: "PowerEdge R750",
    connectionState: "connected",
    powerState: "poweredOn",
    maintenanceMode: "false",
    vmCount: 40,
  };
}

function makeCluster(): NormalizedCluster {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    clusterKey: "cluster-key-1",
    name: "CL-PROD",
    datacenter: "DC-1",
    haEnabled: true,
    drsEnabled: true,
    numHosts: 4,
    numCpuCores: 128,
    numCpuThreads: 256,
    totalMemoryMiB: 2097152,
    totalCpuMHz: 256000,
    numEffectiveHosts: 4,
  };
}

function makeImport(): VropsTimeSeriesImport {
  return {
    id: "import-1",
    importedAt: "2026-07-27T10:00:00.000Z",
    timezone: "Europe/Vienna",
    intervalMinutes: 60,
    rangeStartUtc: RANGE_START,
    rangeEndUtc: RANGE_START + SLOTS * HOUR_MS,
    expectedSlots: SLOTS,
    rvtoolsSnapshotIds: ["snap-1"],
    files: [],
    fileSetChecksum: "abc",
    schemaVersion: 1,
    validationStatus: "relationships-valid",
    qualitySummary: {
      objectCountByType: { vm: 1, cluster: 0, host: 0 },
      expectedSlots: SLOTS,
      errorCount: 0,
      warningCount: 0,
      missingValueCount: 0,
    },
  };
}

function makeObject(): VropsTimeSeriesImportedObject {
  return {
    importId: "import-1",
    objectKey: "vrops-vm-1",
    objectType: "vm",
    vropsName: "PROD-SQL-01",
    vcenterId: "vc-1",
    rvtoolsSnapshotId: "snap-1",
    rvtoolsObjectKey: "vm-key-1",
    clusterKey: "cluster-key-1",
    hostKey: "host-key-1",
    workloadClass: "high",
    powerState: "poweredOn",
    siteId: null,
    matchStatus: "matched",
    matchMethod: "name",
  };
}

/** Baut einen Chunk mit einer VM und den übergebenen Messwerten je Metrik. */
function makeChunk(values: Record<string, (number | null)[]>): VropsTimeSeriesChunk {
  const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
  for (const [metric, series] of Object.entries(values)) {
    const array = new Float32Array(series.map((value) => (value === null ? Number.NaN : value)));
    metricValues[metric as keyof VropsTimeSeriesChunk["metricValues"]] = array.buffer as ArrayBuffer;
  }
  return {
    importId: "import-1",
    objectType: "vm",
    chunkKey: "chunk-1",
    clusterKey: "cluster-key-1",
    startUtc: RANGE_START,
    slotCount: SLOTS,
    objectKeys: ["vrops-vm-1"],
    metricValues,
  };
}

const DEMAND = [1000, 1100, 1200, null, 1300, 1300];

function buildFiles(overrides: Partial<Parameters<typeof buildAnalysisExportFiles>[0]> = {}) {
  return buildAnalysisExportFiles({
    vms: [makeVm()],
    hosts: [makeHost()],
    clusters: [makeCluster()],
    techInfo: [],
    timeSeriesImport: makeImport(),
    objects: [makeObject()],
    chunks: [makeChunk({ vmCpuDemandAvgMHz: DEMAND })],
    profiles: [],
    candidates: [],
    rightsizingLevel: "balanced",
    includeSeries: true,
    pseudonymize: false,
    pseudonymSalt: "salt",
    generatedAt: "2026-08-01T12:00:00.000Z",
    appVersion: "test",
    ...overrides,
  });
}

function fileByPath(files: ReturnType<typeof buildFiles>, path: string): string {
  const found = files.find((file) => file.path === path);
  if (!found) throw new Error(`Datei fehlt im Export: ${path}`);
  return found.content;
}

describe("buildAnalysisExportFiles", () => {
  it("erzeugt Inventar, Metadaten und Kurzanleitung", () => {
    const paths = buildFiles().map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining(["vms.csv", "hosts.csv", "clusters.csv", "meta.json", "README.md"]));
  });

  it("schreibt nur Reihendateien für tatsächlich vorhandene Metriken", () => {
    const paths = buildFiles().map((file) => file.path);
    expect(paths).toContain("series/cpu_demand_avg.csv");
    // Demand Max war in diesem Import nicht enthalten und darf keine leere Datei erzeugen.
    expect(paths).not.toContain("series/cpu_demand_max.csv");
  });

  it("führt fehlende Metriken in den Metadaten auf", () => {
    const meta = JSON.parse(fileByPath(buildFiles(), "meta.json"));
    expect(meta.missingSeries).toContain("vmCpuDemandMaxMHz");
    expect(meta.series.map((entry: { metric: string }) => entry.metric)).toEqual(["vmCpuDemandAvgMHz"]);
    expect(meta.rightsizing).toMatchObject({
      level: "balanced",
      label: "Ausgewogen",
      peakStatistic: "p99",
      peakPercentile: 0.99,
      targetUtilizationP95: 0.65,
      targetUtilizationPeak: 0.9,
    });
  });

  it("lässt die Reihen weg, wenn nur Kennzahlen gefragt sind", () => {
    const paths = buildFiles({ includeSeries: false }).map((file) => file.path);
    expect(paths.some((path) => path.startsWith("series/"))).toBe(false);
    expect(paths).toContain("vms.csv");
  });

  it("gibt die Messreihe im Raster des Imports wieder", () => {
    const content = fileByPath(buildFiles(), "series/cpu_demand_avg.csv");
    const [, dataLine] = content.split("\n");
    const [, encoded] = dataLine.split(";");
    const decoded = decodeAnalysisSeries(encoded, MHZ_ENCODING);
    expect(decoded).toHaveLength(SLOTS);
    expect(decoded[0]).toBeCloseTo(1000, 0);
    expect(decoded[3]).toBeNull();
    expect(decoded[5]).toBeCloseTo(1300, 0);
  });

  it("verwendet in Inventar und Reihen denselben Schlüssel", () => {
    const files = buildFiles({ pseudonymize: true });
    const vmId = fileByPath(files, "vms.csv").split("\n")[1].split(";")[0];
    const seriesId = fileByPath(files, "series/cpu_demand_avg.csv").split("\n")[1].split(";")[0];
    expect(seriesId).toBe(vmId);
  });

  it("schreibt die Kapazitäts- und Beidrichtungs-Kennzahlen in das Inventar", () => {
    // Der Export ist die Grundlage der externen Auswertung: Fehlt eine dieser Spalten,
    // lässt sich die Rightsizing-Entscheidung von außen nicht nachvollziehen.
    const files = buildFiles({
      profiles: [vmWorkloadProfileFixture({
        objectKey: "vrops-vm-1",
        rvtoolsObjectKey: "vm-key-1",
        vmName: "PROD-SQL-01",
        demandMax: metricStatsFixture({ p95: 3_000, p99: 5_400, p995: 7_200, maximum: 20_000 }),
        capacitySignals: capacitySignalsFixture({
          totalCapacityMHz: 16_000, configuredVcpu: 8, mhzPerVcpu: 2_000,
          hoursAboveCapacity75: 30, hoursAboveCapacity90: 12,
          costopUnderLoadP95Pct: 9.6, loadHourCount: 120,
          concentrationIndexP90: 0.52, effectiveCoresMax: 5.125, singleCoreBoundHours: 48,
        }),
        signals: classificationSignalsFixture({ weeklyRepeatability: 0.81, weeklyPeakVariation: 0.12 }),
      })],
      candidates: [rightsizingCandidateFixture({
        objectKey: "vrops-vm-1",
        vmName: "PROD-SQL-01",
        mhzPerVcpu: 2_000,
        demandBasedVcpu: 12,
        additionalVcpu: 4,
        recommendedVcpu: 12,
        flags: { manyVcpuLowDemand: false, highCpuReady: false, costopUnderLoad: true, singleCoreBound: true, concentratedOnFewCores: true, sustainedNearCapacity: true, risingTrend: false },
      })],
    });
    const [headerLine, row] = fileByPath(files, "vms.csv").split("\n");
    const headers = headerLine.split(";");
    const cells = row.split(";");
    const cellOf = (name: string) => cells[headers.indexOf(name)];

    expect(cellOf("demandMaxP99MHz")).toBe("5400");
    expect(cellOf("demandMaxP995MHz")).toBe("7200");
    expect(cellOf("measuredCapacityMHz")).toBe("16000");
    expect(cellOf("measuredMhzPerVcpu")).toBe("2000");
    expect(cellOf("hoursAboveCapacity75")).toBe("30");
    expect(cellOf("costopUnderLoadP95Pct")).toBe("9.6");
    expect(cellOf("concentrationIndexP90")).toBe("0.52");
    expect(cellOf("effectiveCoresMax")).toBe("5.125");
    expect(cellOf("singleCoreBoundHours")).toBe("48");
    expect(cellOf("weeklyRepeatability")).toBe("0.81");
    expect(cellOf("weeklyPeakVariation")).toBe("0.12");
    expect(cellOf("additionalVcpu")).toBe("4");
    expect(cellOf("flagCostopUnderLoad")).toBe("1");
    expect(cellOf("flagSingleCoreBound")).toBe("1");
    expect(cellOf("rightsizingLevel")).toBe("balanced");
    expect(cellOf("flagSustainedNearCapacity")).toBe("1");
    expect(cellOf("flagManyVcpuLowDemand")).toBe("0");
  });

  it("schreibt die Umrechnungsbasis von MHz auf vCPU in die Hostdatei", () => {
    const [headers, row] = fileByPath(buildFiles(), "hosts.csv").split("\n");
    const index = headers.split(";").indexOf("mhzPerCore");
    expect(row.split(";")[index]).toBe("2000");
  });

  it("nimmt die Feiertage des Zeitraums in die Metadaten auf", () => {
    const augustImport: VropsTimeSeriesImport = {
      ...makeImport(),
      rangeStartUtc: Date.UTC(2026, 7, 10),
      rangeEndUtc: Date.UTC(2026, 7, 20),
    };
    const meta = JSON.parse(fileByPath(buildFiles({ timeSeriesImport: augustImport }), "meta.json"));
    expect(meta.holidays.map((holiday: { date: string }) => holiday.date)).toContain("2026-08-15");
  });

  it("dokumentiert die Kodierung, damit die Werte rückrechenbar sind", () => {
    const meta = JSON.parse(fileByPath(buildFiles(), "meta.json"));
    // Gegen die Konstante geprüft: Die Metadaten müssen mitwandern, wenn die
    // Kodierung angepasst wird — sonst rechnet ein Auswertungsskript falsch zurück.
    expect(meta.series[0].encoding).toEqual(MHZ_ENCODING);
    expect(meta.timeSeries.expectedSlots).toBe(SLOTS);
    expect(meta.timeSeries.rangeStartUtc).toBe(RANGE_START);
  });

  it("belässt Klarnamen, wenn nicht pseudonymisiert wird", () => {
    expect(fileByPath(buildFiles(), "vms.csv")).toContain("PROD-SQL-01");
  });

  it("ersetzt Klarnamen bei aktiver Pseudonymisierung vollständig", () => {
    const content = fileByPath(buildFiles({ pseudonymize: true }), "vms.csv");
    expect(content).not.toContain("PROD-SQL-01");
    expect(content).not.toContain("CL-PROD");
    expect(content).toMatch(/vm-[0-9a-f]{12}/);
  });
});

describe("stablePseudonym", () => {
  it("liefert für denselben Namen dasselbe Kürzel", () => {
    expect(stablePseudonym("vm", "PROD-SQL-01", "salt")).toBe(stablePseudonym("vm", "PROD-SQL-01", "salt"));
  });

  it("ist unabhängig von Groß- und Kleinschreibung sowie Leerraum", () => {
    expect(stablePseudonym("vm", "  prod-sql-01 ", "salt")).toBe(stablePseudonym("vm", "PROD-SQL-01", "salt"));
  });

  it("trennt nach Salt, damit die Kürzel nicht aus einer Namensliste rückrechenbar sind", () => {
    expect(stablePseudonym("vm", "PROD-SQL-01", "salt-a")).not.toBe(stablePseudonym("vm", "PROD-SQL-01", "salt-b"));
  });

  it("hängt nicht von der Reihenfolge der Verarbeitung ab", () => {
    // Der eigentliche Zweck gegenüber der laufenden Nummerierung des Export Studios:
    // eine zusätzliche VM darf die Kürzel aller anderen nicht verschieben.
    const first = buildFiles({ pseudonymize: true });
    const withExtraVm = buildFiles({
      pseudonymize: true,
      vms: [makeVm({ vmKey: "vm-key-0", vmName: "AAA-NEU-01" }), makeVm()],
    });
    const originalId = fileByPath(first, "vms.csv").split("\n")[1].split(";")[0];
    const shiftedId = fileByPath(withExtraVm, "vms.csv").split("\n")[2].split(";")[0];
    expect(shiftedId).toBe(originalId);
  });
});

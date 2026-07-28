import type {
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesSchemaMatch,
  VropsTimeSeriesValidationIssue,
} from "@/domain/models/types";

export const VROPS_TIME_SERIES_SCHEMA_VERSION = 1;

export type VropsTimeSeriesValueKind = "cpu" | "memory" | "percent" | "state";

interface MetricDefinition {
  key: VropsTimeSeriesMetricKey;
  required: boolean;
  valueKind: VropsTimeSeriesValueKind;
  aliases: readonly string[];
}

export interface VropsTimeSeriesSchemaDefinition {
  version: number;
  objectType: VropsTimeSeriesObjectType;
  objectNameAliases: readonly string[];
  intervalAliases: readonly string[];
  metrics: readonly MetricDefinition[];
}

const OBJECT_NAME_ALIASES = ["Name", "Object Name", "Object", "Object Name (vROps)"] as const;
const INTERVAL_ALIASES = ["Interval Breakdown", "Interval Start", "Interval Start Time", "Timestamp"] as const;

export const VROPS_TIME_SERIES_SCHEMAS: readonly VropsTimeSeriesSchemaDefinition[] = [
  {
    version: VROPS_TIME_SERIES_SCHEMA_VERSION,
    objectType: "vm",
    objectNameAliases: ["Name", "VM Name", ...OBJECT_NAME_ALIASES],
    intervalAliases: INTERVAL_ALIASES,
    metrics: [
      {
        key: "vmCpuDemandAvgMHz",
        required: true,
        valueKind: "cpu",
        aliases: ["VM|CPU|Demand (MHz)|Avg", "VM|CPU|Demand|Avg", "VM CPU Demand Avg", "CPU Demand Avg"],
      },
      {
        key: "vmCpuReadyMaxPct",
        required: true,
        valueKind: "percent",
        aliases: ["VM|CPU|Ready (%)|Max", "VM|CPU|Ready|Max", "VM CPU Ready Max", "CPU Ready Max"],
      },
    ],
  },
  {
    version: VROPS_TIME_SERIES_SCHEMA_VERSION,
    objectType: "cluster",
    objectNameAliases: ["Name", "Cluster Name", ...OBJECT_NAME_ALIASES],
    intervalAliases: INTERVAL_ALIASES,
    metrics: [
      { key: "clusterCpuDemandAvgMHz", required: true, valueKind: "cpu", aliases: ["Cluster|CPU|Demand|Avg", "Cluster|CPU|Demand (MHz)|Avg", "Cluster CPU Demand Avg"] },
      { key: "clusterCpuDemandMaxMHz", required: true, valueKind: "cpu", aliases: ["Cluster|CPU|Demand|Max", "Cluster|CPU|Demand (MHz)|Max", "Cluster CPU Demand Max"] },
      { key: "clusterMemoryUtilizationAvgMiB", required: true, valueKind: "memory", aliases: ["Cluster|Memory|Utilization (MB)|Avg", "Cluster|Memory|Utilization (MiB)|Avg", "Cluster|Memory|Utilization|Avg", "Cluster Memory Utilization Avg"] },
      { key: "clusterMemoryUtilizationMaxMiB", required: true, valueKind: "memory", aliases: ["Cluster|Memory|Utilization (MB)|Max", "Cluster|Memory|Utilization (MiB)|Max", "Cluster|Memory|Utilization|Max", "Cluster Memory Utilization Max"] },
      { key: "clusterCpuContentionAvgPct", required: true, valueKind: "percent", aliases: ["Cluster|CPU|Contention (%)|Avg", "Cluster|CPU|Contention|Avg", "Cluster CPU Contention Avg"] },
      { key: "clusterCpuContentionMaxPct", required: true, valueKind: "percent", aliases: ["Cluster|CPU|Contention (%)|Max", "Cluster|CPU|Contention|Max", "Cluster CPU Contention Max"] },
    ],
  },
  {
    version: VROPS_TIME_SERIES_SCHEMA_VERSION,
    objectType: "host",
    objectNameAliases: ["Name", "Host Name", ...OBJECT_NAME_ALIASES],
    intervalAliases: INTERVAL_ALIASES,
    metrics: [
      { key: "hostCpuCapacityAvailableLastMHz", required: true, valueKind: "cpu", aliases: ["Host|CPU|Capacity Available to VMs|Last", "Host|CPU|Capacity Available to VMs (MHz)|Last", "Host CPU Capacity Available to VMs Last"] },
      { key: "hostMemoryCapacityAvailableLastMiB", required: true, valueKind: "memory", aliases: ["Host|Memory|Capacity Available to VMs|Last", "Host|Memory|Capacity Available to VMs (MB)|Last", "Host|Memory|Capacity Available to VMs (MiB)|Last", "Host Memory Capacity Available to VMs Last"] },
      { key: "hostCpuDemandAvgMHz", required: false, valueKind: "cpu", aliases: ["Host|CPU|Demand|Avg", "Host|CPU|Demand (MHz)|Avg", "Host CPU Demand Avg"] },
      { key: "hostCpuDemandMaxMHz", required: false, valueKind: "cpu", aliases: ["Host|CPU|Demand|Max", "Host|CPU|Demand (MHz)|Max", "Host CPU Demand Max"] },
      { key: "hostCpuUsageAvgMHz", required: false, valueKind: "cpu", aliases: ["Host|CPU|Usage|Avg", "Host|CPU|Usage (MHz)|Avg", "Host CPU Usage Avg"] },
      { key: "hostCpuUsageMaxMHz", required: false, valueKind: "cpu", aliases: ["Host|CPU|Usage|Max", "Host|CPU|Usage (MHz)|Max", "Host CPU Usage Max"] },
      { key: "hostMemoryUtilizationAvgMiB", required: false, valueKind: "memory", aliases: ["Host|Memory|Utilization|Avg", "Host|Memory|Utilization (MB)|Avg", "Host|Memory|Utilization (MiB)|Avg", "Host Memory Utilization Avg"] },
      { key: "hostMemoryUtilizationMaxMiB", required: false, valueKind: "memory", aliases: ["Host|Memory|Utilization|Max", "Host|Memory|Utilization (MB)|Max", "Host|Memory|Utilization (MiB)|Max", "Host Memory Utilization Max"] },
      { key: "hostCpuContentionAvgPct", required: false, valueKind: "percent", aliases: ["Host|CPU|Contention (%)|Avg", "Host|CPU|Contention|Avg", "Host CPU Contention Avg"] },
      { key: "hostCpuContentionMaxPct", required: false, valueKind: "percent", aliases: ["Host|CPU|Contention (%)|Max", "Host|CPU|Contention|Max", "Host CPU Contention Max"] },
      { key: "hostMaintenanceStateLast", required: false, valueKind: "state", aliases: ["Host|Runtime|Maintenance State|Last", "Host Runtime Maintenance State Last"] },
    ],
  },
];

export function normalizeVropsTimeSeriesHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().replace(/\s*\|\s*/g, "|").replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function findHeader(headers: readonly string[], aliases: readonly string[]): string | undefined {
  const normalizedAliases = new Set(aliases.flatMap((alias) => [
    normalizeVropsTimeSeriesHeader(alias),
    normalizeVropsTimeSeriesHeader(alias.replace(/\s*\([^)]*\)/g, "")),
  ]));
  return headers.find((header) => normalizedAliases.has(normalizeVropsTimeSeriesHeader(header)) || normalizedAliases.has(normalizeVropsTimeSeriesHeader(header.replace(/\s*\([^)]*\)/g, ""))));
}

export function getVropsTimeSeriesMetricDefinition(key: VropsTimeSeriesMetricKey): MetricDefinition {
  for (const schema of VROPS_TIME_SERIES_SCHEMAS) {
    const metric = schema.metrics.find((candidate) => candidate.key === key);
    if (metric) return metric;
  }
  throw new Error(`Unknown vROps time-series metric: ${key}`);
}

export function matchVropsTimeSeriesSchema(headers: readonly string[]): {
  schema: VropsTimeSeriesSchemaMatch | null;
  issues: VropsTimeSeriesValidationIssue[];
} {
  const issues: VropsTimeSeriesValidationIssue[] = [];
  const duplicateHeaders = new Set<string>();
  const seenHeaders = new Set<string>();
  headers.forEach((header, index) => {
    const normalized = normalizeVropsTimeSeriesHeader(header);
    if (seenHeaders.has(normalized)) duplicateHeaders.add(normalized);
    seenHeaders.add(normalized);
    if (!header.trim()) {
      issues.push({ code: "empty-header", severity: "error", message: "Die CSV enthält einen leeren Header.", column: index + 1 });
    }
  });
  for (const duplicate of duplicateHeaders) {
    issues.push({ code: "duplicate-header", severity: "error", message: `Der Header "${duplicate}" kommt mehrfach vor.`, header: duplicate });
  }

  const candidates = VROPS_TIME_SERIES_SCHEMAS.map((definition) => {
    const objectNameHeader = findHeader(headers, definition.objectNameAliases);
    const intervalHeader = findHeader(headers, definition.intervalAliases);
    const metricHeaders = Object.fromEntries(definition.metrics.flatMap((metric) => {
      const header = findHeader(headers, metric.aliases);
      return header ? [[metric.key, header]] : [];
    })) as Partial<Record<VropsTimeSeriesMetricKey, string>>;
    const missing = [
      ...(objectNameHeader ? [] : ["Objektname"]),
      ...(intervalHeader ? [] : ["Interval Breakdown"]),
      ...definition.metrics.filter((metric) => metric.required && !metricHeaders[metric.key]).map((metric) => metric.aliases[0]),
    ];
    return { definition, objectNameHeader, intervalHeader, metricHeaders, missing };
  });

  const matches = candidates.filter((candidate) => candidate.missing.length === 0);
  if (matches.length === 1) {
    const match = matches[0];
    return {
      schema: {
        version: match.definition.version,
        objectType: match.definition.objectType,
        objectNameHeader: match.objectNameHeader!,
        intervalHeader: match.intervalHeader!,
        metricHeaders: match.metricHeaders,
      },
      issues,
    };
  }

  if (matches.length > 1) {
    issues.push({
      code: "ambiguous-object-type",
      severity: "error",
      message: `Die Header passen mehrdeutig zu ${matches.map((match) => match.definition.objectType).join(", ")}.`,
      details: { matches: matches.map((match) => match.definition.objectType).join(",") },
    });
    return { schema: null, issues };
  }

  const nearest = candidates
    .map((candidate) => ({
      ...candidate,
      present: Object.keys(candidate.metricHeaders).length,
    }))
    .sort((left, right) => right.present - left.present)[0];
  if (nearest && nearest.present > 0) {
    for (const missing of nearest.missing) {
      issues.push({
        code: "missing-required-column",
        severity: "error",
        message: `Pflichtspalte fehlt: ${missing}.`,
        details: { objectType: nearest.definition.objectType },
      });
    }
  } else {
    issues.push({
      code: "unknown-object-type",
      severity: "error",
      message: "Die Objektart konnte nicht anhand der verpflichtenden vROps-Header erkannt werden.",
    });
  }
  return { schema: null, issues };
}

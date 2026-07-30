import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";

export type DetailSensitivity = "identifier" | "person" | "department" | "text" | "network";

export interface DetailField {
  label: string;
  value: string;
  sensitivity?: DetailSensitivity;
}

export interface DetailKpi extends DetailField {
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
}

export interface DetailTable {
  headers: string[];
  rows: string[][];
  sensitiveColumns?: Partial<Record<number, DetailSensitivity>>;
  maxRows?: number;
}

export interface DetailSection {
  title: string;
  description?: string;
  fields?: DetailField[];
  table?: DetailTable;
  note?: string;
}

export interface DetailTrend {
  title: string;
  points: VropsObjectTrendPoint[];
  cpuCapacityMHz: number | null;
  importedAt?: string | null;
}

export interface DetailDossier {
  kind: "VM" | "Host" | "Cluster" | "vCenter";
  title: string;
  titleSensitivity?: DetailSensitivity;
  subtitle?: string;
  summary: string;
  kpis: DetailKpi[];
  sections: DetailSection[];
  trend?: DetailTrend;
  sourceDate?: string | null;
}

const PLACEHOLDER_PREFIX: Record<DetailSensitivity, string> = {
  identifier: "System",
  person: "Person",
  department: "Organisation",
  text: "Text",
  network: "Netzwerk",
};

function clean(value: string): string {
  return value.trim() || "—";
}

function buildPseudonymizer() {
  const maps = new Map<DetailSensitivity, Map<string, string>>();
  return (value: string, sensitivity?: DetailSensitivity) => {
    if (!sensitivity || clean(value) === "—") return clean(value);
    let values = maps.get(sensitivity);
    if (!values) {
      values = new Map();
      maps.set(sensitivity, values);
    }
    const key = clean(value).toLocaleLowerCase("de-DE");
    const existing = values.get(key);
    if (existing) return existing;
    const replacement = `${PLACEHOLDER_PREFIX[sensitivity]}-${String(values.size + 1).padStart(3, "0")}`;
    values.set(key, replacement);
    return replacement;
  };
}

export function pseudonymizeDetailDossier(dossier: DetailDossier): DetailDossier {
  const pseudonymize = buildPseudonymizer();
  return {
    ...dossier,
    title: pseudonymize(dossier.title, dossier.titleSensitivity),
    subtitle: dossier.subtitle ? pseudonymize(dossier.subtitle, "identifier") : dossier.subtitle,
    summary: dossier.summary,
    kpis: dossier.kpis.map((kpi) => ({ ...kpi, value: pseudonymize(kpi.value, kpi.sensitivity) })),
    sections: dossier.sections.map((section) => ({
      ...section,
      fields: section.fields?.map((field) => ({
        ...field,
        value: pseudonymize(field.value, field.sensitivity),
      })),
      table: section.table
        ? {
            ...section.table,
            rows: section.table.rows.map((row) =>
              row.map((value, index) => pseudonymize(value, section.table?.sensitiveColumns?.[index])),
            ),
          }
        : undefined,
    })),
  };
}

function markdownEscape(value: string): string {
  return clean(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function confluenceEscape(value: string): string {
  return clean(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "\\\\");
}

export function buildDossierMarkdown(dossier: DetailDossier, pseudonymized = false): string {
  const lines = [
    `# ${dossier.kind} ${dossier.title}`,
    "",
    dossier.summary,
    "",
    `> Datenstand: ${dossier.sourceDate || "nicht angegeben"}${pseudonymized ? " · Pseudonymisierte Fassung" : ""}`,
    "",
    "## Management-Übersicht",
    "",
    "| Kennzahl | Wert | Einordnung |",
    "| --- | --- | --- |",
    ...dossier.kpis.map((kpi) => `| ${markdownEscape(kpi.label)} | ${markdownEscape(kpi.value)} | ${markdownEscape(kpi.hint || "—")} |`),
    "",
  ];

  for (const section of dossier.sections) {
    lines.push(`## ${section.title}`, "");
    if (section.description) lines.push(section.description, "");
    if (section.fields?.length) {
      lines.push("| Feld | Wert |", "| --- | --- |");
      for (const field of section.fields) lines.push(`| ${markdownEscape(field.label)} | ${markdownEscape(field.value)} |`);
      lines.push("");
    }
    if (section.table) {
      if (section.table.rows.length === 0) {
        lines.push("_Keine Daten vorhanden_", "");
      } else {
        lines.push(
          `| ${section.table.headers.map(markdownEscape).join(" | ")} |`,
          `| ${section.table.headers.map(() => "---").join(" | ")} |`,
          ...section.table.rows.map((row) => `| ${row.map(markdownEscape).join(" | ")} |`),
          "",
        );
      }
    }
    if (section.note) lines.push(`> ${section.note}`, "");
  }
  if (dossier.trend?.points.length) {
    const peak = getTrendPeak(dossier.trend.points);
    lines.push(
      "## Auslastungsverlauf",
      "",
      `Sieben Tage mit stündlichen Werten${peak ? `; höchster CPU-Demand am ${formatDetailTimestamp(peak.timestampUtc)} mit ${formatCpuDemand(peak.cpuDemandMHz)}` : ""}.`,
      "",
    );
  }
  return lines.join("\n");
}

export function buildDossierConfluence(dossier: DetailDossier, pseudonymized = false): string {
  const lines = [
    `h1. ${dossier.kind} ${dossier.title}`,
    "",
    dossier.summary,
    "",
    `{info}Datenstand: ${dossier.sourceDate || "nicht angegeben"}${pseudonymized ? " · Pseudonymisierte Fassung" : ""}{info}`,
    "",
    "h2. Management-Übersicht",
    "|| Kennzahl || Wert || Einordnung ||",
    ...dossier.kpis.map((kpi) => `| ${confluenceEscape(kpi.label)} | ${confluenceEscape(kpi.value)} | ${confluenceEscape(kpi.hint || "—")} |`),
    "",
  ];
  for (const section of dossier.sections) {
    lines.push(`h2. ${section.title}`);
    if (section.description) lines.push(section.description);
    if (section.fields?.length) {
      lines.push("|| Feld || Wert ||");
      for (const field of section.fields) lines.push(`| ${confluenceEscape(field.label)} | ${confluenceEscape(field.value)} |`);
    }
    if (section.table) {
      if (section.table.rows.length === 0) lines.push("_Keine Daten vorhanden_");
      else {
        lines.push(`|| ${section.table.headers.map(confluenceEscape).join(" || ")} ||`);
        lines.push(...section.table.rows.map((row) => `| ${row.map(confluenceEscape).join(" | ")} |`));
      }
    }
    if (section.note) lines.push(`{note}${section.note}{note}`);
    lines.push("");
  }
  if (dossier.trend?.points.length) {
    const peak = getTrendPeak(dossier.trend.points);
    lines.push(
      "h2. Auslastungsverlauf",
      `Sieben Tage mit stündlichen Werten${peak ? `; höchster CPU-Demand am ${formatDetailTimestamp(peak.timestampUtc)} mit ${formatCpuDemand(peak.cpuDemandMHz)}` : ""}.`,
      "",
    );
  }
  return lines.join("\n");
}

export function downloadDetailText(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function detailFileName(kind: string, title: string, pseudonymized: boolean, extension: string): string {
  const safeTitle = title
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase("de-DE");
  return `${kind.toLocaleLowerCase("de-DE")}-${safeTitle || "details"}${pseudonymized ? "-pseudonymisiert" : ""}.${extension}`;
}

export function formatDetailTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCpuDemand(value: number | null): string {
  return value === null
    ? "—"
    : `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} MHz`;
}

export function getTrendPeak(points: VropsObjectTrendPoint[]): VropsObjectTrendPoint | null {
  return points.reduce<VropsObjectTrendPoint | null>(
    (peak, point) =>
      point.cpuDemandMHz !== null && (!peak || peak.cpuDemandMHz === null || point.cpuDemandMHz > peak.cpuDemandMHz)
        ? point
        : peak,
    null,
  );
}

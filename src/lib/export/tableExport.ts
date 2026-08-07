export interface TableExportColumn {
  id: string;
  header: unknown;
}

export interface TableExportRow {
  getValue: (columnId: string) => unknown;
}

export interface TableExportData {
  headers: string[];
  rows: Record<string, string>[];
  /**
   * Excel erhält numerische Quellwerte separat, damit sie nicht durch die
   * Textdarstellung für CSV, Markdown und JSON zu Zeichenketten werden.
   */
  excelRows?: Record<string, string | number>[];
}

export function resolveExportHeader(header: unknown, fallback: string): string {
  if (typeof header === "string" && header.trim()) return header.trim();
  if (typeof header === "number" || typeof header === "boolean") return String(header);
  return fallback.trim() || "Spalte";
}

export function formatExportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(formatExportValue).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatExcelExportValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Fachliche Messwerte werden im Tabellenexport bewusst auf zwei Stellen
    // begrenzt. Ganze Zahlen (z. B. vCPU oder VM-Anzahl) bleiben ganzzahlig.
    return Number(value.toFixed(2));
  }
  return formatExportValue(value);
}

export function normalizeExportFilename(value: string): string {
  const sanitized = Array.from(value.trim(), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char;
  }).join("");

  const normalized = sanitized
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "rvtools-table-export";
}

export function buildExportData(
  columns: TableExportColumn[],
  rows: TableExportRow[],
): TableExportData {
  const headerCounts = new Map<string, number>();
  const headers = columns.map((column) => {
    const baseHeader = resolveExportHeader(column.header, column.id);
    const nextCount = (headerCounts.get(baseHeader) ?? 0) + 1;
    headerCounts.set(baseHeader, nextCount);
    return nextCount === 1 ? baseHeader : `${baseHeader} ${nextCount}`;
  });

  return {
    headers,
    rows: rows.map((row) =>
      columns.reduce<Record<string, string>>((record, column, index) => {
        record[headers[index]] = formatExportValue(row.getValue(column.id));
        return record;
      }, {}),
    ),
    excelRows: rows.map((row) =>
      columns.reduce<Record<string, string | number>>((record, column, index) => {
        record[headers[index]] = formatExcelExportValue(row.getValue(column.id));
        return record;
      }, {}),
    ),
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function buildMarkdownTable(data: TableExportData): string {
  const headerLine = `| ${data.headers.map(escapeMarkdownCell).join(" | ")} |`;
  const separatorLine = `| ${data.headers.map(() => "---").join(" | ")} |`;
  const rowLines = data.rows.map(
    (row) => `| ${data.headers.map((header) => escapeMarkdownCell(row[header] ?? "")).join(" | ")} |`,
  );

  return [headerLine, separatorLine, ...rowLines].join("\n");
}

function escapeConfluenceWikiCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/\r?\n/g, "\\\\");
}

export function buildConfluenceWikiTable(data: TableExportData): string {
  const headerLine = `||${data.headers.map(escapeConfluenceWikiCell).join("||")}||`;
  const rowLines = data.rows.map(
    (row) => `|${data.headers.map((header) => escapeConfluenceWikiCell(row[header] ?? "")).join("|")}|`,
  );

  return [headerLine, ...rowLines].join("\n");
}

/** Gut lesbares, strukturtreues Format für Automatisierung und Weiterverarbeitung. */
export function buildJsonTable(data: TableExportData): string {
  return JSON.stringify(data.rows, null, 2);
}

export async function copyTableText(content: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Die Zwischenablage ist in diesem Browser nicht verfügbar.");
  }
  await navigator.clipboard.writeText(content);
}

export async function copyConfluenceWikiTable(data: TableExportData): Promise<void> {
  await copyTableText(buildConfluenceWikiTable(data));
}

/**
 * Löst einen Browser-Download aus. Der Object-URL wird erst im nächsten Tick
 * freigegeben, weil ein synchrones Revoke große Blobs (SysV-ZIPs) abbrechen kann.
 */
export function downloadBlobFile(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(content: string, filename: string, type: string): void {
  downloadBlobFile(content, filename, type);
}

export function exportMarkdownTable(data: TableExportData, filename: string): void {
  downloadTextFile(
    buildMarkdownTable(data),
    `${normalizeExportFilename(filename)}.md`,
    "text/markdown;charset=utf-8",
  );
}

export function escapeCsvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsvTable(data: TableExportData): string {
  return [
    data.headers.map(escapeCsvCell).join(";"),
    ...data.rows.map((row) => data.headers.map((header) => escapeCsvCell(row[header] ?? "")).join(";")),
  ].join("\r\n");
}

export function exportCsvTable(data: TableExportData, filename: string): void {
  downloadTextFile(`\uFEFF${buildCsvTable(data)}`, `${normalizeExportFilename(filename)}.csv`, "text/csv;charset=utf-8");
}

export function exportJsonTable(data: TableExportData, filename: string): void {
  downloadTextFile(buildJsonTable(data), `${normalizeExportFilename(filename)}.json`, "application/json;charset=utf-8");
}

export async function exportExcelTable(data: TableExportData, filename: string): Promise<void> {
  const XLSX = await import("@e965/xlsx");
  const worksheet = XLSX.utils.json_to_sheet(data.excelRows ?? data.rows, { header: data.headers });
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith("!")) continue;
    const cell = worksheet[address];
    if (cell?.t === "n" && typeof cell.v === "number" && !Number.isInteger(cell.v)) {
      // Excel übernimmt die Dezimaltrennzeichen aus der lokalen Office-Sprache:
      // in deutscher Umgebung wird daraus beispielsweise „148,23“.
      cell.z = "0.00";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Tabelle");
  XLSX.writeFile(workbook, `${normalizeExportFilename(filename)}.xlsx`, {
    compression: true,
  });
}

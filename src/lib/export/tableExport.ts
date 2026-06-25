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

export function downloadTextFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportMarkdownTable(data: TableExportData, filename: string): void {
  downloadTextFile(
    buildMarkdownTable(data),
    `${normalizeExportFilename(filename)}.md`,
    "text/markdown;charset=utf-8",
  );
}

export async function exportExcelTable(data: TableExportData, filename: string): Promise<void> {
  const XLSX = await import("@e965/xlsx");
  const worksheet = XLSX.utils.json_to_sheet(data.rows, { header: data.headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Tabelle");
  XLSX.writeFile(workbook, `${normalizeExportFilename(filename)}.xlsx`, {
    compression: true,
  });
}

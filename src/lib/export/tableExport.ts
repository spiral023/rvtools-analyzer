import type { Comments } from "@e965/xlsx";
import type { GlossaryEntry } from "@/lib/glossary";

export interface TableExportColumn {
  id: string;
  header: unknown;
  /** Glossar-Erklärung der Spalte; wird im Excel-Export zur Notiz am Spaltenkopf. */
  info?: GlossaryEntry;
  /** Einheit des exportierten Rohwerts; ergänzt den Spaltenkopf als „(MHz)“. */
  unit?: string;
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
  /**
   * Erklärung je Header, die der Excel-Export als Notiz an den Spaltenkopf hängt.
   * Nur für Excel relevant: CSV, Markdown und JSON bleiben reine Datenformate.
   */
  headerNotes?: Record<string, string>;
}

/**
 * Formt einen Glossar-Eintrag in den Notiztext am Spaltenkopf – inhaltlich
 * derselbe Text wie im Frontend-Tooltip (Begriff, Erklärung, RVTools-Herkunft).
 * Der Begriff entfällt, wenn er dem Header schon entspricht.
 */
export function buildHeaderNote(entry: GlossaryEntry, header: string): string {
  const term = entry.term?.trim() ?? "";
  const description = entry.description?.trim() ?? "";
  const source = entry.source?.trim() ?? "";
  const lines = (term && term !== header.trim() ? [term, description] : [description]).filter(Boolean);
  if (!lines.length) return "";
  if (source) lines.push("", `Quelle: ${source}`);
  return lines.join("\n");
}

export function resolveExportHeader(header: unknown, fallback: string): string {
  if (typeof header === "string" && header.trim()) return header.trim();
  if (typeof header === "number" || typeof header === "boolean") return String(header);
  return fallback.trim() || "Spalte";
}

/**
 * Hängt die Einheit an den Spaltenkopf, sofern er sie nicht schon nennt – „Ready P95“
 * wird zu „Ready P95 (%)“, „CPU Demand P95 %“ und „vCPU gesamt“ bleiben unberührt.
 */
export function withExportUnit(header: string, unit?: string): string {
  const normalized = unit?.trim();
  if (!normalized || header.includes(normalized)) return header;
  return `${header} (${normalized})`;
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
  // Die reine Spaltenbezeichnung ohne Einheit und Dedup-Suffix: an ihr entscheidet sich,
  // ob die Notiz den Begriff wiederholen muss.
  const labels = columns.map((column) => resolveExportHeader(column.header, column.id));
  const headers = columns.map((column, index) => {
    const baseHeader = withExportUnit(labels[index], column.unit);
    const nextCount = (headerCounts.get(baseHeader) ?? 0) + 1;
    headerCounts.set(baseHeader, nextCount);
    return nextCount === 1 ? baseHeader : `${baseHeader} ${nextCount}`;
  });

  return {
    headers,
    headerNotes: columns.reduce<Record<string, string>>((notes, column, index) => {
      const note = column.info ? buildHeaderNote(column.info, labels[index]) : "";
      if (note) notes[headers[index]] = note;
      return notes;
    }, {}),
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

/** Autor der Header-Notizen; Excel führt ihn in den Notizeigenschaften, nicht im Text. */
const EXCEL_NOTE_AUTHOR = "RVTools Analyzer";

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Maße der Notizfelder, ausgedrückt in Zellen: Excel bemisst Notizen ausschließlich
 * über den Anker im VML-Drawing – die Punktangaben im style-Attribut ignoriert es
 * (mit Excel 16 gegengeprüft). Die Bibliothek schreibt dafür starre zwei Spalten mal
 * vier Zeilen, in denen längere Erklärungen abgeschnitten sind.
 */
const NOTE_COLUMN_SPAN = 5;
/**
 * Zeichen je Notizzeile bei dieser Breite. Bewusst knapper als gemessen (bei fünf
 * Standardspalten passen je nach Systemschrift 50 bis 70 Zeichen in eine Zeile): eine
 * zu hohe Box kostet nur Leerraum, eine zu niedrige schneidet den Text ab.
 */
const NOTE_CHARS_PER_LINE = 45;
/** Notizzeilen (Tahoma 9 pt) je Tabellenzeile (15 pt). */
const NOTE_LINES_PER_ROW = 1.2;
const NOTE_MIN_ROW_SPAN = 4;

/** Zeilenbedarf einer Notiz, aus Textlänge und eigenen Umbrüchen geschätzt. */
function noteRowSpan(note: string): number {
  const lines = note
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / NOTE_CHARS_PER_LINE)), 0);
  return Math.max(NOTE_MIN_ROW_SPAN, Math.ceil(lines / NOTE_LINES_PER_ROW) + 1);
}

/**
 * Setzt den Anker jedes Notizfelds der Kopfzeile auf die Größe, die sein Text braucht.
 * Anker-Aufbau: Startspalte, dx, Startzeile, dy, Endspalte, dx, Endzeile, dy.
 */
function resizeNoteAnchors(vml: string, rowSpanByColumn: Map<number, number>): string {
  return vml.replace(/<v:shape\b[\s\S]*?<\/v:shape>/g, (shape) => {
    const column = Number(/<x:Column>(\d+)<\/x:Column>/.exec(shape)?.[1]);
    const row = Number(/<x:Row>(\d+)<\/x:Row>/.exec(shape)?.[1]);
    const rowSpan = rowSpanByColumn.get(column);
    if (row !== 0 || rowSpan === undefined) return shape;
    const anchor = [column + 1, 0, row + 1, 0, column + 1 + NOTE_COLUMN_SPAN, 0, row + 1 + rowSpan, 0];
    return shape.replace(/<x:Anchor>[^<]*<\/x:Anchor>/, `<x:Anchor>${anchor.join(",")}</x:Anchor>`);
  });
}

/**
 * Tauscht das VML-Drawing im fertig geschriebenen Paket aus. Das Neupacken erhält die
 * Deflate-Kompression, die Dateigröße bleibt also praktisch gleich. Schlägt der Eingriff
 * fehl, wird die unveränderte Datei ausgeliefert – eine zu kleine Notiz ist kein Grund,
 * einen Export zu verlieren.
 */
function withResizedNotes(
  XLSX: typeof import("@e965/xlsx"),
  workbookData: Uint8Array<ArrayBuffer>,
  rowSpanByColumn: Map<number, number>,
): Uint8Array<ArrayBuffer> {
  if (rowSpanByColumn.size === 0) return workbookData;
  try {
    const container = XLSX.CFB.read(workbookData, { type: "array" });
    const drawing = container.FileIndex.find((file: { name: string }) => file.name === "vmlDrawing1.vml");
    if (!drawing?.content) return workbookData;
    const resized = resizeNoteAnchors(new TextDecoder().decode(new Uint8Array(drawing.content)), rowSpanByColumn);
    XLSX.CFB.utils.cfb_add(container, "/xl/drawings/vmlDrawing1.vml", new TextEncoder().encode(resized));
    return new Uint8Array(XLSX.CFB.write(container, { type: "array", fileType: "zip", compression: true }));
  } catch {
    return workbookData;
  }
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
  // Die Spaltenerklärungen aus dem Frontend-Tooltip wandern als Excel-Notiz an
  // den Spaltenkopf: rote Ecke in der Zelle, Text erst beim Überfahren sichtbar.
  const rowSpanByColumn = new Map<number, number>();
  data.headers.forEach((header, index) => {
    const note = data.headerNotes?.[header];
    if (!note) return;
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: index })];
    if (!cell) return;
    const comments: Comments = [{ a: EXCEL_NOTE_AUTHOR, t: note, T: false }];
    comments.hidden = true;
    cell.c = comments;
    rowSpanByColumn.set(index, noteRowSpan(note));
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Tabelle");
  const written = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }));
  downloadBlobFile(
    withResizedNotes(XLSX, written, rowSpanByColumn),
    `${normalizeExportFilename(filename)}.xlsx`,
    EXCEL_MIME,
  );
}

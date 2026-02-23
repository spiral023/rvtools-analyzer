import * as XLSX from "xlsx";
import { detectParsedFileKind } from "@/lib/xlsx/parseHelpers";

const KNOWN_SHEETS = [
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork",
  "vCD", "vUSB", "vSnapshot", "vTools", "vSource", "vRP",
  "vCluster", "vHost", "vHBA", "vNIC", "vSwitch", "vPort",
  "dvSwitch", "dvPort", "vSC+VMK", "vDatastore", "vMultiPath",
  "vLicense", "vFileInfo", "vHealth", "vMetaData",
];

const SHEET_ALIASES: Record<string, string> = {
  "vSC+VMK": "vSC_VMK",
  "tabvInfo": "vInfo",
  "tabvCPU": "vCPU",
  "tabvMemory": "vMemory",
  "tabvDisk": "vDisk",
  "tabvPartition": "vPartition",
  "tabvNetwork": "vNetwork",
  "tabvSnapshot": "vSnapshot",
  "tabvTools": "vTools",
  "tabvHost": "vHost",
  "tabvCluster": "vCluster",
  "tabvDatastore": "vDatastore",
  "tabvHealth": "vHealth",
  "tabvLicense": "vLicense",
};

function resolveSheetName(name: string): string {
  if (SHEET_ALIASES[name]) return SHEET_ALIASES[name];
  const match = KNOWN_SHEETS.find((s) => s.toLowerCase() === name.toLowerCase());
  return match || name;
}

self.onmessage = async (e: MessageEvent) => {
  try {
    const { type, payload } = e.data;
    if (type !== "PARSE_FILE") return;

    const buffer: ArrayBuffer = payload.buffer;
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });

    const warnings: string[] = [];
    const errors: string[] = [];
    const sheets: Array<{
      sheetName: string;
      headers: string[];
      rows: Record<string, unknown>[];
    }> = [];

    const foundSheets = new Set<string>();
    for (const rawName of wb.SheetNames) {
      const canonical = resolveSheetName(rawName);
      foundSheets.add(canonical);

      const ws = wb.Sheets[rawName];
      if (!ws) {
        warnings.push(`Sheet "${rawName}" is empty.`);
        continue;
      }

      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: null,
        raw: true,
      });

      if (jsonData.length === 0) {
        warnings.push(`Sheet "${rawName}" has no data rows.`);
        continue;
      }

      const headers = Object.keys(jsonData[0] || {});
      sheets.push({ sheetName: canonical, headers, rows: jsonData });
    }

    const fileKind = detectParsedFileKind(sheets.map((s) => ({ sheetName: s.sheetName, headers: s.headers })));

    if (fileKind === "rvtools") {
      for (const expected of KNOWN_SHEETS) {
        const canonical = SHEET_ALIASES[expected] || expected;
        if (!foundSheets.has(canonical) && !foundSheets.has(expected)) {
          warnings.push(`Expected sheet "${expected}" not found.`);
        }
      }
    }

    let vcenterName = "unknown-vcenter";
    const vSource = sheets.find((s) => s.sheetName === "vSource");
    const vMetaData = sheets.find((s) => s.sheetName === "vMetaData");

    if (vSource && vSource.rows.length > 0) {
      const row = vSource.rows[0];
      vcenterName = String(row["Name"] || row["Fullname"] || row["Server"] || "unknown-vcenter");
    } else if (vMetaData && vMetaData.rows.length > 0) {
      const row = vMetaData.rows[0];
      vcenterName = String(row["Server"] || row["Name"] || "unknown-vcenter");
    }

    let exportTs = new Date().toISOString();
    if (vMetaData && vMetaData.rows.length > 0) {
      const row = vMetaData.rows[0];
      const val = row["xlsx creation datetime"] || row["Creation date"];
      if (typeof val === "number") {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const ms = epoch.getTime() + val * 86400000;
        exportTs = new Date(ms).toISOString();
      } else if (typeof val === "string" && val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) exportTs = d.toISOString();
      }
    }

    self.postMessage({
      type: "PARSE_COMPLETE",
      payload: { fileKind, vcenterName, exportTs, sheets, warnings, errors },
    });
  } catch (err) {
    self.postMessage({
      type: "PARSE_ERROR",
      payload: err instanceof Error ? err.message : String(err),
    });
  }
};

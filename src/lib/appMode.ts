import type { AppMode, AppModeState } from "@/domain/models/types";
import { normalizeSysvScopePreference } from "@/lib/sysvScope";

export const APP_MODE_UI_STATE_ID = "app-mode";
export const APP_MODE_STATE_CHANGED_EVENT = "rvtools-analyzer:app-mode-changed";
export const MODE_FILE_KIND = "rvtools-analyzer-mode";
export const MODE_FILE_VERSION = 1;

export interface ModeFileDefinition {
  kind: typeof MODE_FILE_KIND;
  version: typeof MODE_FILE_VERSION;
  mode: AppMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function createDefaultAppModeState(now = new Date().toISOString()): AppModeState {
  return {
    mode: "vm-admin",
    lastSysvScope: { kind: "all" },
    updatedAt: now,
  };
}

/** Normalisiert defensiv einen aus `ui_state` gelesenen Modusdatensatz. */
export function normalizeAppModeState(value: unknown, now = new Date().toISOString()): AppModeState {
  if (!isRecord(value)) return createDefaultAppModeState(now);
  return {
    mode: value.mode === "sysv" || value.mode === "vm-admin" ? value.mode : "vm-admin",
    lastSysvScope: normalizeSysvScopePreference(value.lastSysvScope),
    updatedAt: isValidTimestamp(value.updatedAt) ? value.updatedAt : now,
  };
}

export function isModeFileName(fileName: string): boolean {
  const baseName = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  return baseName.toLocaleLowerCase("en-US") === "modus.json";
}

/** Parst die strikt versionierte, aber vorwärtskompatible Modusdatei. */
export function parseModeFile(raw: string): ModeFileDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("modus.json enthält kein gültiges JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("modus.json muss ein JSON-Objekt enthalten.");
  }
  if (parsed.kind !== MODE_FILE_KIND) {
    throw new Error(`modus.json: „kind“ muss „${MODE_FILE_KIND}“ sein.`);
  }
  if (parsed.version !== MODE_FILE_VERSION) {
    throw new Error(`modus.json: „version“ muss ${MODE_FILE_VERSION} sein.`);
  }
  if (parsed.mode !== "sysv" && parsed.mode !== "vm-admin") {
    throw new Error("modus.json: „mode“ muss „sysv“ oder „vm-admin“ sein.");
  }

  return {
    kind: MODE_FILE_KIND,
    version: MODE_FILE_VERSION,
    mode: parsed.mode,
  };
}

/** Benachrichtigt bereits gemountete Provider über externe Schreibvorgänge, etwa Backup-Imports. */
export function notifyAppModeStateChanged(): void {
  globalThis.dispatchEvent?.(new Event(APP_MODE_STATE_CHANGED_EVENT));
}

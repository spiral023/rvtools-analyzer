import { describe, expect, it } from "vitest";
import {
  createDefaultAppModeState,
  isModeFileName,
  normalizeAppModeState,
  parseModeFile,
} from "@/lib/appMode";

describe("modus.json", () => {
  it("akzeptiert die beiden gültigen Modusdefinitionen und ignoriert Zusatzfelder", () => {
    expect(parseModeFile(JSON.stringify({
      kind: "rvtools-analyzer-mode",
      version: 1,
      mode: "sysv",
      futureOption: true,
    }))).toMatchObject({ mode: "sysv" });
    expect(parseModeFile(JSON.stringify({
      kind: "rvtools-analyzer-mode",
      version: 1,
      mode: "vm-admin",
    }))).toMatchObject({ mode: "vm-admin" });
  });

  it("lehnt ungültiges JSON sowie falsche Vertragsfelder strikt ab", () => {
    expect(() => parseModeFile("kein json")).toThrow("gültiges JSON");
    expect(() => parseModeFile(JSON.stringify({ kind: "other", version: 1, mode: "sysv" }))).toThrow("kind");
    expect(() => parseModeFile(JSON.stringify({ kind: "rvtools-analyzer-mode", version: 2, mode: "sysv" }))).toThrow("version");
    expect(() => parseModeFile(JSON.stringify({ kind: "rvtools-analyzer-mode", version: 1, mode: "other" }))).toThrow("mode");
  });

  it("erkennt Modusdateien unabhängig von Groß-/Kleinschreibung und ZIP-Pfad", () => {
    expect(isModeFileName("MODUS.JSON")).toBe(true);
    expect(isModeFileName("paket/sysv/modus.json")).toBe(true);
    expect(isModeFileName("rvtools-analyzer-backup.json")).toBe(false);
  });
});

describe("AppModeState", () => {
  it("fällt ohne gültige Persistenz auf VM-Admin und Alle Systeme zurück", () => {
    expect(createDefaultAppModeState("2026-08-03T10:00:00.000Z")).toEqual({
      mode: "vm-admin",
      lastSysvScope: { kind: "all" },
      updatedAt: "2026-08-03T10:00:00.000Z",
    });
    expect(normalizeAppModeState({ mode: "unbekannt", lastSysvScope: { kind: "other" } }, "2026-08-03T10:00:00.000Z"))
      .toEqual(createDefaultAppModeState("2026-08-03T10:00:00.000Z"));
  });
});

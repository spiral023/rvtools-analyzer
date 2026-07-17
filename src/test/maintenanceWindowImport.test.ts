import { describe, expect, it } from "vitest";

import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import {
  buildMaintenanceImportPreview,
  parseMaintenanceWindowText,
  validateMaintenanceWindowBlock,
} from "@/lib/maintenanceWindowImport";
import {
  createEmptyWeeklySlots,
  slotsToExternalMask,
} from "@/lib/maintenanceWindows";

const BLOCKED_MASK = "1".repeat(48);
const ALLOWED_MASK = "0".repeat(48);

function maskWithAllowedRange(startSlot: number, endSlot: number): string {
  return Array.from({ length: 48 }, (_value, slot) => (
    slot >= startSlot && slot < endSlot ? "0" : "1"
  )).join("");
}

function block(
  abbreviation: string,
  description: string,
  masks: readonly string[] = Array(7).fill(BLOCKED_MASK),
): string[] {
  return [abbreviation, description, ...masks];
}

function definition(
  abbreviation: string,
  overrides: Partial<MaintenanceWindowDefinition> = {},
): MaintenanceWindowDefinition {
  return {
    id: `id-${abbreviation}`,
    abbreviation,
    normalizedAbbreviation: abbreviation.trim().toLocaleLowerCase("de-DE"),
    description: `${abbreviation} Beschreibung`,
    handling: "regular",
    weeklySlots: createEmptyWeeklySlots(),
    calendarRules: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseMaintenanceWindowText", () => {
  it("parses a pasted OCP MO1 table with mojibake header, CRLF and arbitrary blank lines", () => {
    const masks = [
      ALLOWED_MASK,
      BLOCKED_MASK,
      "01".repeat(24),
      "10".repeat(24),
      `${"1".repeat(16)}${"0".repeat(16)}${"1".repeat(16)}`,
      `${"0".repeat(24)}${"1".repeat(24)}`,
      `${"1".repeat(24)}${"0".repeat(24)}`,
    ];
    const cells = [
      "AbkÃ¼rzung",
      "Details",
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
      "Sonntag",
      ...block(" OCP MO1 ", " OCP Standardfenster ", masks),
    ];
    const pastedText = cells.join("\r\n  \r\n\r\n");

    const result = parseMaintenanceWindowText(pastedText);

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].block).toBe(1);
    expect(result.entries[0].definition.abbreviation).toBe("OCP MO1");
    expect(result.entries[0].definition.description).toBe("OCP Standardfenster");
    expect(result.entries[0].definition.normalizedAbbreviation).toBe("ocp mo1");
    expect(result.entries[0].definition.weeklySlots).toHaveLength(7);
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(masks);
  });

  it("removes the proper known header only at the file start", () => {
    const text = [
      "Abkürzung",
      "Details",
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
      "Sonntag",
      ...block("MO1", "Regulär"),
    ].join("\n");

    const result = parseMaintenanceWindowText(text);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].definition.abbreviation).toBe("MO1");
    expect(result.errors).toEqual([]);
  });

  it("reports mask length and character errors without silently accepting either mask", () => {
    const text = [
      ...block("SHORT", "Zu kurz", ["1".repeat(47), ...Array(6).fill(BLOCKED_MASK)]),
      ...block("CHAR", "Falsches Zeichen", [`${"1".repeat(47)}x`, ...Array(6).fill(BLOCKED_MASK)]),
    ].join("\n");

    const result = parseMaintenanceWindowText(text);

    expect(result.entries).toHaveLength(2);
    expect(result.errors.map(({ code, block, field }) => ({ code, block, field }))).toEqual([
      { code: "mask-length", block: 1, field: "Montag" },
      { code: "mask-characters", block: 2, field: "Montag" },
    ]);
    expect(result.entries[0].issues).toContainEqual(expect.objectContaining({ code: "mask-length" }));
    expect(result.entries[1].issues).toContainEqual(expect.objectContaining({ code: "mask-characters" }));
  });

  it("reports an incomplete trailing block", () => {
    const result = parseMaintenanceWindowText([
      ...block("COMPLETE", "Vollständig"),
      "INCOMPLETE",
      "Nur zwei Zellen",
    ].join("\n"));

    expect(result.entries).toHaveLength(1);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "incomplete-block",
      block: 2,
      severity: "error",
    }));
  });

  it("marks every entry whose normalized abbreviation is duplicated", () => {
    const result = parseMaintenanceWindowText([
      ...block("OCP MO1", "Erste Definition"),
      ...block(" ocp mo1 ", "Zweite Definition"),
    ].join("\n"));

    expect(result.errors.filter((issue) => issue.code === "duplicate-abbreviation")).toHaveLength(2);
    expect(result.entries.every((entry) => (
      entry.issues.some((issue) => issue.code === "duplicate-abbreviation")
    ))).toBe(true);
  });

  it("exposes direct validation for an empty abbreviation that blank-line normalization cannot retain", () => {
    const issues = validateMaintenanceWindowBlock(block("   ", "Beschreibung"), 4);

    expect(issues).toContainEqual(expect.objectContaining({
      code: "empty-abbreviation",
      block: 4,
      field: "abbreviation",
      severity: "error",
    }));
  });

  it.each([
    ["Änderungen nur nach Rücksprache", "approval-required"],
    ["Ausführung laut INF-VA 4711", "external"],
  ] as const)("infers special handling from %s", (description, handling) => {
    const result = parseMaintenanceWindowText(block("SPECIAL", description).join("\n"));

    expect(result.entries[0].definition.handling).toBe(handling);
  });

  it("infers always only for all-day prose with masks that allow every slot", () => {
    const allAllowed = parseMaintenanceWindowText(
      block("ALL", "Täglich 00:00 - 24:00", Array(7).fill(ALLOWED_MASK)).join("\n"),
    );
    const blocked = parseMaintenanceWindowText(
      block("NOT-ALL", "Täglich 00:00 - 24:00").join("\n"),
    );

    expect(allAllowed.entries[0].definition.handling).toBe("always");
    expect(blocked.entries[0].definition.handling).toBe("regular");
  });

  it("infers first and third Sunday calendar rules without rewriting imported masks", () => {
    const sundayMask = maskWithAllowedRange(30, 36);
    const masks = [...Array(6).fill(BLOCKED_MASK), sundayMask];

    const result = parseMaintenanceWindowText(block(
      "SUN",
      "1. und 3. Sonntag im Monat 15:00 - 18:00",
      masks,
    ).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [1, 3] },
    ]);
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(masks);
    expect(result.warnings).toEqual([]);
  });

  it("warns when a supported weekday and time description conflicts with the mask", () => {
    const result = parseMaintenanceWindowText(block(
      "CONFLICT",
      "Montag 08:00 - 10:00",
    ).join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "description-conflict",
      block: 1,
      field: "description",
    }));
    expect(result.entries[0].issues).toEqual(result.warnings);
  });
});

describe("buildMaintenanceImportPreview", () => {
  it("classifies new, changed and unchanged entries while preserving persisted identity", () => {
    const unchangedExisting = definition("SAME", {
      weeklySlots: createEmptyWeeklySlots(),
    });
    const changedExisting = definition("UPDATE", {
      description: "Vorher",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-02-01T00:00:00.000Z",
    });
    const parsed = parseMaintenanceWindowText([
      ...block("NEW", "Neu"),
      ...block(" update ", "Nachher"),
      ...block("SAME", "SAME Beschreibung"),
    ].join("\n"));
    const entriesBefore = structuredClone(parsed.entries);
    const existingBefore = structuredClone([unchangedExisting, changedExisting]);

    const preview = buildMaintenanceImportPreview(
      parsed.entries,
      [unchangedExisting, changedExisting],
    );

    expect(preview.map((row) => row.status)).toEqual(["new", "update", "unchanged"]);
    expect(preview.map((row) => row.sourceBlock)).toEqual([1, 2, 3]);
    expect(preview[0].definition.id).toBe(parsed.entries[0].definition.id);
    expect(preview[1].definition.id).toBe(changedExisting.id);
    expect(preview[1].definition.createdAt).toBe(changedExisting.createdAt);
    expect(preview[1].definition.updatedAt).not.toBe(changedExisting.updatedAt);
    expect(preview[1].issues).toEqual(parsed.entries[1].issues);
    expect(preview[2].definition).toEqual(unchangedExisting);
    expect(parsed.entries).toEqual(entriesBefore);
    expect([unchangedExisting, changedExisting]).toEqual(existingBefore);
  });
});

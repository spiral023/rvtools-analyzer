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

  it("recovers after a middle block with a missing mask without shifting the next valid block", () => {
    const validMasks = [
      ALLOWED_MASK,
      BLOCKED_MASK,
      "01".repeat(24),
      "10".repeat(24),
      BLOCKED_MASK,
      ALLOWED_MASK,
      BLOCKED_MASK,
    ];
    const text = [
      ...block("FIRST", "Vollständig"),
      "BROKEN",
      "Sonntagsmaske fehlt",
      ...Array(6).fill(BLOCKED_MASK),
      ...block("LATER", "Bleibt erhalten", validMasks),
    ].join("\n");

    const result = parseMaintenanceWindowText(text);

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual(["FIRST", "LATER"]);
    expect(result.entries[1].definition.weeklySlots.map(slotsToExternalMask)).toEqual(validMasks);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "incomplete-block",
      block: 2,
    }));
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "mask-length",
      block: 2,
      field: "Sonntag",
    }));
  });

  it("parses a structurally identifiable block whose description cell is empty", () => {
    const masks = [ALLOWED_MASK, ...Array(6).fill(BLOCKED_MASK)];
    const result = parseMaintenanceWindowText([
      "EMPTY-DESCRIPTION",
      "   ",
      ...masks,
      ...block("NEXT", "Nächster Block"),
    ].join("\r\n"));

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual([
      "EMPTY-DESCRIPTION",
      "NEXT",
    ]);
    expect(result.entries[0].definition.description).toBe("");
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(masks);
    expect(result.errors).toEqual([]);
  });

  it("keeps an exactly 48-character description in the explicit normal form", () => {
    const description = "Beschreibung mit exakt 48 Zeichen".padEnd(48, "!");
    expect(description).toHaveLength(48);
    const result = parseMaintenanceWindowText([
      ...block("TEXT-48", description),
      ...block("NEXT", "Folgeblock"),
    ].join("\n"));

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual(["TEXT-48", "NEXT"]);
    expect(result.entries[0].definition.description).toBe(description);
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(
      Array(7).fill(BLOCKED_MASK),
    );
  });

  it("keeps a binary-only description in the explicit normal form", () => {
    const description = "01".repeat(24);
    const result = parseMaintenanceWindowText(block("BINARY-TEXT", description).join("\n"));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].definition.description).toBe(description);
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(
      Array(7).fill(BLOCKED_MASK),
    );
  });

  it("recovers at a later valid block after a mask with invalid length and characters", () => {
    const result = parseMaintenanceWindowText([
      ...block("BROKEN-BOTH", "Fehlerhafte Maske", ["10x", ...Array(6).fill(BLOCKED_MASK)]),
      ...block("PRESERVED", "Valider Folgeblock"),
    ].join("\n"));

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual(["PRESERVED"]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "mask-length",
      block: 1,
      field: "Montag",
    }));
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "mask-characters",
      block: 1,
      field: "Montag",
    }));
  });

  it("recovers to a later complete empty-description block without using a mask as abbreviation", () => {
    const laterMasks = [ALLOWED_MASK, ...Array(6).fill(BLOCKED_MASK)];
    const result = parseMaintenanceWindowText([
      ...block("BROKEN", "Ungültig", ["10x", ...Array(6).fill(BLOCKED_MASK)]),
      "EMPTY-LATER",
      ...laterMasks,
    ].join("\n"));

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual(["EMPTY-LATER"]);
    expect(result.entries[0].definition.description).toBe("");
    expect(result.entries[0].definition.weeklySlots.map(slotsToExternalMask)).toEqual(laterMasks);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "incomplete-block",
      block: 1,
    }));
  });

  it("preserves tab cell boundaries and reports an explicitly empty abbreviation", () => {
    const result = parseMaintenanceWindowText([
      "\tBeschreibung\t",
      Array(7).fill(BLOCKED_MASK).join("\t"),
    ].join(""));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].definition.abbreviation).toBe("");
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "empty-abbreviation",
      block: 1,
      field: "abbreviation",
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
    ["sparse", Object.assign(Array<unknown>(9), { 0: "ABBR" })],
    ["non-string", ["ABBR", "Beschreibung", 42, ...Array(6).fill(BLOCKED_MASK)]],
  ])("returns a controlled issue for a %s runtime block", (_label, malformedBlock) => {
    expect(() => validateMaintenanceWindowBlock(malformedBlock)).not.toThrow();
    expect(validateMaintenanceWindowBlock(malformedBlock)).toContainEqual(expect.objectContaining({
      code: "incomplete-block",
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

  it.each([
    ["am ersten und dritten Sonntag im Monat", 6, [1, 3]],
    ["am fünften Montag im Monat", 0, [5]],
    ["am letzten Freitag im Monat", 4, ["last"]],
  ] as const)("supports bounded German monthly inflections in %s", (description, weekday, occurrences) => {
    const result = parseMaintenanceWindowText(block("RULE", description).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([{ weekday, occurrences }]);
  });

  it.each([
    "am vorletzten Sonntag im Monat",
    "nicht am 1. Sonntag im Monat",
    "kein dritter Montag im Monat",
    "1. Sonntagsdienst im Monat",
    "am allerletzten Freitag im Monat",
  ])("does not infer monthly rules from unsupported or negated prose: %s", (description) => {
    const result = parseMaintenanceWindowText(block("NO-RULE", description).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([]);
  });

  it.each([
    "laut INF-VA 4711",
    "gemäß Betriebsdokumentation",
    "extern festgelegt",
    "extern definiert",
  ])("infers external handling from bounded reference wording: %s", (description) => {
    const result = parseMaintenanceWindowText(block("EXTERNAL", description).join("\n"));

    expect(result.entries[0].definition.handling).toBe("external");
  });

  it.each([
    "Der Lautsprecher wird geprüft",
    "Die Verlautbarung ist intern",
    "lautloser Betrieb",
    "nicht extern festgelegt",
  ])("does not infer external handling from unrelated or negated wording: %s", (description) => {
    const result = parseMaintenanceWindowText(block("REGULAR", description).join("\n"));

    expect(result.entries[0].definition.handling).toBe("regular");
  });

  it("scopes monthly negation to the immediate contrastive clause", () => {
    const description = "nicht am 1. Sonntag, sondern am 3. Sonntag im Monat";
    const result = parseMaintenanceWindowText(block("CLAUSE-RULE", description).join("\n"));

    expect(result.entries[0].definition.description).toBe(description);
    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [3] },
    ]);
  });

  it("keeps commas inside a supported monthly occurrence list", () => {
    const result = parseMaintenanceWindowText(block(
      "COMMA-RULE",
      "1., 3. Sonntag im Monat",
    ).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [1, 3] },
    ]);
  });

  it("keeps commas inside a supported word-based occurrence list", () => {
    const result = parseMaintenanceWindowText(block(
      "WORD-COMMA-RULE",
      "ersten, dritten Sonntag im Monat",
    ).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [1, 3] },
    ]);
  });

  it("splits sentence periods without treating ordinal dots as sentence boundaries", () => {
    const result = parseMaintenanceWindowText(block(
      "SENTENCE-RULE",
      "nicht am 1. Sonntag. Am 3. Sonntag im Monat",
    ).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [3] },
    ]);
  });

  it("splits an ordinary comma when only its right side begins with an occurrence", () => {
    const result = parseMaintenanceWindowText(block(
      "ORDINARY-COMMA",
      "nicht am Montag, erster Sonntag im Monat",
    ).join("\n"));

    expect(result.entries[0].definition.calendarRules).toEqual([
      { weekday: 6, occurrences: [1] },
    ]);
  });

  it("infers an external reference after a sentence-ending period", () => {
    const result = parseMaintenanceWindowText(block(
      "SENTENCE-EXTERNAL",
      "nicht extern festgelegt. Gemäß INF-VA",
    ).join("\n"));

    expect(result.entries[0].definition.handling).toBe("external");
  });

  it("infers an external reference in a positive clause after a negated clause", () => {
    const description = "nicht automatisch, sondern gemäß INF-VA";
    const result = parseMaintenanceWindowText(block("CLAUSE-EXTERNAL", description).join("\n"));

    expect(result.entries[0].definition.description).toBe(description);
    expect(result.entries[0].definition.handling).toBe("external");
  });

  it("keeps generic laut wording regular when it has no document or identifier signal", () => {
    const result = parseMaintenanceWindowText(block(
      "GENERIC-LAUT",
      "Wartung laut eigener Aussage möglich",
    ).join("\n"));

    expect(result.entries[0].definition.handling).toBe("regular");
  });

  it("uses only the positive recognizable reference across mixed clauses", () => {
    const result = parseMaintenanceWindowText(block(
      "MIXED-REFERENCE",
      "nicht gemäß INF-VA; jedoch laut Change-4711",
    ).join("\n"));

    expect(result.entries[0].definition.handling).toBe("external");
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

  it("uses one timestamp per parse run and a unique UUID for every entry", () => {
    const result = parseMaintenanceWindowText([
      ...block("ONE", "Erster Block"),
      ...block("TWO", "Zweiter Block"),
    ].join("\n"));

    expect(new Set(result.entries.map((entry) => entry.definition.createdAt)).size).toBe(1);
    expect(result.entries.every((entry) => (
      entry.definition.updatedAt === entry.definition.createdAt
    ))).toBe(true);
    expect(new Set(result.entries.map((entry) => entry.definition.id)).size).toBe(2);
    expect(result.entries.every((entry) => (
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(entry.definition.id)
    ))).toBe(true);
  });

  it("does not strip a header-like sequence that occurs after imported content", () => {
    const result = parseMaintenanceWindowText([
      ...block("FIRST", "Valider Inhalt"),
      "Abkürzung",
      "Details",
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
      "Sonntag",
    ].join("\n"));

    expect(result.entries.map((entry) => entry.definition.abbreviation)).toEqual(["FIRST"]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "incomplete-block",
      block: 2,
    }));
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

  it("matches existing definitions from their abbreviation even when the cached normalized value is stale", () => {
    const existing = definition("MATCH", {
      normalizedAbbreviation: "veraltet",
      description: "Gleicher Datensatz",
    });
    const parsed = parseMaintenanceWindowText(block("MATCH", "Gleicher Datensatz").join("\n"));

    const preview = buildMaintenanceImportPreview(parsed.entries, [existing]);

    expect(preview[0].status).toBe("update");
    expect(preview[0].definition.id).toBe(existing.id);
    expect(preview[0].definition.createdAt).toBe(existing.createdAt);
  });

  it("rejects duplicate normalized abbreviations in persisted definitions deterministically", () => {
    const parsed = parseMaintenanceWindowText(block("DUP", "Import").join("\n"));
    const existing = [
      definition("DUP", { id: "first" }),
      definition(" dup ", { id: "second" }),
    ];

    expect(() => buildMaintenanceImportPreview(parsed.entries, existing)).toThrow(
      /Abkürzung.*mehrfach.*vorhanden/iu,
    );
  });

  it("treats reordered and duplicated equivalent calendar rules as unchanged", () => {
    const parsed = parseMaintenanceWindowText(block("CANON", "Kalenderregeln").join("\n"));
    parsed.entries[0].definition.calendarRules = [
      { weekday: 6, occurrences: [1, 3] },
      { weekday: 0, occurrences: [2, "last"] },
    ];
    const existing = definition("CANON", {
      description: "Kalenderregeln",
      calendarRules: [
        { weekday: 0, occurrences: ["last", 2, 2] },
        { weekday: 6, occurrences: [3, 1, 3] },
      ],
    });

    const preview = buildMaintenanceImportPreview(parsed.entries, [existing]);

    expect(preview[0].status).toBe("unchanged");
    expect(preview[0].definition).toEqual(existing);
  });

  it("deeply isolates preview definitions and issues from parsed input", () => {
    const parsed = parseMaintenanceWindowText(block(
      "CLONE",
      "1. Sonntag im Monat 15:00 - 18:00",
    ).join("\n"));
    const before = structuredClone(parsed.entries);

    const preview = buildMaintenanceImportPreview(parsed.entries, []);
    preview[0].definition.weeklySlots[6][30] = true;
    preview[0].definition.calendarRules[0].occurrences.push(2);
    preview[0].issues[0].message = "verändert";

    expect(parsed.entries).toEqual(before);
  });
});

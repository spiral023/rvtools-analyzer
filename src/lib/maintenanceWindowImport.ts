import type {
  MaintenanceCalendarRule,
  MaintenanceWeekday,
  MaintenanceWindowDefinition,
  MonthlyOccurrence,
} from "@/domain/models/types";
import {
  DAY_LABELS,
  SLOT_COUNT,
  createEmptyDaySlots,
  externalMaskToSlots,
  normalizeMaintenanceAbbreviation,
  timeToSlot,
} from "@/lib/maintenanceWindows";

export type MaintenanceImportIssueCode =
  | "incomplete-block"
  | "empty-abbreviation"
  | "mask-length"
  | "mask-characters"
  | "duplicate-abbreviation"
  | "description-conflict";

export type MaintenanceImportIssueField =
  | "abbreviation"
  | "description"
  | (typeof DAY_LABELS)[number];

export interface MaintenanceImportIssue {
  severity: "warning" | "error";
  code: MaintenanceImportIssueCode;
  block: number;
  field?: MaintenanceImportIssueField;
  message: string;
}

export interface ParsedMaintenanceEntry {
  block: number;
  definition: MaintenanceWindowDefinition;
  issues: MaintenanceImportIssue[];
}

export interface MaintenanceImportParseResult {
  entries: ParsedMaintenanceEntry[];
  errors: MaintenanceImportIssue[];
  warnings: MaintenanceImportIssue[];
}

export type MaintenanceImportStatus = "new" | "update" | "unchanged";

export interface MaintenanceImportPreviewRow {
  status: MaintenanceImportStatus;
  definition: MaintenanceWindowDefinition;
  issues: MaintenanceImportIssue[];
  sourceBlock: number;
}

const CELLS_PER_BLOCK = 9;
const HEADER_TAIL = ["Details", ...DAY_LABELS] as const;
const WEEKDAY_PATTERN = DAY_LABELS.join("|");
const OCCURRENCE_TOKEN_PATTERN = [
  "[1-5]\\.",
  "erste\\p{L}*",
  "zweite\\p{L}*",
  "dritte\\p{L}*",
  "vierte\\p{L}*",
  "fünfte\\p{L}*",
  "letzte\\p{L}*",
].join("|");

const MONTHLY_RULE_PATTERN = new RegExp(
  `(${OCCURRENCE_TOKEN_PATTERN})(?:\\s*(?:,|und|oder)\\s*(${OCCURRENCE_TOKEN_PATTERN}))*\\s+(${WEEKDAY_PATTERN})`,
  "giu",
);
const OCCURRENCE_PATTERN = new RegExp(OCCURRENCE_TOKEN_PATTERN, "giu");
const WEEKDAY_TIME_PATTERN = new RegExp(
  `(${WEEKDAY_PATTERN})(?:\\s+im\\s+Monat)?\\s+(\\d{2}:\\d{2})\\s*[-–]\\s*(\\d{2}:\\d{2})`,
  "giu",
);

function issue(
  severity: MaintenanceImportIssue["severity"],
  code: MaintenanceImportIssueCode,
  block: number,
  message: string,
  field?: MaintenanceImportIssueField,
): MaintenanceImportIssue {
  return { severity, code, block, field, message };
}

function hasKnownHeader(lines: readonly string[]): boolean {
  if (lines.length < CELLS_PER_BLOCK) return false;
  if (lines[0] !== "Abkürzung" && lines[0] !== "AbkÃ¼rzung") return false;
  return HEADER_TAIL.every((label, index) => lines[index + 1] === label);
}

/**
 * Validates a structural block before conversion. This helper also makes an
 * empty first cell testable because blank-line normalization necessarily loses
 * the distinction between an empty table cell and a visual separator.
 */
export function validateMaintenanceWindowBlock(
  cells: readonly string[],
  block = 1,
): MaintenanceImportIssue[] {
  const issues: MaintenanceImportIssue[] = [];

  if (cells.length !== CELLS_PER_BLOCK) {
    issues.push(issue(
      "error",
      "incomplete-block",
      block,
      `Block ${block} enthält ${cells.length} statt ${CELLS_PER_BLOCK} Felder.`,
    ));
    return issues;
  }

  if (!cells[0].trim()) {
    issues.push(issue(
      "error",
      "empty-abbreviation",
      block,
      "Die Abkürzung darf nicht leer sein.",
      "abbreviation",
    ));
  }

  for (let day = 0; day < DAY_LABELS.length; day += 1) {
    const mask = cells[day + 2].trim();
    const field = DAY_LABELS[day];
    if (mask.length !== SLOT_COUNT) {
      issues.push(issue(
        "error",
        "mask-length",
        block,
        `${field}: Die Maske muss genau ${SLOT_COUNT} Zeichen lang sein.`,
        field,
      ));
    }
    if (!/^[01]+$/.test(mask)) {
      issues.push(issue(
        "error",
        "mask-characters",
        block,
        `${field}: Die Maske darf nur 0 und 1 enthalten.`,
        field,
      ));
    }
  }

  return issues;
}

function occurrenceFromToken(token: string): MonthlyOccurrence | null {
  const numeric = /^([1-5])\.$/.exec(token);
  if (numeric) return Number(numeric[1]) as Exclude<MonthlyOccurrence, "last">;

  const normalized = token.toLocaleLowerCase("de-DE");
  if (normalized.startsWith("erste")) return 1;
  if (normalized.startsWith("zweite")) return 2;
  if (normalized.startsWith("dritte")) return 3;
  if (normalized.startsWith("vierte")) return 4;
  if (normalized.startsWith("fünfte")) return 5;
  if (normalized.startsWith("letzte")) return "last";
  return null;
}

function weekdayFromLabel(label: string): MaintenanceWeekday | null {
  const weekday = DAY_LABELS.findIndex((candidate) => (
    candidate.localeCompare(label, "de-DE", { sensitivity: "base" }) === 0
  ));
  return weekday < 0 ? null : weekday as MaintenanceWeekday;
}

function inferCalendarRules(description: string): MaintenanceCalendarRule[] {
  const byWeekday = new Map<MaintenanceWeekday, Set<MonthlyOccurrence>>();

  for (const match of description.matchAll(MONTHLY_RULE_PATTERN)) {
    const weekday = weekdayFromLabel(match[match.length - 1]);
    if (weekday === null) continue;

    const occurrenceText = match[0].slice(0, match[0].lastIndexOf(match[match.length - 1]));
    const occurrences = [...occurrenceText.matchAll(OCCURRENCE_PATTERN)]
      .map((occurrenceMatch) => occurrenceFromToken(occurrenceMatch[0]))
      .filter((value): value is MonthlyOccurrence => value !== null);
    if (occurrences.length === 0) continue;

    const known = byWeekday.get(weekday) ?? new Set<MonthlyOccurrence>();
    occurrences.forEach((occurrence) => known.add(occurrence));
    byWeekday.set(weekday, known);
  }

  const occurrenceOrder: readonly MonthlyOccurrence[] = [1, 2, 3, 4, 5, "last"];
  return [...byWeekday.entries()]
    .sort(([left], [right]) => left - right)
    .map(([weekday, occurrences]) => ({
      weekday,
      occurrences: occurrenceOrder.filter((occurrence) => occurrences.has(occurrence)),
    }));
}

function inferHandling(
  description: string,
  weeklySlots: MaintenanceWindowDefinition["weeklySlots"],
): MaintenanceWindowDefinition["handling"] {
  if (/nur\s+nach\s+rücksprache/iu.test(description)) return "approval-required";
  if (/laut\s+INF-VA\b/iu.test(description)) return "external";
  if (
    /00:00\s*[-–]\s*24:00/u.test(description)
    && weeklySlots.every((day) => day.every(Boolean))
  ) {
    return "always";
  }
  return "regular";
}

function isRangeAllowed(
  weeklySlots: MaintenanceWindowDefinition["weeklySlots"],
  weekday: MaintenanceWeekday,
  start: string,
  end: string,
): boolean | null {
  try {
    const startSlot = timeToSlot(start);
    const endSlot = timeToSlot(end, true);
    const allAllowed = (day: MaintenanceWeekday, from: number, to: number) => (
      weeklySlots[day].slice(from, to).every(Boolean)
    );

    if (start === end) return allAllowed(weekday, 0, SLOT_COUNT);
    if (endSlot > startSlot) return allAllowed(weekday, startSlot, endSlot);

    const nextWeekday = ((weekday + 1) % DAY_LABELS.length) as MaintenanceWeekday;
    return allAllowed(weekday, startSlot, SLOT_COUNT) && allAllowed(nextWeekday, 0, endSlot);
  } catch {
    return null;
  }
}

function descriptionConflictIssue(
  description: string,
  weeklySlots: MaintenanceWindowDefinition["weeklySlots"],
  block: number,
): MaintenanceImportIssue | null {
  for (const match of description.matchAll(WEEKDAY_TIME_PATTERN)) {
    const weekday = weekdayFromLabel(match[1]);
    if (weekday === null) continue;
    if (isRangeAllowed(weeklySlots, weekday, match[2], match[3]) === false) {
      return issue(
        "warning",
        "description-conflict",
        block,
        "Die beschriebene Wochentags-/Uhrzeitregel ist in der importierten Maske nicht vollständig erlaubt.",
        "description",
      );
    }
  }
  return null;
}

function cloneDefinition(definition: MaintenanceWindowDefinition): MaintenanceWindowDefinition {
  return {
    ...definition,
    weeklySlots: definition.weeklySlots.map((day) => [...day]) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: definition.calendarRules.map((rule) => ({
      weekday: rule.weekday,
      occurrences: [...rule.occurrences],
    })),
  };
}

function createEntry(
  cells: readonly string[],
  block: number,
  timestamp: string,
): ParsedMaintenanceEntry {
  const normalizedCells = cells.map((cell) => cell.trim());
  const issues = validateMaintenanceWindowBlock(normalizedCells, block);
  const weeklySlots = DAY_LABELS.map((_label, day) => {
    const mask = normalizedCells[day + 2];
    return mask.length === SLOT_COUNT && /^[01]+$/.test(mask)
      ? externalMaskToSlots(mask)
      : createEmptyDaySlots();
  }) as MaintenanceWindowDefinition["weeklySlots"];
  const description = normalizedCells[1];

  if (!issues.some((candidate) => candidate.code === "mask-length" || candidate.code === "mask-characters")) {
    const conflict = descriptionConflictIssue(description, weeklySlots, block);
    if (conflict) issues.push(conflict);
  }

  return {
    block,
    definition: {
      id: crypto.randomUUID(),
      abbreviation: normalizedCells[0],
      normalizedAbbreviation: normalizeMaintenanceAbbreviation(normalizedCells[0]),
      description,
      handling: inferHandling(description, weeklySlots),
      weeklySlots,
      calendarRules: inferCalendarRules(description),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    issues,
  };
}

function markDuplicateAbbreviations(entries: ParsedMaintenanceEntry[]): void {
  const byAbbreviation = new Map<string, ParsedMaintenanceEntry[]>();
  for (const entry of entries) {
    const matches = byAbbreviation.get(entry.definition.normalizedAbbreviation) ?? [];
    matches.push(entry);
    byAbbreviation.set(entry.definition.normalizedAbbreviation, matches);
  }

  for (const duplicates of byAbbreviation.values()) {
    if (duplicates.length < 2) continue;
    for (const entry of duplicates) {
      entry.issues.push(issue(
        "error",
        "duplicate-abbreviation",
        entry.block,
        `Die Abkürzung „${entry.definition.abbreviation}“ kommt im Import mehrfach vor.`,
        "abbreviation",
      ));
    }
  }
}

export function parseMaintenanceWindowText(text: string): MaintenanceImportParseResult {
  const timestamp = new Date().toISOString();
  const normalizedText = text.replace(/\r\n?/g, "\n");
  let lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
  if (hasKnownHeader(lines)) lines = lines.slice(CELLS_PER_BLOCK);

  const entries: ParsedMaintenanceEntry[] = [];
  const standaloneIssues: MaintenanceImportIssue[] = [];
  const completeCellCount = lines.length - (lines.length % CELLS_PER_BLOCK);

  for (let start = 0; start < completeCellCount; start += CELLS_PER_BLOCK) {
    entries.push(createEntry(
      lines.slice(start, start + CELLS_PER_BLOCK),
      start / CELLS_PER_BLOCK + 1,
      timestamp,
    ));
  }

  if (completeCellCount < lines.length) {
    const block = completeCellCount / CELLS_PER_BLOCK + 1;
    const remaining = lines.length - completeCellCount;
    standaloneIssues.push(issue(
      "error",
      "incomplete-block",
      block,
      `Block ${block} enthält ${remaining} statt ${CELLS_PER_BLOCK} Felder.`,
    ));
  }

  markDuplicateAbbreviations(entries);
  const allIssues = [...entries.flatMap((entry) => entry.issues), ...standaloneIssues];
  return {
    entries,
    errors: allIssues.filter((candidate) => candidate.severity === "error"),
    warnings: allIssues.filter((candidate) => candidate.severity === "warning"),
  };
}

function sameBusinessFields(
  left: MaintenanceWindowDefinition,
  right: MaintenanceWindowDefinition,
): boolean {
  return left.abbreviation === right.abbreviation
    && left.normalizedAbbreviation === right.normalizedAbbreviation
    && left.description === right.description
    && left.handling === right.handling
    && JSON.stringify(left.weeklySlots) === JSON.stringify(right.weeklySlots)
    && JSON.stringify(left.calendarRules) === JSON.stringify(right.calendarRules);
}

export function buildMaintenanceImportPreview(
  entries: readonly ParsedMaintenanceEntry[],
  existing: readonly MaintenanceWindowDefinition[],
): MaintenanceImportPreviewRow[] {
  const timestamp = new Date().toISOString();
  const existingByAbbreviation = new Map(existing.map((definition) => [
    normalizeMaintenanceAbbreviation(definition.normalizedAbbreviation),
    definition,
  ]));

  return entries.map((entry) => {
    const imported = cloneDefinition(entry.definition);
    const persisted = existingByAbbreviation.get(imported.normalizedAbbreviation);
    if (!persisted) {
      return {
        status: "new",
        definition: imported,
        issues: entry.issues.map((candidate) => ({ ...candidate })),
        sourceBlock: entry.block,
      };
    }

    if (sameBusinessFields(imported, persisted)) {
      return {
        status: "unchanged",
        definition: cloneDefinition(persisted),
        issues: entry.issues.map((candidate) => ({ ...candidate })),
        sourceBlock: entry.block,
      };
    }

    return {
      status: "update",
      definition: {
        ...imported,
        id: persisted.id,
        createdAt: persisted.createdAt,
        updatedAt: timestamp,
      },
      issues: entry.issues.map((candidate) => ({ ...candidate })),
      sourceBlock: entry.block,
    };
  });
}

import type {
  MaintenanceWeekday,
  MaintenanceWindowDefinition,
  MonthlyOccurrence,
  TechInfoLatest,
} from "@/domain/models/types";

export const DAY_LABELS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export const SLOT_COUNT = 48;

type WeeklySlots = MaintenanceWindowDefinition["weeklySlots"];

export interface KnownMaintenanceWindowAssignment {
  definition: MaintenanceWindowDefinition;
  systems: TechInfoLatest[];
}

export interface UnknownMaintenanceWindowAssignment {
  abbreviation: string;
  normalizedAbbreviation: string;
  systems: TechInfoLatest[];
}

export interface MaintenanceWindowAssignmentResult {
  known: KnownMaintenanceWindowAssignment[];
  unknown: UnknownMaintenanceWindowAssignment[];
}

export function createEmptyDaySlots(): boolean[] {
  return Array<boolean>(SLOT_COUNT).fill(false);
}

export function createEmptyWeeklySlots(): WeeklySlots {
  return [
    createEmptyDaySlots(),
    createEmptyDaySlots(),
    createEmptyDaySlots(),
    createEmptyDaySlots(),
    createEmptyDaySlots(),
    createEmptyDaySlots(),
    createEmptyDaySlots(),
  ];
}

export function assertWeeklySlots(
  weeklySlots: unknown,
): asserts weeklySlots is MaintenanceWindowDefinition["weeklySlots"] {
  if (!Array.isArray(weeklySlots) || weeklySlots.length !== 7) {
    throw new Error("Ungültiger Wochenplan: Es werden genau 7 Tage erwartet.");
  }

  for (const daySlots of weeklySlots) {
    if (!Array.isArray(daySlots) || daySlots.length !== SLOT_COUNT) {
      throw new Error(`Ungültiger Wochenplan: Jeder Tag muss genau ${SLOT_COUNT} Einträge enthalten.`);
    }
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      if (typeof daySlots[slot] !== "boolean") {
        throw new Error("Ungültiger Wochenplan: Alle Einträge müssen boolesche Werte sein.");
      }
    }
  }
}

export function normalizeMaintenanceAbbreviation(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

export function externalMaskToSlots(mask: string): boolean[] {
  if (mask.length !== SLOT_COUNT) {
    throw new Error(`Die externe Maske muss genau ${SLOT_COUNT} Zeichen lang sein.`);
  }
  if (!/^[01]+$/.test(mask)) {
    throw new Error("Die externe Maske darf nur 0 und 1 enthalten.");
  }

  return [...mask].map((value) => value === "0");
}

export function slotsToExternalMask(slots: readonly boolean[]): string {
  if (slots.length !== SLOT_COUNT) {
    throw new Error(`Ein Tag muss genau ${SLOT_COUNT} Einträge enthalten.`);
  }
  if (slots.some((slot) => typeof slot !== "boolean")) {
    throw new Error("Alle Zeiteinträge müssen boolesche Werte sein.");
  }

  return slots.map((allowed) => (allowed ? "0" : "1")).join("");
}

export function timeToSlot(value: string, isEndBoundary = false): number {
  if (value === "24:00") {
    if (isEndBoundary) return SLOT_COUNT;
    throw new Error("24:00 ist nur als Endgrenze zulässig.");
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Ungültige Uhrzeit „${value}“. Erwartet wird HH:MM.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Ungültige Uhrzeit „${value}“.`);
  }
  if (minutes !== 0 && minutes !== 30) {
    throw new Error("Wartungszeiten müssen auf halben Stunden liegen.");
  }

  return hours * 2 + minutes / 30;
}

export function applyTimeRange(
  weeklySlots: WeeklySlots,
  selectedWeekdays: readonly MaintenanceWeekday[],
  start: string,
  end: string,
  allowed: boolean,
): WeeklySlots {
  assertWeeklySlots(weeklySlots);
  if (!hasValidWeekdays(selectedWeekdays)) {
    throw new Error("Ungültiger Wochentag: Erwartet wird eine ganze Zahl zwischen 0 und 6.");
  }

  const result = weeklySlots.map((day) => [...day]) as WeeklySlots;
  const startSlot = timeToSlot(start);
  const endSlot = timeToSlot(end, true);

  const writeRange = (weekday: MaintenanceWeekday, from: number, to: number) => {
    for (let slot = from; slot < to; slot += 1) {
      result[weekday][slot] = allowed;
    }
  };

  for (const weekday of selectedWeekdays) {
    if (start === end) {
      writeRange(weekday, 0, SLOT_COUNT);
    } else if (endSlot > startSlot) {
      writeRange(weekday, startSlot, endSlot);
    } else {
      writeRange(weekday, startSlot, SLOT_COUNT);
      const nextWeekday = ((weekday + 1) % 7) as MaintenanceWeekday;
      writeRange(nextWeekday, 0, endSlot);
    }
  }

  return result;
}

function hasValidWeekdays(value: unknown): value is MaintenanceWeekday[] {
  if (!Array.isArray(value)) return false;

  for (let index = 0; index < value.length; index += 1) {
    const weekday = value[index];
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return false;
  }

  return true;
}

function formatSlot(slot: number): string {
  const minutes = slot * 30;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}

function summarizeDay(slots: readonly boolean[]): string {
  if (slots.every(Boolean)) return "ganztägig";
  if (slots.every((allowed) => !allowed)) return "gesperrt";

  const ranges: string[] = [];
  let start: number | null = null;
  for (let slot = 0; slot <= SLOT_COUNT; slot += 1) {
    const allowed = slot < SLOT_COUNT && slots[slot];
    if (allowed && start === null) start = slot;
    if (!allowed && start !== null) {
      ranges.push(`${formatSlot(start)}–${formatSlot(slot)}`);
      start = null;
    }
  }
  return ranges.join(", ");
}

export function summarizeWeeklySlots(weeklySlots: WeeklySlots): string {
  assertWeeklySlots(weeklySlots);
  const summaries = weeklySlots.map(summarizeDay);
  if (summaries.every((summary) => summary === "ganztägig")) return "Durchgehend erlaubt";
  if (summaries.every((summary) => summary === "gesperrt")) return "Durchgehend gesperrt";

  const groups: string[] = [];
  let firstDay = 0;
  for (let day = 1; day <= DAY_LABELS.length; day += 1) {
    if (day < DAY_LABELS.length && summaries[day] === summaries[firstDay]) continue;

    const dayLabel = firstDay === day - 1
      ? DAY_LABELS[firstDay]
      : `${DAY_LABELS[firstDay]}–${DAY_LABELS[day - 1]}`;
    groups.push(`${dayLabel}: ${summaries[firstDay]}`);
    firstDay = day;
  }

  return groups.join("; ");
}

/** Ungültige Datumswerte oder Laufzeit-Regeldaten werden sicherheitshalber nicht erlaubt. */
export function isDateAllowedByCalendarRules(
  date: Date,
  rules: readonly {
    weekday: MaintenanceWeekday;
    occurrences: readonly MonthlyOccurrence[];
  }[],
): boolean {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return false;
  if (!hasValidCalendarRules(rules)) return false;
  if (rules.length === 0) return true;

  const weekday = ((date.getDay() + 6) % 7) as MaintenanceWeekday;
  const occurrence = Math.ceil(date.getDate() / 7) as Exclude<MonthlyOccurrence, "last">;
  const nextSameWeekday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  const isLastOccurrence = nextSameWeekday.getMonth() !== date.getMonth();

  return rules.some((rule) =>
    rule.weekday === weekday
    && (rule.occurrences.includes(occurrence) || (isLastOccurrence && rule.occurrences.includes("last"))),
  );
}

function hasValidCalendarRules(value: unknown): value is MaintenanceWindowDefinition["calendarRules"] {
  if (!Array.isArray(value)) return false;

  for (let index = 0; index < value.length; index += 1) {
    if (!isValidCalendarRule(value[index])) return false;
  }

  return true;
}

function isValidCalendarRule(rule: unknown): rule is MaintenanceWindowDefinition["calendarRules"][number] {
  if (typeof rule !== "object" || rule === null) return false;

  const candidate = rule as { weekday?: unknown; occurrences?: unknown };
  if (
    !Number.isInteger(candidate.weekday)
    || (candidate.weekday as number) < 0
    || (candidate.weekday as number) > 6
    || !Array.isArray(candidate.occurrences)
  ) {
    return false;
  }

  for (let index = 0; index < candidate.occurrences.length; index += 1) {
    const occurrence = candidate.occurrences[index];
    if (
      occurrence !== "last"
      && (!Number.isInteger(occurrence) || (occurrence as number) < 1 || (occurrence as number) > 5)
    ) {
      return false;
    }
  }

  return true;
}

function sortSystems(systems: TechInfoLatest[]): void {
  systems.sort((left, right) => left.vmName.localeCompare(right.vmName, "de-DE", { numeric: true }));
}

export function assignMaintenanceWindows(
  definitions: readonly MaintenanceWindowDefinition[],
  systems: readonly TechInfoLatest[],
): MaintenanceWindowAssignmentResult {
  const known = definitions.map((definition) => ({ definition, systems: [] as TechInfoLatest[] }));
  const knownByAbbreviation = new Map(
    known.map((group) => [normalizeMaintenanceAbbreviation(group.definition.abbreviation), group]),
  );
  const unknownByAbbreviation = new Map<string, UnknownMaintenanceWindowAssignment>();

  for (const system of systems) {
    if (system.maintenanceWindow === null) continue;
    const abbreviation = system.maintenanceWindow.trim();
    if (!abbreviation) continue;

    const normalizedAbbreviation = normalizeMaintenanceAbbreviation(abbreviation);
    const knownGroup = knownByAbbreviation.get(normalizedAbbreviation);
    if (knownGroup) {
      knownGroup.systems.push(system);
      continue;
    }

    let unknownGroup = unknownByAbbreviation.get(normalizedAbbreviation);
    if (!unknownGroup) {
      unknownGroup = { abbreviation, normalizedAbbreviation, systems: [] };
      unknownByAbbreviation.set(normalizedAbbreviation, unknownGroup);
    }
    unknownGroup.systems.push(system);
  }

  for (const group of known) sortSystems(group.systems);
  const unknown = [...unknownByAbbreviation.values()];
  for (const group of unknown) sortSystems(group.systems);

  return { known, unknown };
}

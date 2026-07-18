import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import { isDateAllowedByCalendarRules } from "@/lib/maintenanceWindows";

export type CoverageView = "day" | "week" | "month";

export interface CoverageRange {
  start: Date; // lokale Mitternacht
  days: number;
}

export interface CoverageSlot {
  date: Date; // lokale Mitternacht des Tages dieses Slots
  slot: number; // 0..47
  count: number;
}

const SLOTS_PER_DAY = 48;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Montag = 0 ... Sonntag = 6, konsistent mit isDateAllowedByCalendarRules. */
export function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function formatSlotTime(slot: number): string {
  const startMinutes = slot * 30;
  const endMinutes = startMinutes + 30;
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(startMinutes)}–${format(endMinutes)}`;
}

export function getCoverageRange(view: CoverageView, referenceDate: Date): CoverageRange {
  const today = startOfDay(referenceDate);

  if (view === "day") return { start: today, days: 1 };

  if (view === "week") {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - mondayBasedWeekday(today));
    return { start: monday, days: 7 };
  }

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return { start: firstOfMonth, days: daysInMonth };
}

export function buildMaintenanceCoverage(
  known: readonly KnownMaintenanceWindowAssignment[],
  range: CoverageRange,
): CoverageSlot[] {
  const eligible = known.filter(
    (group) =>
      (group.definition.handling === "regular" || group.definition.handling === "always")
      && group.systems.length > 0,
  );

  const slots: CoverageSlot[] = [];
  for (let dayOffset = 0; dayOffset < range.days; dayOffset += 1) {
    const date = new Date(range.start);
    date.setDate(date.getDate() + dayOffset);
    const weekday = mondayBasedWeekday(date);

    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      let count = 0;
      for (const group of eligible) {
        if (group.definition.handling === "always") {
          count += group.systems.length;
          continue;
        }
        if (!isDateAllowedByCalendarRules(date, group.definition.calendarRules)) continue;
        if (group.definition.weeklySlots[weekday][slot]) count += group.systems.length;
      }
      slots.push({ date, slot, count });
    }
  }
  return slots;
}

export function findCurrentCoverageIndex(slots: readonly CoverageSlot[], now: Date): number | null {
  const day = startOfDay(now).getTime();
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30);
  const index = slots.findIndex((entry) => entry.date.getTime() === day && entry.slot === slot);
  return index === -1 ? null : index;
}

export function excludedSystemsCount(known: readonly KnownMaintenanceWindowAssignment[]): number {
  return known
    .filter((group) => group.definition.handling === "approval-required" || group.definition.handling === "external")
    .reduce((sum, group) => sum + group.systems.length, 0);
}

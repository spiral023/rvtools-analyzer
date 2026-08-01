/**
 * Gesetzliche Feiertage in Österreich.
 *
 * Bewusst lokal gerechnet statt über eine API: Die Regeln sind vollständig
 * deterministisch, die App läuft offline mit Kundendaten, und eine
 * Netzwerkabhängigkeit für eine unveränderliche Information brächte nur
 * Proxy-, Cache- und Fehlerbehandlungsaufwand.
 *
 * Verwendungszweck ist die Lastanalyse: An Feiertagen fehlt die Bürolast, was
 * die Business-Hours-Konzentration einer VM verwässert und sie fälschlich als
 * unregelmäßig erscheinen lässt. Feiertagsstunden werden deshalb aus der
 * Kalenderkonzentration herausgerechnet.
 */

/** Tage, die gesetzlich keine Feiertage sind, sich im Lastprofil aber wie welche verhalten. */
export type HolidayKind = "public" | "reduced";

export interface Holiday {
  /** Lokales Datum als `YYYY-MM-DD` in der Zeitzone Europe/Vienna. */
  date: string;
  name: string;
  kind: HolidayKind;
}

export interface HolidayRange {
  start: number;
  end: number;
  name: string;
}

/**
 * Osterdatum nach der anonymen gregorianischen Osterformel (Meeus/Jones/Butcher).
 * Liefert den Ostersonntag als lokales Kalenderdatum.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Verschiebt ein Kalenderdatum um Tage, ohne Zeitzonenbezug (reine Datumsarithmetik). */
function addDays(year: number, month: number, day: number, offset: number): string {
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return toDateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

const FIXED_HOLIDAYS: ReadonlyArray<{ month: number; day: number; name: string; kind: HolidayKind }> = [
  { month: 1, day: 1, name: "Neujahr", kind: "public" },
  { month: 1, day: 6, name: "Heilige Drei Könige", kind: "public" },
  { month: 5, day: 1, name: "Staatsfeiertag", kind: "public" },
  { month: 8, day: 15, name: "Mariä Himmelfahrt", kind: "public" },
  { month: 10, day: 26, name: "Nationalfeiertag", kind: "public" },
  { month: 11, day: 1, name: "Allerheiligen", kind: "public" },
  { month: 12, day: 8, name: "Mariä Empfängnis", kind: "public" },
  { month: 12, day: 25, name: "Christtag", kind: "public" },
  { month: 12, day: 26, name: "Stefanitag", kind: "public" },
  // Karfreitag ist seit 2019 kein allgemeiner Feiertag mehr und fehlt deshalb hier.
  { month: 12, day: 24, name: "Heiliger Abend", kind: "reduced" },
  { month: 12, day: 31, name: "Silvester", kind: "reduced" },
];

/** An Ostern gekoppelte Feiertage als Tagesversatz zum Ostersonntag. */
const EASTER_OFFSETS: ReadonlyArray<{ offset: number; name: string }> = [
  { offset: 1, name: "Ostermontag" },
  { offset: 39, name: "Christi Himmelfahrt" },
  { offset: 50, name: "Pfingstmontag" },
  { offset: 60, name: "Fronleichnam" },
];

/** Alle österreichischen Feiertage eines Kalenderjahres, aufsteigend nach Datum. */
export function austrianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    ...FIXED_HOLIDAYS.map((entry) => ({
      date: toDateKey(year, entry.month, entry.day),
      name: entry.name,
      kind: entry.kind,
    })),
    ...EASTER_OFFSETS.map((entry) => ({
      date: addDays(year, easter.month, easter.day, entry.offset),
      name: entry.name,
      kind: "public" as const,
    })),
  ];
  return holidays.sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Feiertage im geschlossenen Datumsbereich `[startDate, endDate]`; beide Grenzen
 * als lokales `YYYY-MM-DD`. Deckt Jahreswechsel innerhalb des Bereichs ab.
 */
export function austrianHolidaysInRange(startDate: string, endDate: string): Holiday[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) return [];
  const holidays: Holiday[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    holidays.push(...austrianHolidays(year).filter((holiday) => holiday.date >= startDate && holiday.date <= endDate));
  }
  return holidays;
}

/**
 * Baut aus stündlichen Messpunkten zusammenhängende Flächen für gesetzliche
 * Feiertage. Lastarme Sondertage bleiben in der Profilanalyse, werden im Chart
 * aber nicht als gesetzlicher Feiertag ausgegeben.
 */
export function findAustrianPublicHolidayRanges(timestamps: readonly number[]): HolidayRange[] {
  const years = [...new Set(timestamps.map((timestamp) => new Date(timestamp).getFullYear()))];
  const holidayByDate = new Map(
    years.flatMap((year) => austrianHolidays(year))
      .filter((holiday) => holiday.kind === "public")
      .map((holiday) => [holiday.date, holiday.name]),
  );
  const ranges: HolidayRange[] = [];
  for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    const key = toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const name = holidayByDate.get(key);
    if (!name) continue;
    const last = ranges.at(-1);
    if (last && last.name === name && timestamp - last.end <= 60 * 60 * 1_000) last.end = timestamp;
    else ranges.push({ start: timestamp, end: timestamp, name });
  }
  return ranges;
}

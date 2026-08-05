/**
 * Tag-zuerst mit Punkttrennern (`04.08.2026 20:37:23`) – so schreibt RVTools Zeitstempel auf
 * deutschsprachigen Systemen. `new Date()` liest genau dieses Format als Monat-zuerst und macht aus
 * dem 4. August den 8. April; Alters- und Frischeangaben liegen damit um Monate daneben.
 */
const DAY_FIRST = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Liest einen RVTools-Zeitstempel als lokale Zeit. Punktgetrennte Datumsangaben werden immer
 * tag-zuerst gelesen; alle übrigen Schreibweisen übernimmt der Standard-Parser des Browsers
 * (ISO mit `T` oder Leerzeichen, US-Format mit Schrägstrichen). Liefert `null`, wenn der Wert leer
 * oder kein gültiges Datum ist.
 */
export function parseRvtoolsTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) {
    const [, day, month, year, hour, minute, second] = dayFirst;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour ?? 0),
      Number(minute ?? 0),
      Number(second ?? 0),
    );
    // Ein überlaufender Tag (etwa 31.02.) würde sonst stillschweigend in den Folgemonat rutschen.
    return date.getDate() === Number(day) && date.getMonth() === Number(month) - 1 ? date : null;
  }

  // Safari akzeptiert `2026-08-04 20:37:23` nicht, wohl aber die ISO-Form mit `T`.
  const isoCandidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(" ", "T")
    : trimmed;
  const parsed = new Date(isoCandidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Vollständige Tage zwischen einem RVTools-Zeitstempel und `now`; `null`, wenn nicht lesbar. */
export function rvtoolsTimestampAgeInDays(value: string, now: number): number | null {
  const date = parseRvtoolsTimestamp(value);
  if (!date) return null;
  // Zeitstempel leicht in der Zukunft (Zeitzonen- oder Uhrenversatz) sind 0 Tage alt, nicht negativ.
  return Math.max(0, Math.floor((now - date.getTime()) / 86_400_000));
}

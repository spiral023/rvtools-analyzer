export interface OrgPath {
  /** Roh-Organisationskennung, unverändert wie in der Tech-Info hinterlegt, z.B. "RAITEC/IN-VIA". */
  raw: string;
  org: string | null;
  bereich: string | null;
  abteilung: string | null;
  /** false, wenn sich aus dem Rohwert kein Bereich extrahieren ließ. */
  valid: boolean;
}

/**
 * Zerlegt eine Organisationskennung wie "RAITEC/IN-VIA" in Organisation, Bereich
 * und Abteilung. Format: "<Org>/<Bereich>-<Abteilung>", wobei Organisation und
 * Abteilung optional sind. Nicht interpretierbare Rohwerte liefern valid: false.
 */
export function parseOrgPath(raw: string | null): OrgPath | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const slashIndex = trimmed.indexOf("/");
  const org = slashIndex >= 0 ? trimmed.slice(0, slashIndex).trim() || null : null;
  const rest = (slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed).trim();

  if (!rest) return { raw: trimmed, org, bereich: null, abteilung: null, valid: false };

  const dashIndex = rest.indexOf("-");
  const bereich = (dashIndex >= 0 ? rest.slice(0, dashIndex) : rest).trim() || null;
  const abteilung = dashIndex >= 0 ? rest.slice(dashIndex + 1).trim() || null : null;

  return { raw: trimmed, org, bereich, abteilung, valid: bereich !== null };
}

export interface AnalysisErrorEnvironment {
  pathname: string;
  search: string;
  href: string;
  userAgent: string;
  language: string;
  online: boolean;
  viewport: string;
  appVersion: string;
  buildTime: string;
  occurredAt?: string;
}

export interface AnalysisErrorReport {
  id: string;
  area: string;
  category: string;
  title: string;
  summary: string;
  nextStep: string;
  errorName: string;
  message: string;
  stack: string | null;
  copyText: string;
  isLazyImportFailure: boolean;
}

interface RouteErrorLike {
  status: number;
  statusText?: string;
  data?: unknown;
}

const ROUTE_AREAS: ReadonlyArray<readonly [string, string]> = [
  ["/overview", "Übersicht"],
  ["/upload", "Uploads"],
  ["/clusters", "Cluster-Analyse"],
  ["/hosts", "Host-Analyse"],
  ["/vms", "VM-Analyse"],
  ["/hardware", "Hardware-Analyse"],
  ["/tech-info", "Technische Informationen"],
  ["/storage-backup", "Storage & Backup"],
  ["/network", "Netzwerk-Analyse"],
  ["/planning", "Planung"],
  ["/exports", "Analyse-Export"],
  ["/settings", "Einstellungen"],
];

const LAZY_IMPORT_PATTERN = /failed to fetch dynamically imported module|importing a module script failed|expected a javascript-or-wasm module script/i;
const CHART_AXIS_PATTERN = /could not find .*axis|axis.*(?:id|identifier)|invariant.*axis/i;
const STORAGE_PATTERN = /indexeddb|idb|database|transaction|quota|object store/i;

function isRouteErrorLike(error: unknown): error is RouteErrorLike {
  return Boolean(error && typeof error === "object" && typeof (error as RouteErrorLike).status === "number");
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function errorArea(pathname: string): string {
  return ROUTE_AREAS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Unbekannter Analysebereich";
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 8);
}

function errorParts(error: unknown): { errorName: string; message: string; stack: string | null; routeData: string } {
  if (isRouteErrorLike(error)) {
    return {
      errorName: `HTTP ${error.status}`,
      message: error.statusText || `Route antwortete mit Status ${error.status}`,
      stack: null,
      routeData: stringifyUnknown(error.data),
    };
  }
  if (error instanceof Error) {
    const errorCause = (error as Error & { cause?: unknown }).cause;
    const cause = errorCause ? `\n\nUrsache:\n${stringifyUnknown(errorCause)}` : "";
    return {
      errorName: error.name || "Error",
      message: error.message || "Fehler ohne Meldung",
      stack: error.stack ? `${error.stack}${cause}` : cause.trim() || null,
      routeData: "",
    };
  }
  return {
    errorName: typeof error === "string" ? "Error" : "Unbekannter Fehler",
    message: stringifyUnknown(error) || "Die Anwendung hat keinen technischen Fehlertext geliefert.",
    stack: null,
    routeData: "",
  };
}

function classifyError(error: unknown, message: string) {
  if (isRouteErrorLike(error)) {
    if (error.status === 404) return {
      category: "Navigation",
      title: "Analyseansicht nicht gefunden",
      summary: "Die aufgerufene Adresse gehört zu keiner verfügbaren Analyseansicht.",
      nextStep: "Prüfe die Adresse oder wechsle zurück zur Übersicht.",
    };
    return {
      category: "Navigation",
      title: "Analyseansicht konnte nicht geöffnet werden",
      summary: `Der Router hat die Ansicht mit Status ${error.status} abgebrochen.`,
      nextStep: "Lade die Ansicht erneut. Bleibt der Fehler bestehen, kopiere die Analysedetails.",
    };
  }
  if (LAZY_IMPORT_PATTERN.test(message)) return {
    category: "Anwendungsupdate",
    title: "Neue Anwendungsversion wird geladen",
    summary: "Ein veralteter Browser-Cache verweist auf eine nicht mehr vorhandene Programmdatei.",
    nextStep: "Die Anwendung aktualisiert Cache und Service Worker automatisch. Falls die Seite stehen bleibt, lade sie neu.",
  };
  if (CHART_AXIS_PATTERN.test(message)) return {
    category: "Diagrammdarstellung",
    title: "Diagramm konnte nicht aufgebaut werden",
    summary: "Eine Messreihe konnte keiner gültigen Diagrammachse zugeordnet werden. Die importierten Analysedaten bleiben unverändert.",
    nextStep: "Kopiere die Analysedetails. Wechsle danach zurück zur Übersicht und öffne die Ansicht erneut.",
  };
  if (STORAGE_PATTERN.test(message)) return {
    category: "Lokaler Datenspeicher",
    title: "Analysedaten konnten nicht gelesen werden",
    summary: "Der Browser konnte eine lokale Abfrage auf die importierten Daten nicht abschließen.",
    nextStep: "Lade die Seite neu. Lösche keine Browserdaten, bevor du die Analysedetails geprüft hast.",
  };
  return {
    category: "Datenverarbeitung",
    title: "Analyseansicht wurde abgebrochen",
    summary: "Beim Aufbereiten oder Darstellen der lokalen Analysedaten ist ein Laufzeitfehler aufgetreten. Die Quelldaten wurden nicht verändert.",
    nextStep: "Kopiere die Analysedetails und lade die Ansicht anschließend neu.",
  };
}

export function buildAnalysisErrorReport(error: unknown, environment: AnalysisErrorEnvironment): AnalysisErrorReport {
  const occurredAt = environment.occurredAt ?? new Date().toISOString();
  const area = errorArea(environment.pathname);
  const { errorName, message, stack, routeData } = errorParts(error);
  const classification = classifyError(error, message);
  const isLazyImportFailure = LAZY_IMPORT_PATTERN.test(message);
  const id = `RVA-${shortHash(`${occurredAt}\n${environment.pathname}\n${errorName}\n${message}`)}`;
  const copyText = [
    "# RVTools Analyzer – Fehlerbericht",
    "",
    `Fehler-ID: ${id}`,
    `Zeitpunkt: ${occurredAt}`,
    `Analysebereich: ${area}`,
    `Adresse: ${environment.pathname}${environment.search}`,
    `Vollständige URL: ${environment.href}`,
    `Kategorie: ${classification.category}`,
    `Fehlertyp: ${errorName}`,
    `Meldung: ${message}`,
    `App-Version: ${environment.appVersion}`,
    `Build: ${environment.buildTime}`,
    `Online: ${environment.online ? "ja" : "nein"}`,
    `Sprache: ${environment.language || "unbekannt"}`,
    `Viewport: ${environment.viewport}`,
    `Browser: ${environment.userAgent || "unbekannt"}`,
    routeData ? `Route-Daten: ${routeData}` : "",
    "",
    "## Stacktrace",
    stack || "Kein Stacktrace verfügbar.",
  ].filter(Boolean).join("\n");

  return { id, area, errorName, message, stack, copyText, isLazyImportFailure, ...classification };
}

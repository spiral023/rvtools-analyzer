export interface ParsedSwitchInterface {
  interface: string;
  description: string;
  status: string;
  mode: string;
  duplex: string;
  speed: string;
  transceiver: string;
}

export interface ParsedSwitchSection {
  hostname: string;
  command: string;
  filter: string;
  interfaces: ParsedSwitchInterface[];
}

export interface ParsedSwitchFile {
  switches: Map<string, ParsedSwitchSection[]>;
  totalInterfaceCount: number;
  warnings: string[];
}

const PROMPT_REGEX = /^([A-Za-z0-9][A-Za-z0-9._-]*)#\s+((?:sh int statu|show interface status)\s*\|\s*(?:in|include)\s+(?:connected|notconnect|notconnec))\s*$/;
const PROMPT_DETECT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*#\s+(?:sh int statu|show interface status)\s*\|\s*(?:in|include)\s+(?:connected|notconnect|notconnec)\s*$/m;
const LOOSE_PROMPT_REGEX = /\b(?:sh|show)\s+int\w*\s+stat\w*/i;
const INTERFACE_LINE_REGEX = /^(\S+)\s+(.+?)\s+(connected|notconnec|notconnect)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/;
const FILTER_REGEX = /(connected|notconnect|notconnec)\s*$/;
const MAX_SNIPPET_LENGTH = 100;

function snippet(line: string): string {
  return line.length > MAX_SNIPPET_LENGTH ? `${line.slice(0, MAX_SNIPPET_LENGTH)}…` : line;
}

/** Erkennt, ob ein Textinhalt eine Cisco-Switch-CLI-Ausgabe (`show interface status`) ist. */
export function isSwitchTxtContent(text: string): boolean {
  return PROMPT_DETECT_REGEX.test(text);
}

/**
 * Sucht die erste Zeile, die wie ein "show interface status"-Befehl aussieht (z. B.
 * andere Abkürzung, anderes Prompt-Zeichen wie `>` statt `#`), aber nicht exakt auf
 * `PROMPT_REGEX` passt — hilft, Formatabweichungen zu lokalisieren, wenn
 * `isSwitchTxtContent` insgesamt `false` liefert.
 */
export function findLikelyPromptMismatch(text: string): { lineNumber: number; content: string } | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || PROMPT_REGEX.test(line)) continue;
    if (LOOSE_PROMPT_REGEX.test(line)) {
      return { lineNumber: i + 1, content: snippet(line) };
    }
  }
  return null;
}

function extractFilter(command: string): string {
  return command.match(FILTER_REGEX)?.[1] ?? "";
}

/** `--` wird zu leerem String; ab `(` abgeschnittene Beschreibungen werden gekürzt. */
function cleanDescription(raw: string): string {
  if (raw === "--") return "";
  const parenIndex = raw.indexOf("(");
  return (parenIndex >= 0 ? raw.slice(0, parenIndex) : raw).trim();
}

/**
 * Parst eine Cisco-NX-OS-CLI-Textausgabe (`show interface status`, gefiltert nach
 * `connected`/`notconnec`) in Abschnitte pro Switch+Abfrage. Abschnitte mit gleichem
 * Hostname werden in der Map zusammengeführt; Zeilen vor dem ersten Prompt sowie
 * unbekannte Zeilenformate innerhalb eines Abschnitts werden übersprungen und als
 * Warning ausgewiesen.
 */
export function parseSwitchTxt(text: string): ParsedSwitchFile {
  const switches = new Map<string, ParsedSwitchSection[]>();
  const warnings: string[] = [];
  let totalInterfaceCount = 0;
  let currentSection: ParsedSwitchSection | null = null;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const promptMatch = line.match(PROMPT_REGEX);
    if (promptMatch) {
      const [, hostname, command] = promptMatch;
      currentSection = { hostname, command, filter: extractFilter(command), interfaces: [] };
      const sections = switches.get(hostname);
      if (sections) sections.push(currentSection);
      else switches.set(hostname, [currentSection]);
      continue;
    }

    if (!currentSection) {
      warnings.push(`Switch-Zeile ${i + 1}: Kein Prompt erkannt (vor dem ersten Abschnitt), Zeile wurde übersprungen: "${snippet(line)}"`);
      continue;
    }

    const ifaceMatch = line.match(INTERFACE_LINE_REGEX);
    if (!ifaceMatch) {
      warnings.push(`Switch-Zeile ${i + 1}: Unbekanntes Zeilenformat, Zeile wurde übersprungen: "${snippet(line)}"`);
      continue;
    }

    const [, interfaceName, rawDescription, status, mode, duplex, speed, transceiver] = ifaceMatch;
    currentSection.interfaces.push({
      interface: interfaceName,
      description: cleanDescription(rawDescription),
      status,
      mode,
      duplex,
      speed,
      transceiver,
    });
    totalInterfaceCount++;
  }

  return { switches, totalInterfaceCount, warnings };
}

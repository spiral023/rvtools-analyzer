/**
 * Inkrementeller RFC-4180-Splitter.
 *
 * Ersetzt den zeichenweise konkatenierenden Automaten aus dem vROps-Parser
 * durch dieselbe Zustandslogik auf `slice()`-Basis. Zwei Eigenschaften sind
 * dabei bewusst gewählt:
 *
 * - **Ein Automat für alles.** Der Vollstring-Parser ist nur ein `push()` plus
 *   `finish()`, es gibt keinen zweiten "schnellen" Pfad, der von der
 *   RFC-4180-Semantik abweichen könnte.
 * - **Chunk-fähig.** Records werden per Callback emittiert, sodass ein
 *   Datei-Stream verarbeitet werden kann, ohne den Inhalt zu materialisieren.
 */

export type CsvSplitterIssueCode =
  | "invalid-character-after-quote"
  | "unexpected-quote"
  | "unclosed-quote";

export interface CsvSplitterIssue {
  code: CsvSplitterIssueCode;
  /** 1-basierte Zeilennummer der Quelldatei. */
  line: number;
}

export interface IncrementalCsvSplitterOptions {
  /** Wird je vollständigem Record aufgerufen; `line` ist die Startzeile des Records. */
  onRecord: (values: string[], line: number) => void;
  onIssue?: (issue: CsvSplitterIssue) => void;
}

export class IncrementalCsvSplitter {
  private readonly onRecord: IncrementalCsvSplitterOptions["onRecord"];
  private readonly onIssue: (issue: CsvSplitterIssue) => void;

  /** Bereits gesicherter Feldinhalt; bleibt leer, solange ein Feld in einem Chunk zusammenhängt. */
  private field = "";
  private values: string[] = [];
  private quoted = false;
  private afterQuote = false;
  private line = 1;
  private recordLine = 1;
  /** Ein `"` am Chunkende: ob es escaped ist, entscheidet erst das nächste Zeichen. */
  private pendingQuoteInQuoted = false;
  /** Ein `\r` am Chunkende: ein direkt folgendes `\n` gehört noch zum selben Umbruch. */
  private skipLeadingLineFeed = false;
  private aborted = false;

  constructor(options: IncrementalCsvSplitterOptions) {
    this.onRecord = options.onRecord;
    this.onIssue = options.onIssue ?? (() => {});
  }

  push(chunk: string): void {
    if (this.aborted || chunk.length === 0) return;
    let index = 0;

    if (this.skipLeadingLineFeed) {
      this.skipLeadingLineFeed = false;
      if (chunk[0] === "\n") index = 1;
    }
    if (this.pendingQuoteInQuoted) {
      this.pendingQuoteInQuoted = false;
      if (chunk[index] === '"') {
        // Escaptes Quote über die Chunkgrenze hinweg.
        this.field += '"';
        index += 1;
      } else {
        this.quoted = false;
        this.afterQuote = true;
      }
    }

    // Startindex des noch nicht gesicherten Feldbereichs im aktuellen Chunk.
    let pendingStart = index;

    for (; index < chunk.length; index += 1) {
      const char = chunk[index];

      if (this.quoted) {
        if (char === '"') {
          this.field += chunk.slice(pendingStart, index);
          if (index + 1 === chunk.length) {
            this.pendingQuoteInQuoted = true;
            pendingStart = chunk.length;
            break;
          }
          if (chunk[index + 1] === '"') {
            this.field += '"';
            index += 1;
            pendingStart = index + 1;
          } else {
            this.quoted = false;
            this.afterQuote = true;
            pendingStart = index + 1;
          }
        } else if (char === "\n") {
          this.line += 1;
        }
        continue;
      }

      if (this.afterQuote) {
        if (char === ",") {
          this.values.push(this.field);
          this.field = "";
          this.afterQuote = false;
          pendingStart = index + 1;
        } else if (char === "\r" || char === "\n") {
          if (char === "\r") {
            if (index + 1 === chunk.length) this.skipLeadingLineFeed = true;
            else if (chunk[index + 1] === "\n") index += 1;
          }
          this.finishRecord();
          this.line += 1;
          pendingStart = index + 1;
        } else {
          this.onIssue({ code: "invalid-character-after-quote", line: this.line });
          this.afterQuote = false;
          // Das Zeichen gehört laut bestehender Semantik noch zum Feld.
          pendingStart = index;
        }
        continue;
      }

      if (char === '"') {
        const hasContent = this.field.length > 0 || index > pendingStart;
        if (hasContent) {
          this.field += chunk.slice(pendingStart, index);
          this.onIssue({ code: "unexpected-quote", line: this.line });
        }
        this.quoted = true;
        pendingStart = index + 1;
      } else if (char === ",") {
        this.field += chunk.slice(pendingStart, index);
        this.values.push(this.field);
        this.field = "";
        pendingStart = index + 1;
      } else if (char === "\r" || char === "\n") {
        this.field += chunk.slice(pendingStart, index);
        if (char === "\r") {
          if (index + 1 === chunk.length) this.skipLeadingLineFeed = true;
          else if (chunk[index + 1] === "\n") index += 1;
        }
        this.finishRecord();
        this.line += 1;
        pendingStart = index + 1;
      }
    }

    if (pendingStart < chunk.length) this.field += chunk.slice(pendingStart);
  }

  /** Schließt den letzten Record ab und meldet ein unbalanciertes Quote. */
  finish(): void {
    if (this.aborted) return;
    if (this.pendingQuoteInQuoted) {
      this.pendingQuoteInQuoted = false;
      this.quoted = false;
      this.afterQuote = true;
    }
    if (this.quoted) {
      this.onIssue({ code: "unclosed-quote", line: this.recordLine });
      this.aborted = true;
      return;
    }
    if (this.field || this.values.length > 0 || this.afterQuote) this.finishRecord();
  }

  private finishRecord(): void {
    this.values.push(this.field);
    this.onRecord(this.values, this.recordLine);
    this.values = [];
    this.field = "";
    this.afterQuote = false;
    this.recordLine = this.line + 1;
  }
}

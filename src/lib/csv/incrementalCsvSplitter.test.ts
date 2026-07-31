import { describe, expect, it } from "vitest";
import { IncrementalCsvSplitter, type CsvSplitterIssue } from "@/lib/csv/incrementalCsvSplitter";

interface SplitResult {
  records: Array<{ values: string[]; line: number }>;
  issues: CsvSplitterIssue[];
}

/** Zerlegt `input` in Chunks fester Größe; `size = 0` bedeutet "ein Stück". */
function split(input: string, size = 0): SplitResult {
  const records: SplitResult["records"] = [];
  const issues: CsvSplitterIssue[] = [];
  const splitter = new IncrementalCsvSplitter({
    onRecord: (values, line) => records.push({ values, line }),
    onIssue: (issue) => issues.push(issue),
  });
  if (size <= 0) {
    splitter.push(input);
  } else {
    for (let index = 0; index < input.length; index += size) {
      splitter.push(input.slice(index, index + size));
    }
  }
  splitter.finish();
  return { records, issues };
}

describe("IncrementalCsvSplitter", () => {
  it("zerlegt gequotete Felder inklusive Komma und behält die Startzeile je Record", () => {
    const { records, issues } = split('"Name","Wert"\r\n"server, alpha","1,546.6"\r\n"b","2"');

    expect(issues).toEqual([]);
    expect(records).toEqual([
      { values: ["Name", "Wert"], line: 1 },
      { values: ["server, alpha", "1,546.6"], line: 2 },
      { values: ["b", "2"], line: 3 },
    ]);
  });

  it("behandelt ungequotete Felder, leere Felder und LF-Zeilenenden", () => {
    const { records, issues } = split("a,,c\nd,e,f\n");

    expect(issues).toEqual([]);
    expect(records).toEqual([
      { values: ["a", "", "c"], line: 1 },
      { values: ["d", "e", "f"], line: 2 },
    ]);
  });

  it("löst escapte Quotes und Zeilenumbrüche innerhalb eines Feldes auf", () => {
    const { records, issues } = split('"er sagte ""hallo""","zeile1\nzeile2"\r\n"x","y"');

    expect(issues).toEqual([]);
    expect(records[0].values).toEqual(['er sagte "hallo"', "zeile1\nzeile2"]);
    // Der eingebettete Umbruch verschiebt die Startzeile des Folgerecords.
    expect(records[1]).toEqual({ values: ["x", "y"], line: 3 });
  });

  it("meldet ein nicht geschlossenes Quote und verwirft den angebrochenen Record", () => {
    const { records, issues } = split('"a","b"\r\n"unvollstaendig');

    expect(issues).toEqual([{ code: "unclosed-quote", line: 2 }]);
    expect(records).toEqual([{ values: ["a", "b"], line: 1 }]);
  });

  it("meldet unerwartete und falsch platzierte Quotes wie der bisherige Automat", () => {
    expect(split('ab"c"\n').issues).toEqual([{ code: "unexpected-quote", line: 1 }]);
    expect(split('"a"x,"b"\n').issues).toEqual([{ code: "invalid-character-after-quote", line: 1 }]);
  });

  it("liefert für jede Chunk-Aufteilung dasselbe Ergebnis wie die Verarbeitung am Stück", () => {
    const inputs = [
      '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg"\r\n"servername9901","12:00 AM 21 July 2026","1,546.6"\r\n',
      '"er sagte ""hallo""","zeile1\nzeile2"\r\n"x","y"',
      "a,,c\nd,e,f\n",
      '"a","b"\r\n"c","d"',
      'ab"c"\n"a"x,"b"\n',
    ];

    for (const input of inputs) {
      const reference = split(input);
      for (let size = 1; size <= input.length; size += 1) {
        expect(split(input, size), `Chunkgröße ${size} für ${JSON.stringify(input)}`).toEqual(reference);
      }
    }
  });

  it("trennt \\r\\n korrekt, wenn der Umbruch auf zwei Chunks fällt", () => {
    const records: string[][] = [];
    const splitter = new IncrementalCsvSplitter({ onRecord: (values) => records.push(values) });
    splitter.push('"a","b"\r');
    splitter.push('\n"c","d"');
    splitter.finish();

    expect(records).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("erkennt ein escaptes Quote, das auf zwei Chunks fällt", () => {
    const records: string[][] = [];
    const splitter = new IncrementalCsvSplitter({ onRecord: (values) => records.push(values) });
    splitter.push('"er sagte ""');
    splitter.push('hallo"""');
    splitter.finish();

    expect(records).toEqual([['er sagte "hallo"']]);
  });
});

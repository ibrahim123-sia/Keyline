import { describe, expect, it } from "vitest";
import { CsvError, detectDelimiter, parseCsv, toCsv } from "@/lib/csv";

describe("CSV parsing (RFC 4180)", () => {
  it("reads plain rows and ignores a trailing line break", () => {
    expect(parseCsv("a,b,c\r\n1,2,3\r\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quotes, doubled quotes, separators and line breaks inside quotes", () => {
    const text = 'title,notes\n"Villa, sea view","He said ""wow""\nand left"\n"",x\n';
    expect(parseCsv(text)).toEqual([
      ["title", "notes"],
      ["Villa, sea view", 'He said "wow"\nand left'],
      ["", "x"],
    ]);
  });

  it("accepts LF, CR and CRLF line ends, a BOM, blank lines and a missing last line break", () => {
    expect(parseCsv("﻿a,b\r1,2\n\n3,4\r\n5,6")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  it("keeps empty cells, including trailing ones", () => {
    expect(parseCsv("a,,c,\n,,,\n")).toEqual([
      ["a", "", "c", ""],
      ["", "", "", ""],
    ]);
  });

  it("detects semicolon and tab files (Excel in many locales)", () => {
    expect(detectDelimiter('title;price\n"A; B";1')).toBe(";");
    expect(detectDelimiter("title\tprice")).toBe("\t");
    expect(detectDelimiter("title")).toBe(",");
    expect(parseCsv('title;price\n"A; B";1,5\n')).toEqual([
      ["title", "price"],
      ["A; B", "1,5"],
    ]);
  });

  it("says which line has a quote that never closes", () => {
    expect(() => parseCsv('a,b\n1,"open\n2,3\n')).toThrow(CsvError);
    try {
      parseCsv('a,b\n1,"open\n2,3\n');
    } catch (err) {
      expect((err as CsvError).line).toBe(2);
      expect((err as CsvError).message).toBe("Line 2 has a quote that never closes.");
    }
  });
});

describe("CSV writing", () => {
  it("quotes only what needs it, writes CRLF and an optional BOM", () => {
    const text = toCsv(
      [
        ["plain", "with, comma", 'with "quote"', "two\nlines", " padded ", "semi;colon"],
        [1250000, 2.5, true, false, null, undefined],
      ],
      { bom: true },
    );
    expect(text).toBe(
      '﻿plain,"with, comma","with ""quote""","two\nlines"," padded ","semi;colon"\r\n' +
        "1250000,2.5,yes,no,,\r\n",
    );
  });

  it("guards text a spreadsheet would run as a formula, and reads it back unchanged", () => {
    const risky = ["=SUM(A1,B1)", "+44 20 7946 0000", "-2 levels", "@cmd", "=1+1"];
    const text = toCsv([risky]);
    expect(text).toContain("'=1+1");
    expect(text.split(",")[0]).toBe("\"'=SUM(A1");
    expect(parseCsv(text)).toEqual([risky]);
    // Numbers are numbers, not text: no guard for a negative value.
    expect(toCsv([[-5]])).toBe("-5\r\n");
  });

  it("round-trips anything", () => {
    const rows = [
      ["a", 'b"c', "d,e", "f\r\ng", "", "'kept", "=x"],
      ["Ünïcödé ✓", "tab\there", "end"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

import { inferSchema, initParser } from "udsv";
import { formatVal, range } from "./util";

/**
 * One row of numeric CSV data.
 *
 * Wraps a mapping from column name to numeric value (or null) and exposes helpers.
 */
export class Row {
  private readonly data: Record<string, number | null>;

  constructor(data: Record<string, number | null>) {
    this.data = data;
  }

  /** Get the value for a given column, or null if missing. */
  value(column: string): number | null {
    return this.data[column] ?? null;
  }

  /** Whether the given column is null / missing in this row. */
  isNull(column: string): boolean {
    return this.data[column] == null;
  }

  /** All column/value pairs for this row. */
  entries(): [string, number | null][] {
    return Object.entries(this.data);
  }
}

/** Metadata and basic stats for a single CSV column. */
export class Col {
  constructor(
    /** Column header name. */
    public readonly name: string,
    /** Minimum non-null value in this column, or null if all values are null. */
    public readonly min: number | null,
    /** Maximum non-null value in this column, or null if all values are null. */
    public readonly max: number | null,
    /** Number of null (empty / invalid) cells in this column. */
    public readonly nulls: number,
  ) {}

  /** Whether this column has any non-null data. */
  hasData(): boolean {
    return this.min != null && this.max != null;
  }

  /** Range of the data in this column (max - min), or null if not applicable. */
  range(): number | null {
    return this.hasData() ? this.max! - this.min! : null;
  }

  /** Range is non-empty (there is more than one unique value). */
  hasRange(): boolean {
    return this.hasData() ? this.max! > this.min! : false;
  }

  /** Physical quantity, e.g. \"Time\", \"Rel-Vel\", \"Alt\", \"Mach\". */
  kind(): string {
    const { kind } = this.#parseName();
    return kind;
  }

  /** Unit string, e.g. \"sec\", \"ft/sec\", \"ft\"; undefined for dimensionless columns. */
  unit(): string | undefined {
    const { unit } = this.#parseName();
    return unit;
  }

  format(v: number | undefined): string {
    return formatVal(v);
  }

  #parseName(): { kind: string; unit?: string } {
    // Matches: "Time (sec)" -> kind="Time", unit="sec"; "Mach" -> kind="Mach", unit=undefined
    const m = /^([^()]+?)(?:\s*\(([^()]+)\))?$/.exec(this.name);
    if (!m) {
      return { kind: this.name };
    }
    const kind = m[1].trim();
    const unit = m[2]?.trim();
    return { kind, unit };
  }
}

/**
 * Problem severity.
 */
export type Severity = "error" | "warning";

/**
 * A single problems discovered when opening a file.
 */
export interface Problem {
  message: string;
  severity: Severity;
}

/**
 * All problems discovered when opening a file.
 */
export class Problems {
  private readonly list: Problem[] = [];

  add(message: string, severity: Severity = "error"): void {
    this.list.push({ message, severity });
  }

  addProblem(problem: Problem): void {
    this.list.push(problem);
  }

  all(): Problem[] {
    return this.list;
  }

  hasErrors(): boolean {
    return this.list.some((p) => p.severity === "error");
  }

  errorCount(): number {
    return this.list.filter((p) => p.severity === "error").length;
  }

  warningCount(): number {
    return this.list.filter((p) => p.severity === "warning").length;
  }

  isEmpty(): boolean {
    return this.list.length === 0;
  }

  summary(): string {
    const errors = this.errorCount();
    const warnings = this.warningCount();
    if (errors === 0 && warnings === 0) return 'No problems.';
    return `${errors} error(s), ${warnings} warning(s)`;
  }
}

/**
 * Loaded CSV file for a RASOrbit run. The first column is the elapsed time and the other columns are numeric values
 * for that time point. Every cell is treated as a number or null.
 */
export class RunFile {
  readonly path: string;
  /** Per-column metadata and stats. */
  readonly columns: Col[];
  /** Parsed numeric rows. */
  readonly rows: Row[];

  constructor(path: string, csvContent: string) {
    this.path = path;
    const schema = inferSchema(csvContent, { trim: true });
    // We expect numeric-only data; override inference to prevent Date/JSON/boolean parsing.
    for (const c of schema.cols) {
      c.type = "n";
      c.repl.empty = null;
      c.repl.null = null;
      c.repl.NaN = null;
    }
    const parser = initParser(schema);
    const raw = parser.typedObjs(csvContent) as Record<string, unknown>[];
    const columnNames = schema.cols.map((c) => c.name);
    this.rows = raw.map((row) => toNumericRow(row, columnNames));
    this.columns = computeColStats(columnNames, this.rows);
  }

  get rowCount(): number {
    return this.rows.length;
  }

  getRow(index: number): Row | undefined {
    return this.rows[index];
  }

  get columnCount(): number {
    return this.columns.length;
  }

  getColumn(nameOrKind: string): Col | undefined {
    let col: Col | undefined = this.columns.find(c => c.name === nameOrKind);
    if (col == null) {
      col = this.columns.find(c => c.kind() === nameOrKind);
    }
    return col;
  }

  timeColumn(): Col | undefined {
    return this.getColumn('Time');
  }

  locationColumns(): { lat: Col, long: Col } | undefined {
    const lat = this.getColumn("Lat") || this.getColumn("Geod-Lat");
    const long = this.getColumn("Long") || this.getColumn("Geod-Long");
    if (lat && long && lat.hasRange() && long.hasRange()) return { lat, long };
  }

  altitudeColumn(): Col | undefined {
    const col = this.getColumn("Alt") || this.getColumn("Geod-Alt");
    return col?.hasData() ? col : undefined;
  }

  /** Location + altitude columns required for the 3D globe trace. */
  globeColumns(): { lat: Col; long: Col; alt: Col } | undefined {
    const loc = this.locationColumns();
    const alt = this.altitudeColumn();
    if (loc && alt) return { ...loc, alt };
  }

  dataColumns(): Col[] {
    const timeCol = this.timeColumn();
    return this.columns.filter(c => c != timeCol && c.hasRange());
  }

  getColumnValues(nameOrKind: string): (number | null)[] {
    const col = this.getColumn(nameOrKind);
    if (col == null) return [];
    return this.rows.map((row) => row.value(col.name));
  }

  hasColumnValues(nameOrKind: string): boolean {
    return this.getColumn(nameOrKind) != null;
  }

  validate(): Problems {
    const problems = new Problems();

    // Make sure the data isn't entirely empty.
    if (this.columnCount < 2) {
      problems.add("Too few columns found", "error");
    }
    if (this.rowCount < 2) {
      problems.add("Too few rows found", "error");
    }

    // Require a Time column, with a non-negative range of values.
    const timeCol = this.timeColumn();
    if (timeCol == null) {
      problems.add('No "Time" column found.', "error");
    } else {
      const times = this.getColumnValues(timeCol.name).filter(v => v != null && v >= 0);
      if (times.length < 1) {
        problems.add('No valid values in "Time" column.', "error");
      } else if (range(times) <= 0) {
        problems.add('No range of values in "Time" column.', "error");
      } else if (times.length < this.rowCount) {
        problems.add(`${this.rowCount - times.length} invalid values in "Time" column.`, "warning");
      }
    }

    // Make sure we have at least one other column to chart against Time.
    if (timeCol != null && this.dataColumns().length < 1) {
      problems.add('No interesting data in any non-Time column.', "error");
    }

    return problems;
  }
}

function toNumericRow(raw: Record<string, unknown>, columns: string[]): Row {
  const data: Record<string, number | null> = {};
  for (const col of columns) {
    const v = raw[col];
    if (v == null) {
      data[col] = null;
    } else if (typeof v === "number") {
      data[col] = v;
    } else if (typeof v === "string") {
      if (v === "") {
        data[col] = null;
      } else {
        const n = Number(v);
        data[col] = Number.isNaN(n) ? null : n;
      }
    } else {
      data[col] = null;
    }
    if (typeof data[col] === "number" && !Number.isFinite(data[col]!)) {
      data[col] = null;
    }
  }
  return new Row(data);
}

function computeColStats(columnNames: string[], rows: Row[]): Col[] {
  return columnNames.map((name) => {
    let min: number | null = null;
    let max: number | null = null;
    let nulls = 0;

    for (const row of rows) {
      const v = row.value(name);
      if (v == null) {
        nulls += 1;
        continue;
      }
      if (min == null || v < min) {
        min = v;
      }
      if (max == null || v > max) {
        max = v;
      }
    }

    return new Col(name, min, max, nulls);
  });
}


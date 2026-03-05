## RASOrbit Viewer

RASOrbit Viewer is a desktop app (Tauri + React) for exploring time‑series CSV output from RASOrbit. It focuses on plotting multiple derived quantities vs. time, with a clean, chart‑centric layout and minimal chrome.

## Key features

- **CSV file viewer for RASOrbit output**
  - Opens CSV files via File → Open… or by opening CSVs from the OS.
  - Validates the file (structure, time column, numeric data) and reports problems.

- **Column‑driven chart selection**
  - Discovers all numeric columns in the file.
  - Shows a compact “Columns: … Select…” bar at the top.
  - A dialog lists all “interesting” columns (those with real numeric range); checkboxes control which charts are shown.
  - By default, the first three interesting columns are selected.

- **Stacked charts with shared time axis**
  - One chart per selected column, stacked vertically.
  - X axis is always the Time column; Y axis is the selected column.
  - All Y axes are left‑aligned so the chart stack looks clean.
  - Charts are full width with a 3:2 aspect ratio; the chart area scrolls as a single pane.

- **Rich tooltips**
  - Hovering near a line shows a tooltip for the nearest time sample.
  - Tooltips use column semantics, e.g.:
    - `Time: 294.006 s`
    - `Inerti-Vel: 18521 ft/sec`
  - Time is treated as just another column; units come from the column header.

- **Warnings and validation**
  - A banner lists any issues found on load (e.g. missing/invalid Time, too few rows/columns, no chartable data).
  - Errors prevent charting; warnings still allow the file to be viewed.

## CSV expectations

The app is designed around typical RASOrbit CSV output:

- **Header row**: Column names in the first row.
- **Numeric data**: All data columns are treated as numeric; non‑numeric or empty values become `null`.
- **Time column**:
  - Must exist and have a non‑zero, non‑negative numeric range.
  - Identified by its “kind”, e.g. `Time (sec)` → kind `"Time"`, unit `"sec"`.
- **Chartable columns**:
  - All non‑Time columns that have a real numeric range (`max > min`).
  - These appear in the selection dialog and can be plotted vs. Time.

Files must have at least:

- 2 or more columns,
- 2 or more rows,
- a valid Time column,
- and at least one other “interesting” column.

## Usage

1. **Launch** the app.
2. **Open a file**:
   - Use `File → Open…` in the menu and choose a CSV, or
   - Open a CSV via the OS and let Tauri route it to the app.
3. **Review warnings**:
   - If the file has structural issues, a warning banner appears at the top.
   - If there are errors (e.g. no valid Time column), the app will refuse to chart the file.
4. **Select columns to chart**:
   - At the top you’ll see: `Columns: …  [Select…]`.
   - Click **Select…** to open the dialog and check/uncheck which columns you want plotted.
   - Use **Select first 3** in the dialog to reset to the default selection.
5. **Explore the charts**:
   - Scroll vertically to browse all charts.
   - Hover over a chart to see the Time and that column’s value at the nearest point.

## Development

### Prerequisites

- Node.js and npm
- Rust toolchain (for Tauri)
- Tauri CLI (installed via `npm` dev dependency)

### Building the app

From the `roview` directory:

```bash
npm install
npm run tauri dev
```

This starts the React dev server and launches the Tauri shell window pointing at it.

### Production build

```bash
npm install
npm run tauri build
```

This produces a platform‑native `.app` / executable in Tauri’s bundle output directory.

## License

Copyright © 2026 [John Coker](mailto:john@jcsw.com)
Licensed under the ISC License. See `LICENSE` for details.

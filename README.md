## RASOrbit Viewer

RASOrbit Viewer is a desktop app (Tauri + React) for exploring time‑series CSV output from RASOrbit.
It focuses on plotting multiple derived quantities vs. time, with a clean, chart‑centric layout
and minimal chrome.

## Usage

1. **Launch** the app.
2. **Open a file**:
   - Use **File → Open…** in the menu and choose a CSV file, or
   - Open a CSV via the OS with this application.
3. **Review warnings**:
   - If the file has structural issues, a warning banner appears at the top.
   - If there are errors (e.g. no valid Time column), the app will refuse to open the file.
4. **Select columns to chart**:
   - Initially the first three columns are shown.
   - Use the **View** menu to change the columns displayed.
5. **Explore the charts**:
   - Scroll vertically to browse all charts.
   - Hover over a chart to see the Time and that column’s value at the nearest point.
6. **Trace the course**:
   - Use **View → Map Trace** to turn on/off a map of the location over time.
   - **View → Latitude vs Longitude** adds a line chart with longitude on the horizontal axis and latitude on the vertical.
7. **Printing / Export**:
   - Charts and the map can be exported as images using the **File → Export Charts…**.

## Development

### Prerequisites

- Node.js and npm
- Rust toolchain

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

## RASOrbit Viewer

RASOrbit Viewer is a desktop app (Tauri + React) for exploring time‑series CSV output from RASOrbit.
It focuses on plotting multiple derived quantities vs. time, with a clean, chart‑centric layout
and minimal chrome.

Download info and basic usage is on [the intro page](https://johncoker.github.io/roview).

## Development

**App version** is defined only in `src-tauri/Cargo.toml` (`[package] version`). Tauri reads that for bundles and the About dialog. The `version` in `package.json` is a fixed npm placeholder (`0.0.0`) and is not the product version.

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

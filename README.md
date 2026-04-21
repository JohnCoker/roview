## RASOrbit Viewer

RASOrbit Viewer is a desktop app (Tauri + React) for exploring time‑series CSV output from
[RASOrbit](http://www.rasaero.com).
It focuses on plotting multiple derived quantities vs. time, with a clean, chart‑centric layout
and minimal chrome.

> [!TIP]
> For downloads and basic usage [see the product page](https://johncoker.github.io/roview).

## Development

The appliation version is defined only in `src-tauri/Cargo.toml` (`[package] version`).
Tauri reads that for bundles and the About dialog. The app uses it for upgrade checks.

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

This produces a platform‑native bundle / installer in Tauri’s bundle output directory.

## License

Copyright © 2026 [John Coker](mailto:john@jcsw.com)
Licensed under the ISC License. See `LICENSE` for details.

This app is free software; feel free to use it for personal, educational or commercial missions.
There is no support and no warranty.

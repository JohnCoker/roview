---
layout: default
---
This is a desktop application for exploring time‑series CSV output from RASOrbit.
It focuses on plotting multiple derived quantities vs. time, with a clean, chart‑centric layout
and minimal chrome.

This is an add-on program to **RASOrbit**; see [rasaero.com](http://www.rasaero.com) for more info.

## Download

Pre-built files are available for some platforms,
[latest](https://github.com/johncoker/roview/releases):
- [Windows (Intel 64-bit)](https://github.com/johncoker/roview/releases)
- [macOS (Apple Silicon)](https://github.com/johncoker/roview/releases)
- [Linux (Intel 64-bit)](https://github.com/johncoker/roview/releases)

Other platforms may be built from [source](https://github.com/johncoker/roview/).

## Usage

1. **Launch** the app.

2. **Open a file**:
   - Use **File → Open** in the menu and choose a CSV file, or
   - Open a CSV via the OS with this application.

3. **Review warnings**:
   - If the file has structural issues, a warning banner appears at the top.
   - If there are errors (e.g. no valid Time column), the app will refuse to open the file.

4. **Select columns to chart**:
   - Initially the first four columns are shown.
   - Use **View → Select Columns** to change the columns displayed.

5. **Explore the charts**:
   - Scroll vertically to browse all charts.
   - Hover over a chart to see the Time and that column’s value at the nearest point.
   - **View → Zoom Slider** enables zooming into shorter ranges of the line charts.

6. **Trace the course**:
   - Use **View → Map Trace** to turn on/off a map of the location over time.
   - Use **View → Globe Trace** to turn on/off a 3D view of the location around the Earth.
   - Zoom both charts, pan the map, and rotate the globe.

7. **Playback status bar**:
   - Watch a moving dot trace the progress on all charts (most interesting for the map and globe).
   - To speed it up, use the combo box to select a higher rate.
   - To clear the dot, use the stop button.

8. **Printing / Export**:
   - Charts and the map can be exported as images using the **File → Export Charts**
     or right clicking on a single chart.

## Details

The author is [John Coker](mailto:john@jcsw.com).
This app is free software; feel free to use it for personal, educational or commercial missions.
There is no support and no warranty.

<script src="release.js"></script>

# ElectricCAD Easy

An electrical network designer for concert venues, events and any temporary power setups. The scheme is assembled from standard nodes — inputs, distributors, extenders and consumers — while the app calculates phase loads in real time, highlighting overloads and phase imbalance.

Single-page app: one HTML file, dark theme, runs in any browser — no server or build step.

**Live version:** <https://ileech.mywire.org/electric/>

## Features

### Visual editor
- **Infinite workspace** with a world coordinate system: mouse-wheel zoom, middle-button pan, instant focus on `0;0` (press `F`);
- **Node blocks** with one input and multiple outputs; every port has its own connector type, rating (A) and phase;
- **Connect ports by dragging** (LMB on a port oval → oval of another port), disconnect with RMB on a port;
- **Selection**: single (LMB), group (SHIFT+LMB), **lasso** (drag on empty space);
- **Clipboard**: Ctrl+C / Ctrl+V / Ctrl+X; delete with Del / Alt+Del;
- **Undo / Redo**: Ctrl+Z / Ctrl+Y — full action history.

### Equipment catalog
- **Inputs / Sources**: 3P power panels 250/125/63/32/16A, three-phase CEE outlets, single-phase CEE 32/16A, EURO/SHUKO 16/10/6A;
- **Distributors**: three-phase → three-phase (250→2×125, 125→2×63, 63→2×32, 32→2×16A) and three-phase → single-phase with **L1/L2/L3** phase distribution (32A→6×16A CEE, 32A→6×16A EURO, 16A→3×16A EURO);
- **Extenders / Adapters**: EURO 1→5×16A, CEE 16A 1ph → 5×EURO 16A;
- **Consumers**: single-phase EURO, CEE 1ph and three-phase CEE with a specified load (W);
- **Custom node** of any configuration (type, connectors, ratings, output count, consumption).

### Load calculation (real time)
- Automatic recalculation on any scheme change;
- Consumer loads are distributed across phases **L1/L2/L3**; three-phase consumers split evenly;
- Power-to-current conversion: 230 V single-phase, 400/√3 V three-phase;
- **Load color indication**: green → yellow → **red on overload** (rating exceeded);
- **Phase imbalance detector**: a ≥1.5× difference between phases highlights the three-phase node.

### Scheme correctness rules
The app refuses to build a knowingly wrong scheme:
- no output↔output and input↔input connections;
- no **different connector types** or **different phase counts**;
- no **cycles** in the scheme;
- no connection to an **occupied output**.

### Projects
- Project name, auto-save in the browser (localStorage);
- **JSON export / import** (buttons or Ctrl+Shift+S / Ctrl+Shift+O) — move projects between devices;
- Clear project;
- Built-in **HELP** on controls and rules.

## How it works

1. Pick a node from the catalog (or create your own) — it appears at the workspace center;
2. Drag an output-port oval onto the input-port oval of the next node;
3. Repeat until you build the chain "panel → distributor → consumer";
4. Watch the load on every port and the color indication.

## Run

Just open `index.html` in a browser. No dependencies and no install — everything (including project saving) works locally, offline.

## Repository layout

| File | Description |
|---|---|
| `index.html` | Current version of the app (same as the site) |
| `LICENSE` | GPLv3 |

## License

GNU General Public License v3.0 (GPLv3) — free software: you can use, modify and redistribute it, preserving authorship and the same license for derivative works. Full text: see [LICENSE](LICENSE).
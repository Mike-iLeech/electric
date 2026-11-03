# ElectricCAD Easy v32

The current implementation is documented in [README.md](README.md), with design decisions and verification limits in [CHANGES-v32.md](CHANGES-v32.md).

Open index.html directly, or run `node server.cjs`. `node build.cjs` produces a standalone dist/index.html. Tests: install development dependencies with `pnpm install --ignore-scripts`, then run `node --test tests/*.test.cjs`.

The abstract model assumes PF=1 and 50 Hz. Line voltage is phase voltage times sqrt(3); three-phase consumer power is shared equally. Breakers use an explicit, ideal threshold simulation step, without timing curves or selectivity. Cable calculations are deferred in [BACKLOG.md](BACKLOG.md).

This branch is not deployed. Logic is covered by Node/jsdom tests; actual browser/device visual verification is still required. Project sessions stay in the browser's localStorage for the current origin; JSON export transfers projects across devices/origins.

License: GNU GPL v3.0, see [LICENSE](LICENSE).

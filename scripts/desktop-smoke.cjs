// Launch two real Electron processes with an isolated data directory.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.join(__dirname, "../test-results");
fs.mkdirSync(root, { recursive: true });
const data = fs.mkdtempSync(path.join(root, "desktop-"));
const env = { ...process.env, ELECTRICCAD_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
for (const phase of ["write", "read"]) {
  const result = spawnSync(require("electron"), [path.join(__dirname, "desktop-smoke-app.cjs"), phase], {
    env, encoding: "utf8", timeout: 90000, windowsHide: true,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error || result.status !== 0) throw result.error || new Error(`Desktop smoke ${phase}: ${result.status}`);
}
console.log("DESKTOP_SMOKE_PASS " + data);

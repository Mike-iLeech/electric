"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { signingConfig } = require("./signing-config.cjs");

if (process.platform !== "win32") throw new Error("Signed Windows releases must be built and verified on Windows.");
const cwd = path.resolve(__dirname, "..");
const env = { ...process.env, ELECTRICCAD_SIGNED_RELEASE: "1" };
signingConfig(env); // Fail before building if the trusted publisher/credentials are missing.
function run(command, args) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, [path.join(cwd, "build.cjs")]);
run(process.execPath, [require.resolve("electron-builder/out/cli/cli.js"),
  "--config", "electron-builder.cjs", "--win", "nsis", "--x64", "--publish", "never"]);
run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  path.join(__dirname, "verify-signatures.ps1"), "-Directory", path.join(cwd, "release")]);

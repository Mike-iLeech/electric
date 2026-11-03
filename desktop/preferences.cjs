"use strict";
const fs = require("node:fs");
const path = require("node:path");
const DEFAULTS = Object.freeze({ language: "ru", autoUpdate: true, lastUpdateCheck: 0 });

function normalize(value) {
  return {
    language: value?.language === "en" ? "en" : "ru",
    autoUpdate: typeof value?.autoUpdate === "boolean" ? value.autoUpdate : true,
    lastUpdateCheck: Number.isFinite(value?.lastUpdateCheck) && value.lastUpdateCheck >= 0 ? value.lastUpdateCheck : 0,
  };
}
function createPreferences(root) {
  const filename = path.join(root, "Settings", "application.json");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let state = { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(filename, "utf8");
    try { state = normalize(JSON.parse(raw)); }
    catch { fs.copyFileSync(filename, filename + ".corrupt-" + Date.now()); }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return {
    read: () => ({ ...state }),
    patch(changes, { fromRenderer = false } = {}) {
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid preferences");
      const allowed = fromRenderer ? ["language", "autoUpdate"] : Object.keys(DEFAULTS);
      for (const [key, value] of Object.entries(changes)) {
        if (!allowed.includes(key)) throw new Error("Unknown preference: " + key);
        if (key === "language" && !["ru", "en"].includes(value)) throw new Error("Invalid language");
        if (key === "autoUpdate" && typeof value !== "boolean") throw new Error("Invalid update preference");
        if (key === "lastUpdateCheck" && (!Number.isFinite(value) || value < 0)) throw new Error("Invalid check date");
      }
      const next = { ...state, ...changes };
      const temporary = filename + ".tmp";
      let fd;
      try {
        fd = fs.openSync(temporary, "w");
        fs.writeFileSync(fd, JSON.stringify(next, null, 2), "utf8");
        fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
        fs.renameSync(temporary, filename);
        state = next;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
        try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      return { ...state };
    },
  };
}
module.exports = { createPreferences, normalize, DEFAULTS };

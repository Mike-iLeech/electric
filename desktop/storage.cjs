"use strict";
const fs = require("node:fs");
const path = require("node:path");

const FILES = Object.freeze({
  "electriccad.session.v32": ["Projects", "current.json"],
  "electriccad.session.v32.backup": ["Backups", "previous.json"],
  "electriccad.templates.v32": ["Settings", "custom-modules.json"],
  "electriccad.ui.v32": ["Settings", "ui.json"],
});

function createStorage(root) {
  for (const name of ["Projects", "Backups", "Settings", "Exports", "Browser"])
    fs.mkdirSync(path.join(root, name), { recursive: true });
  function filename(key) {
    if (!Object.hasOwn(FILES, key)) throw new Error("Неизвестный раздел данных");
    return path.join(root, ...FILES[key]);
  }
  return {
    getItem(key) {
      try { return fs.readFileSync(filename(key), "utf8"); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    },
    setItem(key, value) {
      const target = filename(key);
      if (typeof value !== "string" || Buffer.byteLength(value) > 16 * 1024 * 1024)
        throw new Error("Недопустимый размер данных");
      const data = JSON.parse(value);
      if (!data || typeof data !== "object") throw new Error("Ожидаются данные JSON");
      if (key.includes("session") && (!Array.isArray(data.nodes) || !Array.isArray(data.links) || !data.meta))
        throw new Error("Некорректный проект");
      if (key.includes("templates") && !Array.isArray(data)) throw new Error("Некорректный каталог");
      if (this.getItem(key) === value) return;
      // The previous destination survives a failed write. Rename publishes a complete JSON only.
      const temporary = target + ".tmp";
      let descriptor;
      try {
        descriptor = fs.openSync(temporary, "w");
        fs.writeFileSync(descriptor, value, "utf8");
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporary, target);
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    },
  };
}

module.exports = { createStorage, FILES };

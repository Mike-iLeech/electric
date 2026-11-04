const fs = require("node:fs"),
  path = require("node:path");
let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="editor.css"\s*\/?\s*>/,
  "<style>" +
    fs.readFileSync(path.join(__dirname, "editor.css"), "utf8") +
    "</style>",
);
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="original-theme.css"\s*\/?\s*>/,
  "<style>" +
    fs.readFileSync(path.join(__dirname, "original-theme.css"), "utf8") +
    "</style>",
);
for (const name of [
  "i18n-help.js",
  "i18n.js",
  "engine.js",
  "default-project.js",
  "routing.js",
  "renderer.js",
  "gost.js",
  "vendor/jspdf.umd.min.js",
  "schematic.js",
  "sheet.js",
  "app.js",
  "export.js",
  "desktop/settings.js",
]) {
  const re = new RegExp(
    '<script src="' + name.replace(".", "\\.") + '" defer(?:="")?></script>',
  );
  html = html.replace(
    re,
    () =>
      "<script>" +
      fs
        .readFileSync(path.join(__dirname, name), "utf8")
        .replaceAll("</script", "<\\/script") +
      "</script>",
  );
}
if (
  /(?:src|href)="(?:engine.js|routing.js|renderer.js|app.js|export.js|schematic.js|gost.js|editor.css|original-theme.css)"/.test(
    html,
  )
)
  throw Error("Не все локальные ресурсы встроены");
html = html.replace(/\b(src|data-gif)="(help-images\/[a-z-]+\.(png|jpg|gif))"/g, (_, attribute, file, extension) => {
  const mime = extension === "jpg" ? "jpeg" : extension;
  const image = fs.readFileSync(path.join(__dirname, file)).toString("base64");
  return `${attribute}="data:image/${mime};base64,${image}"`;
});
// Keep the branded page portable: file://, the site and Electron use the same assets.
const brandMime = { svg: "image/svg+xml", ico: "image/x-icon", png: "image/png" };
html = html.replace(/\b(src|href)="(assets\/brand\/[a-z-]+\.(svg|ico|png))"/g, (_, attribute, file, extension) => {
  const image = fs.readFileSync(path.join(__dirname, file)).toString("base64");
  return `${attribute}="data:${brandMime[extension]};base64,${image}"`;
});
fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist/index.html"), html);
fs.writeFileSync(
  path.join(__dirname, "dist/default-project.json"),
  fs.readFileSync(path.join(__dirname, "default-project.json"), "utf8"),
);
console.log(
  "dist/index.html — автономная версия, " + Buffer.byteLength(html) + " байт",
);

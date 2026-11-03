const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const files = new Set([
  "index.html",
  "i18n-help.js",
  "i18n.js",
  "engine.js",
  "default-project.js",
  "app.js",
  "export.js",
  "schematic.js",
  "sheet.js",
  "gost.js",
  "vendor/jspdf.umd.min.js",
  "renderer.js",
  "routing.js",
  "editor.css",
  "original-theme.css",
  "help-images/project-tree.jpg",
  "help-images/overload.jpg",
  "help-images/cable.png",
  "help-images/export.jpg",
  "help-images/overview.jpg",
  "help-images/project-panel.jpg",
  "help-images/navigation.jpg",
  "help-images/catalog.jpg",
  "help-images/module-builder.jpg",
  "help-images/connections.jpg",
  "help-images/properties.jpg",
  "help-images/cable-settings.jpg",
  "help-images/export-preview.jpg",
  "help-images/alerts.jpg",
  "help-images/calculations.jpg",
  "help-images/protection.jpg",
  "help-images/connect-ports.jpg",
  "help-images/connect-ports.gif",
  "help-images/move-nodes.jpg",
  "help-images/move-nodes.gif",
  "help-images/move-cables.jpg",
  "help-images/move-cables.gif",
  "help-images/zoom.jpg",
  "help-images/zoom.gif",
  "help-images/pan.jpg",
  "help-images/pan.gif",
]);
http
  .createServer((req, res) => {
    const name = req.url.split("?")[0].replace(/^\//, "") || "index.html";
    if (!files.has(name)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.setHeader(
      "Content-Type",
      name.endsWith(".html")
        ? "text/html; charset=utf-8"
        : name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : name.endsWith(".jpg")
            ? "image/jpeg"
            : name.endsWith(".png")
              ? "image/png"
              : name.endsWith(".gif")
                ? "image/gif"
                : "text/javascript; charset=utf-8",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(fs.readFileSync(path.join(__dirname, name)));
  })
  .listen(18744, "127.0.0.1", () =>
    console.log("ElectricCAD: http://127.0.0.1:18744"),
  );

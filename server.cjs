const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const files = new Set([
  "index.html",
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
              : "text/javascript; charset=utf-8",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(fs.readFileSync(path.join(__dirname, name)));
  })
  .listen(18744, "127.0.0.1", () =>
    console.log("ElectricCAD: http://127.0.0.1:18744"),
  );

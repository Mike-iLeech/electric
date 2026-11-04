const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
  { JSDOM, VirtualConsole } = require("jsdom");
test("автономная сборка запускается без внешних JS/CSS и ошибок", async () => {
  execFileSync(process.execPath, [path.join(__dirname, "../build.cjs")]);
  const html = fs.readFileSync(
      path.join(__dirname, "../dist/index.html"),
      "utf8",
    ),
    errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (e) => errors.push(e));
  assert.equal(/<script[^>]+src=/.test(html), false);
  assert.equal(/href="editor.css"/.test(html), false);
  const animations = [...html.matchAll(/data-gif="([^"]+)"/g)];
  assert.equal(animations.length, 5);
  for (const [, source] of animations) assert.match(source, /^data:image\/gif;base64,R0lGOD/);
  assert.equal(/(?:src|data-gif)="help-images\//.test(html), false);
  // Branding must not depend on the hub favicon or a server beside the standalone file.
  assert.equal(/(?:src|href)="(?:assets\/brand\/|\/favicon\.ico)/.test(html), false);
  const document = new JSDOM(html).window.document;
  assert.match(document.querySelector('link[rel="icon"][type="image/x-icon"]').href, /^data:image\/x-icon;base64,/);
  assert.match(document.querySelector('link[rel="icon"][type="image/svg+xml"]').href, /^data:image\/svg\+xml;base64,/);
  assert.match(document.querySelector('link[rel="apple-touch-icon"]').href, /^data:image\/png;base64,/);
  assert.match(document.querySelector('.appBrandSymbol').src, /^data:image\/svg\+xml;base64,/);
  assert.equal(document.querySelector('.appBrandName').textContent, 'ElectricCAD Easy');
  const dom = new JSDOM(html, {
    url: "https://electric.example/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: console,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.ResizeObserver = class {
        observe() {}
      };
      w.HTMLCanvasElement.prototype.getContext = () =>
        new Proxy(
          { measureText: (t) => ({ width: String(t).length * 7 }) },
          { get: (o, k) => (k in o ? o[k] : () => {}) },
        );
    },
  });
  await new Promise((r) =>
    dom.window.addEventListener("load", r, { once: true }),
  );
  assert.equal(dom.window.electricDiagnostics().version, 32);
  assert.equal(dom.window.electricDiagnostics().project.nodes.length, require("../default-project.json").nodes.length);
  assert.deepEqual(errors, []);
  dom.window.close();
});

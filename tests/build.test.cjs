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

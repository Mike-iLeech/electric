const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { JSDOM } = require("jsdom"),
  fs = require("node:fs"),
  E = require("../engine");
const html = fs.readFileSync(
  require("node:path").join(__dirname, "../index.html"),
  "utf8",
);
test("справка открывается и поиск показывает подходящие разделы", async () => {
  const s = await setup();
  s.$("helpTip").click();
  assert.equal(s.$("helpModal").getAttribute("aria-hidden"), "false");
  const search = s.$("helpSearch");
  search.value = "дисбаланс";
  search.dispatchEvent(new s.w.Event("input", {bubbles:true}));
  assert.equal(s.$("helpCalculations").hidden, false);
  assert.equal(s.$("helpExport").hidden, true);
  search.value = "неттакогослова";
  search.dispatchEvent(new s.w.Event("input", {bubbles:true}));
  assert.equal(s.$("helpNoResults").hidden, false);
  search.value = "";
  search.dispatchEvent(new s.w.Event("input", {bubbles:true}));
  assert.equal(s.$("helpExport").hidden, false);
  s.dom.window.close();
});
test("все разделы справки иллюстрированы, снимок открывается и закрывается без закрытия справки", async () => {
  const s = await setup();
  s.$("helpTip").click();
  const sections = [...s.$("helpModal").querySelectorAll(".helpGuide")];
  assert.equal(sections.length, 11);
  for (const section of sections) {
    const img = section.querySelector(".helpImageButton img");
    assert.ok(img, section.id);
    assert.ok(img.alt.length > 0, section.id);
    assert.match(img.getAttribute("src"), /^help-images\/[a-z-]+\.jpg$/);
  }
  const viewer = s.w.document.querySelector(".helpImageDialog");
  viewer.showModal = () => viewer.setAttribute("open", "");
  viewer.close = () => {
    viewer.removeAttribute("open");
    viewer.dispatchEvent(new s.w.Event("close"));
  };
  const trigger = sections[0].querySelector(".helpImageButton");
  trigger.click();
  assert.equal(viewer.open, true);
  assert.equal(viewer.querySelector("img").src, trigger.querySelector("img").src);
  viewer.dispatchEvent(new s.w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
  assert.equal(viewer.open, false);
  assert.equal(s.$("helpModal").getAttribute("aria-hidden"), "false");
  assert.equal(s.w.document.activeElement, trigger);
  s.dom.window.close();
});
test("GIF справки запускаются по запросу, играют по одной и останавливаются при закрытии", async () => {
  const s = await setup();
  s.$("helpTip").focus();
  s.$("helpTip").click();
  const figures = [...s.$("helpNavigate").querySelectorAll(".helpGif")];
  assert.equal(figures.length, 5);
  const players = figures.map(figure => ({
    button: figure.querySelector(".helpGifButton"),
    image: figure.querySelector("img"),
    poster: figure.querySelector("img").getAttribute("src"),
  }));
  for (const {button, image, poster} of players) {
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.match(poster, /\.jpg$/);
    assert.match(image.dataset.gif, /\.gif$/);
  }
  const [first, second] = players;
  let firstScrolls = 0;
  figures[0].scrollIntoView = options => {
    firstScrolls++;
    assert.equal(options.block, "start");
    assert.equal(options.behavior, "auto");
  };
  first.button.focus();
  first.button.click();
  assert.equal(first.image.getAttribute("src"), first.image.dataset.gif);
  assert.equal(first.button.getAttribute("aria-pressed"), "true");
  assert.equal(s.w.document.activeElement, first.button);
  assert.equal(firstScrolls, 1);
  second.button.click();
  assert.equal(first.image.getAttribute("src"), first.poster);
  assert.equal(first.button.getAttribute("aria-pressed"), "false");
  assert.equal(firstScrolls, 1);
  assert.equal(second.image.getAttribute("src"), second.image.dataset.gif);
  second.button.click();
  assert.equal(second.image.getAttribute("src"), second.poster);
  second.button.click();
  assert.equal(second.image.getAttribute("src"), second.image.dataset.gif);
  assert.equal(second.button.getAttribute("aria-pressed"), "true");
  first.button.click();
  s.$("btnCloseHelp").click();
  assert.equal(first.image.getAttribute("src"), first.poster);
  assert.equal(first.button.getAttribute("aria-pressed"), "false");
  assert.equal(s.w.document.activeElement, s.$("helpTip"));
  s.$("helpTip").click();
  assert.equal(players.every(player => player.button.getAttribute("aria-pressed") === "false"), true);
  second.button.click();
  s.$("helpSearch").value = "неттакогослова";
  s.$("helpSearch").dispatchEvent(new s.w.Event("input", {bubbles:true}));
  assert.equal(second.image.getAttribute("src"), second.poster);
  assert.equal(second.button.getAttribute("aria-pressed"), "false");
  s.dom.window.close();
});
test("разделители остаются доступными и раскрывают соседние блоки с клавиатуры", async () => {
  const s = await setup();
  for (const [upper, lower, splitter] of [
    ["projectBlock", "catalogBlock", "leftSidebarSplitter"],
    ["outlinerBlock", "propsScroll", "sidebarSplitter"],
  ]) {
    const toggle = id => s.w.document.querySelector(`[aria-controls="${id}"]`);
    toggle(upper).click();
    toggle(lower).click();
    assert.equal(s.$(upper).hidden, true);
    assert.equal(s.$(lower).hidden, true);
    assert.equal(s.$(splitter).hidden, false);
    s.$(splitter).dispatchEvent(new s.w.KeyboardEvent("keydown", {code: "ArrowDown", bubbles: true}));
    assert.equal(s.$(upper).hidden, false);
    assert.equal(s.$(lower).hidden, false);
    assert.equal(toggle(upper).getAttribute("aria-expanded"), "true");
    assert.equal(toggle(lower).getAttribute("aria-expanded"), "true");
  }
  s.w.close();
});
test("каталог группирует содержимое каждой ветки внутри отдельной направляющей", async () => {
  const s = await setup();
  const branches = [...s.$("catalog").querySelectorAll("details")];
  assert.ok(branches.length > 1);
  for (const branch of branches) {
    assert.equal(branch.firstElementChild.tagName, "SUMMARY");
    assert.ok(branch.children[1].classList.contains("catalogChildren"));
    assert.ok(branch.children[1].children.length > 0);
  }
  s.w.close();
});
async function setup(session) {
  const dom = new JSDOM(html, {
    url: "https://electric.example/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  await new Promise((r) =>
    w.document.readyState === "loading"
      ? w.document.addEventListener("DOMContentLoaded", r, { once: true })
      : r(),
  );
  const errors = [],
    frames = [];
  w.addEventListener("error", (e) => errors.push(e.error));
  w.requestAnimationFrame = (f) => {
    frames.push(f);
    return frames.length;
  };
  w.ResizeObserver = class {
    constructor(callback) {
      w.testResizeCallback = callback;
    }
    observe() {}
  };
  w.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy(
      { measureText: (t) => ({ width: String(t).length * 6 }) },
      { get: (o, k) => (k in o ? o[k] : () => {}) },
    );
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AA==";
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  };
  w.document.getElementById("workspace").getBoundingClientRect = () => rect;
  w.HTMLElement.prototype.setPointerCapture = () => {};
  if (session)
    w.localStorage.setItem("electriccad.session.v32", JSON.stringify(session));
  w.eval(
    fs.readFileSync(
      require("node:path").join(__dirname, "../engine.js"),
      "utf8",
    ),
  );
  w.eval(
    fs.readFileSync(require("node:path").join(__dirname, "../default-project.js"), "utf8"),
  );
  w.eval(
    fs.readFileSync(
      require("node:path").join(__dirname, "../routing.js"),
      "utf8",
    ),
  );
  w.eval(
    fs.readFileSync(
      require("node:path").join(__dirname, "../renderer.js"),
      "utf8",
    ),
  );
  for (const name of ["schematic.js", "sheet.js", "export.js", "app.js"])
    w.eval(
      fs.readFileSync(require("node:path").join(__dirname, "..", name), "utf8"),
    );
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const flush = () => {
    for (let i = 0; i < 100 && frames.length; i++) frames.shift()();
  };
  flush();
  assert.deepEqual(errors, []);
  const $ = (id) => w.document.getElementById(id);
  const change = (id, value) => {
    $(id).value = String(value);
    $(id).dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const key = (code, extra = {}) =>
    w.document.body.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        bubbles: true,
        code,
        key: code === "Escape" ? "Escape" : code,
        ...extra,
      }),
    );
  const pointer = (type, x, y, extra = {}) => {
    const view = w.electricDiagnostics().project.view;
    x = x * view.zoom + view.panX + rect.left;
    y = y * view.zoom + view.panY + rect.top;
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      ...extra,
    });
    $("workspace").dispatchEvent(ev);
  };
  const state = () => JSON.parse(JSON.stringify(w.electricDiagnostics()));
  return {
    w,
    dom,
    $,
    change,
    key,
    pointer,
    state,
    flush,
    errors,
    geometry: rect,
    pendingFrames: () => frames.length,
  };
}
test("экспорт показывает настройки листов и разделяет независимые ветки без изменения истории", async () => {
  const p = E.project();
  p.nodes = [1, 2].map((i) =>
    E.makeNode(
      {
        name: "Ветка " + i,
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: i * 500, y: 0 },
    ),
  );
  const s = await setup(p);
  s.$("btnExport").click();
  const panel = s.w.document.querySelector(".schemeExport"),
    checkbox = panel.querySelector('input[type="checkbox"]');
  assert.ok(checkbox);
  assert.equal(
    panel.querySelector('[aria-label="Лист превью"]').options.length,
    1,
  );
  checkbox.click();
  assert.equal(
    panel.querySelector('[aria-label="Лист превью"]').options.length,
    2,
  );
  panel.querySelector('[data-orientation="portrait"]').click();
  assert.equal(s.state().project.meta.exportSettings.orientation, "portrait");
  const title = panel.querySelector('[aria-label="Название детали"]');
  title.value = "Вводной щит";
  title.dispatchEvent(new s.w.Event("change"));
  assert.equal(s.state().project.meta.drawingTitle, "Вводной щит");
  assert.ok(panel.querySelector('.exportPreview .exportSlider input[aria-label="Масштаб схемы"]'));
  assert.ok(panel.querySelector('.exportPreview .exportSlider input[aria-label^="Компоновка"]'));
  const preview = panel.querySelector(".exportPreviewFrame");
  panel.querySelector('[aria-label="Увеличить предпросмотр"]').click();
  assert.equal(preview.querySelector("output").textContent, "125%");
  assert.match(preview.querySelector("img").style.transform, /scale\(1\.25\)/);
  panel.querySelector('[aria-label="Показать весь лист"]').click();
  assert.equal(preview.querySelector("output").textContent, "100%");
  const paper = panel.querySelector('[aria-label="Формат листа"]');
  paper.value = "a4";
  paper.dispatchEvent(new s.w.Event("change"));
  const landscape = panel.querySelector('[data-orientation="landscape"]');
  assert.equal(landscape.disabled, false);
  landscape.click();
  assert.equal(s.state().project.meta.exportSettings.orientation, "landscape");
  assert.equal(s.state().undo, 0);
  s.dom.window.close();
});
const single = () => {
  const p = E.project();
  p.nodes = [
    E.makeNode(
      E.catalog().find((t) => t.category === "consumer" && t.phases === 1),
      { x: 400, y: 350 },
    ),
  ];
  return p;
};
test("редактор запускается, demo без коллизий, все сохранённые ID контролов остаются", async () => {
  const s = await setup();
  assert.equal(
    s.state().project.nodes.length,
    require("../default-project").create().nodes.length,
  );
  for (const id of require("./legacy-control-ids.json"))
    assert.ok(s.$(id), "missing " + id);
  assert.ok(s.$("sessionStatus").textContent);
  s.dom.window.close();
});
test("перемещение записывает один Undo и восстанавливает координаты", async () => {
  const s = await setup(single());
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointermove", 500, 320);
  s.pointer("pointerup", 500, 320);
  let d = s.state();
  assert.equal(d.undo, 1);
  assert.equal(d.project.nodes[0].pos.x, 500);
  s.key("KeyZ", { ctrlKey: true });
  assert.equal(s.state().project.nodes[0].pos.x, 400);
  s.key("KeyY", { ctrlKey: true });
  assert.equal(s.state().project.nodes[0].pos.x, 500);
  s.dom.window.close();
});
test("Shift-лассо сохраняет исходное выделение", async () => {
  const p = single();
  p.nodes.push(
    E.makeNode(
      E.catalog().find((t) => t.category === "consumer"),
      { x: 850, y: 350 },
    ),
  );
  const s = await setup(p);
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointerup", 400, 300);
  const first = s.state().selection[0];
  s.pointer("pointerdown", 640, 190, { shiftKey: true });
  s.pointer("pointermove", 1050, 530, { shiftKey: true });
  s.pointer("pointerup", 1050, 530, { shiftKey: true });
  assert.equal(s.state().selection.length, 2);
  assert.ok(s.state().selection.includes(first));
  s.dom.window.close();
});
test("Ctrl+Shift+Alt+Delete очищает весь проект при выделении, Undo возвращает", async () => {
  const s = await setup();
  s.key("KeyA", { ctrlKey: true });
  s.key("Delete", { ctrlKey: true, shiftKey: true, altKey: true });
  assert.equal(s.state().project.nodes.length, 0);
  s.key("KeyZ", { ctrlKey: true });
  assert.equal(
    s.state().project.nodes.length,
    require("../default-project").create().nodes.length,
  );
  s.dom.window.close();
});
test("ренейм не засоряет историю и русское имя экспортируется", async () => {
  const s = await setup(single());
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointerup", 400, 300);
  const input = s.$("propsBody").querySelector("input[type=text]");
  input.dispatchEvent(new s.w.Event("focus"));
  for (const v of ["Т", "Те", "Тест"]) {
    input.value = v;
    input.dispatchEvent(new s.w.Event("input"));
  }
  assert.equal(s.state().undo, 0);
  input.dispatchEvent(new s.w.Event("change"));
  assert.equal(s.state().undo, 1);
  assert.equal(s.state().project.nodes[0].name, "Тест");
  let filename;
  s.w.URL.createObjectURL = () => "blob:test";
  s.w.URL.revokeObjectURL = () => {};
  s.w.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  s.$("projectName").dispatchEvent(new s.w.Event("focus"));
  s.change("projectName", "Мой щит");
  s.$("btnExport").click();
  [...s.w.document.querySelectorAll(".schemeExport button")]
    .find((b) => b.getAttribute("aria-label") === "Сохранить проект JSON")
    .click();
  assert.equal(filename, "Мой щит.json");
  filename = null;
  s.$("btnDownloadProject").click();
  assert.equal(filename, "Мой щит.json");
  s.dom.window.close();
});
test("сессия сохраняется и восстанавливается без потери узлов и камеры", async () => {
  const s = await setup(single());
  s.$("btnSave").click();
  const raw = JSON.parse(s.w.localStorage.getItem("electriccad.session.v32"));
  assert.equal(raw.nodes.length, 1);
  s.dom.window.close();
  const restored = await setup(raw);
  assert.equal(restored.state().project.nodes[0].id, raw.nodes[0].id);
  assert.equal(restored.state().project.view.zoom, raw.view.zoom);
  restored.dom.window.close();
});
test("конструктор создаёт 3ф дистро с фазами L1 L2 L3 и автоматами", async () => {
  const s = await setup(single());
  s.$("btnNewNode").click();
  s.change("newNodeName", "Мой дистро");
  s.$("newNodeName").dispatchEvent(new s.w.Event("input"));
  assert.equal(s.$("builderError").textContent, "");
  assert.equal(s.$("btnCreateNode").disabled, false);
  s.$("btnCreateNode").click();
  const n = s.state().project.nodes.find((n) => n.name === "Мой дистро");
  assert.ok(n);
  assert.deepEqual(
    n.outputs.map((o) => o.phase),
    ["L1", "L2", "L3"],
  );
  assert.equal(n.mainBreaker.ratingA, 32);
  assert.ok(n.outputs.every((o) => o.breaker.ratingA === 16));
  s.dom.window.close();
});
test("конструктор потребителя поддерживает 1ф и 3ф и нулевое потребление", async () => {
  for (const phases of [1, 3]) {
    const s = await setup(single());
    s.$("btnNewNode").click();
    s.change("newNodeType", "consumer");
    s.change("modulePhases", phases);
    s.change("newNodeName", "Потребитель " + phases);
    s.change("newNodeW", 0);
    s.$("newNodeW").dispatchEvent(new s.w.Event("input"));
    assert.equal(
      s.$("btnCreateNode").disabled,
      false,
      s.$("builderError").textContent,
    );
    s.$("btnCreateNode").click();
    const n = s.state().project.nodes.at(-1);
    assert.equal(n.phases, phases);
    assert.equal(n.outputs.length, 0);
    assert.equal(n.consumerWatts, 0);
    s.dom.window.close();
  }
});
test("невалидный импорт атомарен и не уничтожает redo", async () => {
  const s = await setup(single());
  s.key("KeyA", { ctrlKey: true });
  s.key("Delete");
  s.key("KeyZ", { ctrlKey: true });
  const before = s.state();
  Object.defineProperty(s.$("fileImport"), "files", {
    configurable: true,
    value: [
      {
        size: 100,
        text: async () =>
          JSON.stringify({ nodes: [{ id: "broken" }], links: [] }),
      },
    ],
  });
  s.$("fileImport").dispatchEvent(new s.w.Event("change"));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(s.state().project, before.project);
  assert.equal(s.state().redo, before.redo);
  assert.ok(s.$("toastMsg").textContent.startsWith("Ошибка импорта"));
  s.dom.window.close();
});
test("групповая мощность показывает смешанное состояние и меняется одной транзакцией", async () => {
  const p = single();
  const second = E.makeNode(
    {
      ...E.catalog().find((t) => t.category === "consumer" && t.phases === 1),
      watts: 2000,
    },
    { x: 850, y: 350 },
  );
  p.nodes.push(second);
  const s = await setup(p);
  s.key("KeyA", { ctrlKey: true });
  const input = s.$("propsBody").querySelector("input[type=number]");
  assert.equal(input.placeholder, "Разные значения");
  input.value = "3000";
  input.dispatchEvent(new s.w.Event("change"));
  assert.ok(s.state().project.nodes.every((n) => n.consumerWatts === 3000));
  assert.equal(s.state().undo, 1);
  s.dom.window.close();
});
test("zoom вокруг указателя сохраняет мировую точку и не вызывает пересчёт истории", async () => {
  const s = await setup(single());
  const before = s.state().project.view,
    at = { x: 200, y: 120 },
    world = {
      x: (at.x - before.panX) / before.zoom,
      y: (at.y - before.panY) / before.zoom,
    };
  s.$("workspace").dispatchEvent(
    new s.w.WheelEvent("wheel", {
      clientX: at.x,
      clientY: at.y,
      deltaY: -100,
      cancelable: true,
    }),
  );
  const after = s.state().project.view;
  assert.ok(Math.abs((at.x - after.panX) / after.zoom - world.x) < 1e-8);
  assert.ok(Math.abs((at.y - after.panY) / after.zoom - world.y) < 1e-8);
  assert.equal(s.state().undo, 0);
  s.dom.window.close();
});
test("tap→tap соединение использует ту же проверку, неудача не стирает redo", async () => {
  const p = E.project(),
    a = E.makeNode(
      E.catalog().find((t) => t.category === "extender"),
      { x: 250, y: 250 },
    ),
    b = E.makeNode(
      E.catalog().find((t) => t.category === "consumer" && t.phases === 1),
      { x: 750, y: 250 },
    );
  p.nodes = [a, b];
  const s = await setup(p);
  let from = E.portPosition(a, a.outputs[0]),
    to = E.portPosition(b, b.inputs[0]);
  s.pointer("pointerdown", from.x, from.y);
  s.pointer("pointerup", from.x, from.y);
  s.pointer("pointerdown", to.x, to.y);
  s.pointer("pointerup", to.x, to.y);
  assert.equal(s.state().project.links.length, 1);
  s.key("KeyZ", { ctrlKey: true });
  assert.equal(s.state().redo, 1);
  const incompatible = E.portPosition(a, a.inputs[0]);
  s.pointer("pointerdown", incompatible.x, incompatible.y);
  s.pointer("pointerup", incompatible.x, incompatible.y);
  s.pointer("pointerdown", to.x, to.y);
  s.pointer("pointerup", to.x, to.y);
  assert.equal(s.state().redo, 1);
  assert.equal(s.state().project.links.length, 0);
  s.dom.window.close();
});
test("Escape отменяет лассо, а движение после отмены не меняет выделение", async () => {
  const s = await setup(single());
  s.key("KeyA", { ctrlKey: true });
  s.pointer("pointerdown", 100, 100);
  s.pointer("pointermove", 110, 110);
  s.key("Escape");
  assert.equal(s.$("lasso").style.display, "none");
  s.pointer("pointermove", 700, 600);
  assert.equal(s.state().selection.length, 0);
  s.dom.window.close();
});
test("конструктор щита допускает ввод 63А и несколько выходов 16А", async () => {
  const s = await setup(single());
  s.$("btnNewNode").click();
  s.change("newNodeType", "input");
  s.change("sourceSupplyA", 63);
  s.$("sourceSupplyA").dispatchEvent(new s.w.Event("input"));
  s.change("mainBreakerA", 63);
  s.$("mainBreakerA").dispatchEvent(new s.w.Event("input"));
  assert.equal(
    s.$("btnCreateNode").disabled,
    false,
    s.$("builderError").textContent,
  );
  s.$("btnCreateNode").click();
  const n = s.state().project.nodes.at(-1);
  assert.equal(n.supplyA, 63);
  assert.equal(n.mainBreaker, null);
  assert.equal(n.outputs.length, 3);
  assert.ok(n.outputs.every((o) => o.breaker.ratingA === 16));
  s.dom.window.close();
});
test("редактирование модуля не включает отключённый автомат", async () => {
  const p = E.project();
  const n = E.makeNode(
    E.catalog().find((t) => t.shield && t.inA === 32),
    { x: 400, y: 350 },
  );
  n.outputs[0].breaker.state = "tripped";
  p.nodes = [n];
  const s = await setup(p);
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointerup", 400, 300);
  [...s.$("propsBody").querySelectorAll("button")]
    .find((b) => b.textContent === "Изменить модуль / порты")
    .click();
  s.change("newNodeName", "Переименованный щит");
  s.$("newNodeName").dispatchEvent(new s.w.Event("input"));
  s.$("btnCreateNode").click();
  const next = s.state().project.nodes[0];
  assert.equal(next.name, "Переименованный щит");
  assert.equal(next.mainBreaker, null);
  assert.equal(next.outputs[0].breaker.state, "tripped");
  s.dom.window.close();
});
test("pinch двумя пальцами сохраняет мировую точку под серединой жеста", async () => {
  const s = await setup(single());
  const view = s.state().project.view,
    anchor = {
      x: (150 - view.panX) / view.zoom,
      y: (100 - view.panY) / view.zoom,
    };
  const touch = (type, x, y, id) => {
    const e = new s.w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: id,
      pointerType: "touch",
    });
    s.$("workspace").dispatchEvent(e);
  };
  touch("pointerdown", 100, 100, 1);
  touch("pointerdown", 200, 100, 2);
  touch("pointermove", 300, 100, 2);
  const v = s.state().project.view;
  assert.ok(Math.abs((200 - v.panX) / v.zoom - anchor.x) < 1e-8);
  assert.ok(Math.abs((100 - v.panY) / v.zoom - anchor.y) < 1e-8);
  assert.ok(v.zoom > view.zoom);
  touch("pointerup", 100, 100, 1);
  touch("pointerup", 300, 100, 2);
  assert.equal(s.state().undo, 0);
  s.dom.window.close();
});
test("resize сохраняет мировой центр, не засоряя историю", async () => {
  const s = await setup(single());
  s.w.testResizeCallback([{ contentRect: { width: 1000, height: 700 } }]);
  const before = s.state().project.view;
  const center = {
    x: (500 - before.panX) / before.zoom,
    y: (350 - before.panY) / before.zoom,
  };
  s.w.testResizeCallback([{ contentRect: { width: 500, height: 800 } }]);
  const after = s.state().project.view;
  assert.ok(Math.abs((250 - after.panX) / after.zoom - center.x) < 1e-8);
  assert.ok(Math.abs((400 - after.panY) / after.zoom - center.y) < 1e-8);
  assert.equal(s.state().undo, 0);
  s.dom.window.close();
});
test("смещение viewport панелями не влияет на мировые координаты перемещения", async () => {
  const s = await setup(single());
  s.geometry.left = 320;
  s.geometry.top = 140;
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointermove", 500, 320);
  s.pointer("pointerup", 500, 320);
  assert.equal(s.state().project.nodes[0].pos.x, 500);
  assert.equal(s.state().project.nodes[0].pos.y, 370);
  s.dom.window.close();
});
test("несколько изменений камеры объединяются в одну отрисовку без фонового цикла", async () => {
  const s = await setup(single());
  assert.equal(s.pendingFrames(), 0);
  for (let i = 0; i < 10; i++) s.$("btnZoomIn").click();
  assert.equal(s.pendingFrames(), 1);
  s.flush();
  assert.equal(s.pendingFrames(), 0);
  s.dom.window.close();
});
test("перенос изменяет CSS-transform без перерисовки капсул и статичной схемы на каждом шаге", async () => {
  const s = await setup(single());
  s.pointer("pointerdown", 400, 300);
  s.flush();
  s.pointer("pointermove", 410, 300);
  s.flush();
  const before = s.state().rendering;
  for (let i = 1; i <= 20; i++) {
    s.pointer("pointermove", 410 + i * 2, 300);
    s.flush();
  }
  const after = s.state().rendering;
  assert.equal(after.modulePaints, before.modulePaints);
  assert.equal(after.staticPaints, before.staticPaints);
  assert.equal(after.transforms, before.transforms + 20);
  s.pointer("pointerup", 450, 300);
  s.flush();
  assert.equal(s.state().undo, 1);
  s.dom.window.close();
});
test("Дерево соединений справа; напряжения в мире, каталог слева", async () => {
  const s = await setup();
  assert.ok(s.$("rightPanel").contains(s.$("outlinerBlock")));
  assert.ok(!s.$("leftPanel").contains(s.$("moduleNavigator")));
  assert.ok(
    s.$("outlinerBlock").compareDocumentPosition(s.$("propsScroll")) &
      s.w.Node.DOCUMENT_POSITION_FOLLOWING,
  );
  assert.ok(
    s.$("workspaceWrap").querySelector(".topBar").contains(s.$("generalSettings")),
  );
  assert.equal(
    s.$("leftPanel").querySelectorAll(".compactActions button").length,
    5,
  );
  assert.equal(
    s.$("outlinerTree").querySelectorAll("[data-node-id]").length,
    require("../default-project").create().nodes.length,
  );
  s.dom.window.close();
});
test("редактирование линейного напряжения пересчитывает фазное", async () => {
  const s = await setup(single());
  s.change("voltageLL", 400);
  assert.ok(
    Math.abs(s.state().project.settings.voltageLN - 400 / Math.sqrt(3)) < 1e-9,
  );
  s.change("voltageLN", 220);
  assert.ok(
    Math.abs(Number(s.$("voltageLL").value) - 220 * Math.sqrt(3)) < 1e-6,
  );
  s.dom.window.close();
});
test("во время переноса провода видны, меняются только связанные SVG-пути, фон и капсулы не перерисовываются", async () => {
  const p = E.project();
  for (const y of [0, 700]) {
    const a = E.makeNode(
        {
          name: "Источник " + y,
          category: "input",
          phases: 1,
          inA: 16,
          outputs: [{ connType: "euro", nominalA: 16 }],
        },
        { x: 0, y },
      ),
      b = E.makeNode(
        {
          name: "Нагрузка " + y,
          category: "consumer",
          phases: 1,
          inConnType: "euro",
          inA: 16,
          watts: 1000,
        },
        { x: 900, y },
      );
    p.nodes.push(a, b);
    E.connect(
      p,
      { nodeId: a.id, portId: a.outputs[0].id, kind: "out" },
      { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
    );
  }
  const s = await setup(p),
    target = p.nodes[1],
    active = p.links[0].id,
    fixed = p.links[1].id;
  s.pointer("pointerdown", target.pos.x, target.pos.y - 50);
  s.flush();
  const before = s.state().rendering;
  const get = (id) =>
    s.$("wireLayer").querySelector(`[data-link-id="${id}"]`).lastElementChild;
  const fixedD = get(fixed).getAttribute("d"),
    activeD = get(active).getAttribute("d"),
    initialPin = E.portPosition(target, target.inputs[0]);
  for (let i = 1; i <= 20; i++) {
    s.pointer("pointermove", 900 + i * 5, -50 + i * 2);
    s.flush();
    assert.ok(get(active).getAttribute("d").length > 0);
    assert.equal(get(fixed).getAttribute("d"), fixedD);
    const d = s.state(),
      n = d.project.nodes.find((n) => n.id === target.id),
      route = d.routes.find((l) => l.id === active).points;
    assert.deepEqual(route.at(-1), E.portPosition(n, n.inputs[0]));
    // The cached sprite moves by the node delta without repainting: its pin
    // must remain attached to the actual SVG endpoint on every move.
    const visiblePin = {x:initialPin.x + n.pos.x - target.pos.x, y:initialPin.y + n.pos.y - target.pos.y};
    assert.deepEqual(route.at(-1), visiblePin);
    const f = value => Number(value.toFixed(3));
    assert.ok(get(active).getAttribute("d").endsWith(`L${f(visiblePin.x)} ${f(visiblePin.y)}`));
  }
  const after = s.state().rendering;
  assert.notEqual(get(active).getAttribute("d"), activeD);
  assert.equal(after.staticPaints, before.staticPaints);
  assert.equal(after.modulePaints, before.modulePaints);
  assert.equal(after.wireUpdates, before.wireUpdates + 20);
  s.pointer("pointerup", 1000, -10);
  s.flush();
  assert.equal(s.state().undo, 1);
  s.dom.window.close();
});
test("у границы кабельного коридора сохраняется скольжение вдоль препятствия", async () => {
  const p = E.project(),
    a = E.makeNode(
      {
        name: "S",
        category: "input",
        phases: 1,
        inA: 16,
        outputs: [{ connType: "euro", nominalA: 16 }],
      },
      { x: 0, y: 0 },
    ),
    b = E.makeNode(
      {
        name: "C",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: 800, y: 0 },
    );
  p.nodes = [a, b];
  E.connect(
    p,
    { nodeId: a.id, portId: a.outputs[0].id, kind: "out" },
    { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
  );
  const s = await setup(p);
  s.pointer("pointerdown", 800, -50);
  s.pointer("pointermove", 370, -50);
  s.flush();
  for (let i = 1; i <= 5; i++) {
    s.pointer("pointermove", 370, -50 + i * 10);
    s.flush();
    assert.ok(s.state().project.nodes[1].pos.y >= i * 10 - 1e-6);
    assert.ok(s.state().routes[0].points.length > 0);
  }
  s.pointer("pointerup", 370, 0);
  s.flush();
  s.dom.window.close();
});
test("лассо выбирает пересечённые капсулы в обе стороны и обычный клик не показывает старую рамку", async () => {
  for (const reverse of [false, true]) {
    const s = await setup(single());
    const a = reverse ? [650, 300] : [150, 100],
      b = reverse ? [150, 100] : [650, 300];
    s.pointer("pointerdown", ...a);
    assert.equal(s.$("lasso").style.display, "none");
    s.pointer("pointermove", ...b);
    assert.equal(s.state().selection.length, 1);
    s.pointer("pointerup", ...b);
    assert.equal(s.$("lasso").style.width, "0px");
    s.pointer("pointerdown", 100, 550);
    assert.equal(s.$("lasso").style.display, "none");
    s.pointer("pointermove", 101, 551);
    assert.equal(s.$("lasso").style.display, "none");
    s.pointer("pointerup", 101, 551);
    assert.equal(s.$("lasso").style.display, "none");
    s.dom.window.close();
  }
});
test("клик по выбранной ноде сужает выбор, перенос сохраняет групповое выделение", async () => {
  const p = single();
  p.nodes.push(
    E.makeNode(
      E.catalog().find((t) => t.category === "consumer"),
      { x: 850, y: 350 },
    ),
  );
  const s = await setup(p);
  s.key("KeyA", { ctrlKey: true });
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointerup", 400, 300);
  assert.equal(s.state().selection.length, 1);
  s.key("KeyA", { ctrlKey: true });
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointermove", 410, 310);
  s.pointer("pointerup", 410, 310);
  assert.equal(s.state().selection.length, 2);
  s.dom.window.close();
});
test("каждая нода из каталога появляется в видимой области даже при заполненном viewport", async () => {
  const s = await setup(single());
  for (let i = 0; i < 8; i++) {
    s.$("catalog").querySelector(".nodeItem").click();
    s.flush();
    const d = s.state(),
      n = d.project.nodes.at(-1),
      r = E.rect(n),
      v = d.project.view;
    assert.ok(r.left * v.zoom + v.panX >= -1e-6);
    assert.ok(r.top * v.zoom + v.panY >= -1e-6);
    assert.ok(r.right * v.zoom + v.panX <= 1000 + 1e-6);
    assert.ok(r.bottom * v.zoom + v.panY <= 700 + 1e-6);
  }
  s.dom.window.close();
});
test("перенос неподключённой ноды через провод перестраивает его маршрут", async () => {
  const p = E.project(),
    a = E.makeNode(
      {
        name: "S",
        category: "input",
        phases: 1,
        inA: 16,
        outputs: [{ connType: "euro", nominalA: 16 }],
      },
      { x: 0, y: 0 },
    ),
    b = E.makeNode(
      {
        name: "C",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: 1000, y: 0 },
    ),
    free = E.makeNode(
      {
        name: "Free",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1,
      },
      { x: 500, y: 500 },
    );
  p.nodes = [a, b, free];
  E.connect(
    p,
    { nodeId: a.id, portId: a.outputs[0].id, kind: "out" },
    { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
  );
  const s = await setup(p),
    path = s.$("wireLayer").querySelector("path:last-child"),
    before = path.getAttribute("d");
  s.pointer("pointerdown", 500, 450);
  s.pointer("pointermove", 500, -50);
  s.flush();
  assert.notEqual(path.getAttribute("d"), before);
  assert.ok(s.state().project.nodes[2].pos.y < 150);
  s.pointer("pointermove", 550, -50);
  s.flush();
  assert.notEqual(path.getAttribute("d"), before);
  assert.ok(s.state().project.nodes[2].pos.x > 500);
  s.pointer("pointerup", 550, -50);
  s.dom.window.close();
});
test("перегрузка добавляет мигание ноде, проводу и обоим подключённым портам", async () => {
  const p = E.project(),
    a = E.makeNode(
      {
        name: "S",
        category: "input",
        phases: 1,
        inA: 16,
        outputs: [{ connType: "euro", nominalA: 16 }],
        shield: true,
      },
      { x: 0, y: 0 },
    ),
    b = E.makeNode(
      {
        name: "C",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 4500,
      },
      { x: 700, y: 0 },
    );
  p.nodes = [a, b];
  E.connect(
    p,
    { nodeId: a.id, portId: a.outputs[0].id, kind: "out" },
    { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
  );
  const s = await setup(p);
  assert.equal(s.$("wireLayer").querySelectorAll(".overload-wire").length, 1);
  assert.equal(s.$("moduleLayer").querySelectorAll(".overloaded").length, 2);
  assert.equal(s.$("moduleLayer").querySelectorAll(".overload-port").length, 2);
  assert.equal(
    s.$("moduleLayer").querySelectorAll(".moduleSprite > canvas.overload-port")
      .length,
    2,
  );
  assert.equal(s.$("moduleLayer").querySelectorAll(".overload-lead").length, 0);
  assert.equal(
    s.$("moduleLayer").querySelectorAll(".overload-node-outline").length,
    2,
  );
  const wire = s.$("wireLayer").querySelector(".overload-wire");
  assert.equal(wire.querySelector("path").getAttribute("stroke"), "#000000");
  assert.equal(
    wire.querySelector(".overload-wave").getAttribute("d"),
    wire.querySelector("path").getAttribute("d"),
  );
  const sourceSprite = s
    .$("moduleLayer")
    .querySelector(`[data-node-id="${a.id}"]`);
  const targetSprite = s
    .$("moduleLayer")
    .querySelector(`[data-node-id="${b.id}"]`);
  assert.equal(sourceSprite.style.getPropertyValue("--alarm-delay"), "0.18s");
  assert.equal(targetSprite.style.getPropertyValue("--alarm-delay"), "0s");
  s.$("btnTrip").click();
  s.flush();
  assert.equal(s.$("wireLayer").querySelectorAll(".overload-wire").length, 0);
  assert.equal(s.$("moduleLayer").querySelectorAll(".overload-port").length, 0);
  s.dom.window.close();
});

test("кнопка старого демо удалена", async () => { const s=await setup(single()); assert.equal(s.$("btnDemo"),null); s.dom.window.close(); });

test("общая кнопка включает вводные и портовые автоматы одной операцией Undo", async () => {
 const p=E.project();
 const n=E.makeNode(E.catalog().find(t=>t.category==='distributor'));
 n.mainBreaker.state='open'; n.outputs[0].breaker.state='tripped';
 p.nodes=[n]; const s=await setup(p); const before=s.state().project;
 s.$('btnEnableBreakers').click();
 const after=s.state();
 assert.equal(after.project.nodes[0].mainBreaker.state,'closed');
 assert.ok(after.project.nodes[0].outputs.every(v=>!v.breaker||v.breaker.state==='closed'));
 assert.equal(after.undo,1);
 s.$('btnEnableBreakers').click(); assert.equal(s.state().undo,1);
 s.key('KeyZ',{ctrlKey:true}); assert.deepEqual(s.state().project.nodes,before.nodes);
 s.dom.window.close();
});

test("кнопки портового и вводного автомата переключаются с Undo и не создают соединение",async()=>{
 const p=E.project(),n=E.makeNode(E.catalog().find(t=>t.category==='distributor'));n.mainBreaker.state='tripped';p.nodes=[n];const s=await setup(p);
 const find=main=>s.$('moduleLayer').querySelector('.portBreakerButton[data-main="'+main+'"]');
 find(false).click();s.flush();assert.equal(s.state().project.nodes[0].outputs[0].breaker.state,'open');assert.equal(s.state().project.links.length,0);
 s.key('KeyZ',{ctrlKey:true});s.flush();assert.equal(s.state().project.nodes[0].outputs[0].breaker.state,'closed');
 find(true).click();s.flush();assert.equal(s.state().project.nodes[0].mainBreaker.state,'closed');
 find(true).click();s.flush();assert.equal(s.state().project.nodes[0].mainBreaker.state,'open');
 s.dom.window.close();
});

test("плашки восстанавливаются после выхода модуля за viewport",async()=>{
 const p=E.project(),n=E.makeNode(E.catalog().find(t=>t.category==='distributor'),{x:400,y:300});p.nodes=[n];const s=await setup(p);
 const count=()=>s.$('moduleLayer').querySelectorAll('.portBreakerButton').length,expected=n.outputs.filter(v=>v.breaker).length+1;
 assert.equal(count(),expected);
 s.pointer('pointerdown',400,300,{button:1});s.pointer('pointermove',-10000,-10000);s.pointer('pointerup',-10000,-10000);s.flush();
 s.$('btnFit').click();s.flush();assert.equal(count(),expected);s.dom.window.close();
});
test('привязка перемещения к сетке и Undo', async()=>{
 const s=await setup(single()); s.$('btnSnap').click();
 s.pointer('pointerdown',400,300); s.pointer('pointermove',455,337); s.flush(); s.pointer('pointerup',455,337);
 const n=s.state().project.nodes[0]; assert.equal(n.pos.x%24,0); assert.equal(n.pos.y%24,0);
 s.$('btnUndo').click(); assert.equal(s.state().project.nodes[0].pos.x,400); s.dom.window.close();
});
test('режим срабатывания отключает перегруженный выход и сохраняется',async()=>{
 const p=E.project(),a=E.makeNode({name:'Ввод',category:'input',phases:1,inConnType:'euro',inA:16,outputs:[{connType:'euro',nominalA:16}]}),b=E.makeNode({name:'Нагрузка',category:'consumer',phases:1,inConnType:'euro',inA:16,watts:5000}); p.nodes=[a,b]; E.connect(p,{nodeId:a.id,portId:a.outputs[0].id,kind:'out'},{nodeId:b.id,portId:b.inputs[0].id,kind:'in'});
 const s=await setup(p); s.$('autoTrip').checked=true; s.$('autoTrip').dispatchEvent(new s.w.Event('change'));
 assert.equal(s.state().project.settings.autoTrip,true); assert.equal(s.state().project.nodes[0].outputs[0].breaker.state,'tripped');
 s.$('btnUndo').click(); assert.equal(s.state().project.nodes[0].outputs[0].breaker.state,'closed'); s.dom.window.close();
});
test('свойства сохраняют раскрытый порт и прокрутку после переключения автомата', async()=>{
 const p=E.project(),n=E.makeNode(E.catalog().find(t=>t.category==='distributor'),{x:400,y:350});p.nodes=[n];const s=await setup(p);
 s.pointer('pointerdown',400,300);s.pointer('pointerup',400,300);
 const section=[...s.$('propsBody').querySelectorAll('details.portProps')].find(d=>d.querySelector('.breakerBox'));
 section.open=true; const id=section.dataset.portId;s.$('propsScroll').scrollTop=150;
 section.querySelector('.breakerBox button').click();
 const next=[...s.$('propsBody').querySelectorAll('details.portProps')].find(d=>d.dataset.portId===id);
 assert.equal(next.open,true);assert.equal(s.$('propsScroll').scrollTop,150);
 assert.equal(s.state().project.nodes[0].outputs.find(v=>v.id===id).breaker.state,'open');s.dom.window.close();
});
test('уведомление перегрузки показывает фазы и источник; клик выбирает узел',async()=>{
 const p=E.project(),a=E.makeNode({name:'Ввод',category:'input',phases:1,inConnType:'euro',inA:16,outputs:[{connType:'euro',nominalA:16}]}),b=E.makeNode({name:'Причина',category:'consumer',phases:1,inConnType:'euro',inA:16,watts:5000},{x:800,y:400});p.nodes=[a,b];E.connect(p,{nodeId:a.id,portId:a.outputs[0].id,kind:'out'},{nodeId:b.id,portId:b.inputs[0].id,kind:'in'});
 const s=await setup(p);assert.match(s.$('toastMsg').textContent,/Перегрузка на фазе: L1/);assert.equal(s.$('toastMsg').querySelectorAll('button').length,1);s.$('toastMsg').querySelector('button').click();assert.deepEqual(s.state().selection,[b.id]);assert.ok(s.state().project.view.zoom >= 1);s.dom.window.close();
});
test('импульс имеет один центр и два обхода контура вышестоящей ноды',async()=>{
 const p=E.project(),a=E.makeNode({name:'Ввод',category:'input',phases:1,inConnType:'euro',inA:16,outputs:[{connType:'euro',nominalA:16}]},{x:200,y:350}),b=E.makeNode({name:'Нагрузка',category:'consumer',phases:1,inConnType:'euro',inA:16,watts:5000},{x:700,y:350});p.nodes=[a,b];E.connect(p,{nodeId:a.id,portId:a.outputs[0].id,kind:'out'},{nodeId:b.id,portId:b.inputs[0].id,kind:'in'});const s=await setup(p);
 assert.equal(s.w.document.querySelectorAll('.overload-origin-pulse').length,8);
 assert.equal(s.w.document.querySelectorAll('.overload-contour-wave').length,2);
 const halves=[...s.w.document.querySelectorAll('.overload-contour-wave')];assert.notEqual(halves[0].getAttribute('d'),halves[1].getAttribute('d'));s.dom.window.close();
});
test('уведомление остаётся до устранения перегрузки и исчезает после отключения',async()=>{
 const p=E.project(),a=E.makeNode({name:'Ввод',category:'input',phases:1,inConnType:'euro',inA:16,outputs:[{connType:'euro',nominalA:16}]},{x:200,y:350}),b=E.makeNode({name:'Нагрузка',category:'consumer',phases:1,inConnType:'euro',inA:16,watts:5000},{x:700,y:350});p.nodes=[a,b];E.connect(p,{nodeId:a.id,portId:a.outputs[0].id,kind:'out'},{nodeId:b.id,portId:b.inputs[0].id,kind:'in'});const s=await setup(p);
 assert.equal(s.$('toast').dataset.kind,'overload');s.$('btnSave').click();assert.equal(s.$('toast').dataset.kind,'overload');assert.equal(s.$('toast').style.display,'block');s.$('btnTrip').click();assert.notEqual(s.$('toast').dataset.kind,'overload');assert.equal(s.$('toastMsg').querySelector('.overloadSourceLink'),null);s.dom.window.close();
});
test("импорт каталога принимает экспортированные шаблоны и пропускает повторы", async () => {
  const s = await setup(single());
  const template = {...E.catalog()[0], id:"custom-import-test", name:"Импортный шаблон"};
  const input = s.$("fileImportTemplates");
  let contents = JSON.stringify([template]);
  Object.defineProperty(input, "files", {value:[{size:contents.length, text:async () => contents}]});
  const importFile = async () => {
    input.dispatchEvent(new s.w.Event("change"));
    await new Promise(resolve => setImmediate(resolve));
  };
  await importFile();
  await importFile();
  const saved = JSON.parse(s.w.localStorage.getItem("electriccad.templates.v32"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, template.name);
  assert.equal(s.$("btnExportTemplates").disabled, false);
  const {outputs, ...invalid} = template;
  contents = JSON.stringify([{...invalid, name:"Неполный потребитель", category:"consumer", outputs:[null]}]);
  await importFile();
  assert.deepEqual(JSON.parse(s.w.localStorage.getItem("electriccad.templates.v32")), saved);
  s.dom.window.close();
});
test("продвинутый режим добавляет резервный ввод из свойств дистрибьютора", async () => {
  const p = E.project();
  p.settings.advancedMode = true;
  const n = E.makeNode(E.catalog().find(t => t.category === "distributor"), {x:400, y:350});
  p.nodes = [n];
  const s = await setup(p);
  s.pointer("pointerdown", 400, 300);
  s.pointer("pointerup", 400, 300);
  const add = [...s.$("propsBody").querySelectorAll("button")].find(b => b.textContent.includes("Добавить резервный ввод"));
  assert.ok(add);
  add.click();
  assert.equal(s.state().project.nodes[0].inputs.length, 2);
  assert.ok(s.state().project.nodes[0].transfer);
  s.dom.window.close();
});
test("длина кабеля включает расчёт и плашку без ручного задания профиля", async () => {
  const p = E.project();
  p.settings.advancedMode = true;
  const source = E.makeNode({name:"Ввод", category:"input", phases:1, inConnType:"cee1", inA:32,
    outputs:[{connType:"cee1", nominalA:32}]}, {x:220,y:350});
  const load = E.makeNode({name:"Нагрузка", category:"consumer", phases:1, inConnType:"cee1", inA:32,
    watts:2300}, {x:760,y:350});
  p.nodes = [source, load];
  const link = E.connect(p, {nodeId:source.id, portId:source.outputs[0].id, kind:"out"},
    {nodeId:load.id, portId:load.inputs[0].id, kind:"in"});
  link.cable = {lengthM:30};
  const profile = E.cableParameters(link, source.outputs[0], load.inputs[0]);
  assert.equal(profile.ampacityA, 32);
  assert.equal(profile.sectionMm2, 10);
  const s = await setup(p);
  const labels = [...s.w.document.querySelectorAll(".cableMetricLabel")];
  assert.equal(labels.length, 1);
  for (const label of labels) {
    assert.match(label.textContent, /30 м · ΔUф 1,42 В · ΔP 14,22 Вт/);
    assert.doesNotMatch(label.getAttribute("transform"), /rotate/);
  }
  assert.ok(labels[0].querySelector(".cableLabelLeader"));
  assert.equal(labels[0].querySelector("rect").getAttribute("height"), "26");
  const dialog = s.$("cableLengthDialog");
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  s.w.document.querySelector(".cableHitArea").dispatchEvent(new s.w.MouseEvent("dblclick", {bubbles:true}));
  assert.ok(dialog.open);
  assert.equal(s.$("cableLengthInput").value, "30");
  s.$("cableLengthInput").value = "40";
  s.$("cableLengthForm").dispatchEvent(new s.w.Event("submit", {bubbles:true,cancelable:true}));
  assert.equal(s.state().project.links[0].cable.lengthM, 40);
  assert.equal(dialog.open, false);
  const drag = (type, clientX) => {
    const event = new s.w.Event(type, {bubbles:true,cancelable:true});
    Object.assign(event, {button:0,pointerId:1,clientX,clientY:350});
    labels[0].dispatchEvent(event);
  };
  labels[0].setPointerCapture = () => {};
  drag("pointerdown",490);
  drag("pointermove",640);
  drag("pointerup",640);
  assert.ok(s.state().project.links[0].cable.labelFraction > .5);
  const settings = s.$("cableSettingsDialog");
  settings.showModal = () => settings.setAttribute("open", "");
  settings.close = () => settings.removeAttribute("open");
  labels[0].dispatchEvent(new s.w.MouseEvent("contextmenu", {bubbles:true,cancelable:true}));
  assert.ok(settings.open);
  assert.match(settings.querySelector(".cableProfileHelp").textContent, /10 мм², 32 А.*На 100 м/);
  const section = [...settings.querySelectorAll("label")].find(label => label.textContent.includes("Сечение жилы"));
  section.querySelector("input").value = "10";
  section.querySelector("input").dispatchEvent(new s.w.Event("change"));
  assert.equal(s.state().project.links[0].cable.sectionMm2, 10);
  [...settings.querySelectorAll("button")].find(button => button.textContent === "Сбросить профиль кабеля").click();
  const reset = s.state().project.links[0].cable;
  assert.equal(reset.sectionMm2, undefined);
  assert.equal(reset.lengthM, 40);
  assert.ok(reset.labelFraction > .5);
  const length = [...settings.querySelectorAll("label")].find(label => label.textContent === "Длина, м");
  length.querySelector("input").value = "100000";
  length.querySelector("input").dispatchEvent(new s.w.Event("change"));
  assert.equal(s.state().project.links[0].cable.lengthM, reset.lengthM);
  const correctedLength = [...settings.querySelectorAll("label")].find(label => label.textContent === "Длина, м").querySelector("input");
  correctedLength.value = "4000";
  correctedLength.dispatchEvent(new s.w.Event("change"));
  const warning = settings.querySelector("#cableSettingsBody .cableWarning");
  assert.match(warning.textContent, /допустимая длина участка/);
  assert.match(warning.textContent, /Увеличьте сечение/);
  s.flush();
  assert.ok(s.w.document.querySelector(".cableMetricWarning"));
  s.dom.window.close();
});

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  E = require("../engine"),
  R = require("../renderer");
const S = require("../schematic");
function exporter() {
  const scope = {
    ElectricEngine: E,
    ElectricRender: R,
    ElectricSchematic: S,
    window: {
      jspdf: require("jspdf"),
      ElectricGostFont: fs
        .readFileSync(
          require("node:path").join(
            __dirname,
            "../fonts/opengost/OpenGOSTtypeA-Regular.ttf",
          ),
        )
        .toString("base64"),
    },
    document: {
      createElement() {
        return {
          getContext() {
            return new Proxy(
              { measureText: (s) => ({ width: String(s).length * 5 }) },
              { get: (o, k) => o[k] || (() => {}) },
            );
          },
        };
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../schematic.js"),
      "utf8",
    ),
    scope,
  );
  vm.runInNewContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../sheet.js"),
      "utf8",
    ),
    scope,
  );
  vm.runInNewContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../export.js"),
      "utf8",
    ),
    scope,
  );
  return scope.window.ElectricExport;
}
test("экспорт охватывает схему вдали от начала координат и не зависит от камеры", () => {
  const X = exporter(),
    p = E.project();
  p.nodes = [
    E.makeNode(
      {
        name: "Длинное название",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: 50000, y: -50000 },
    ),
  ];
  const before = JSON.stringify(p),
    a = X.render(p, new Map());
  assert.equal(JSON.stringify(p), before);
  assert.ok(a.width >= 1600);
  assert.ok(a.height > 500);
  p.view = { panX: 100000, panY: -100000, zoom: 0.1 };
  const b = X.render(p, new Map());
  assert.equal(b.width, a.width);
  assert.equal(b.height, a.height);
});
test("экспорт ограничивает размер растровой схемы и допускает пустой проект", () => {
  const X = exporter(),
    p = E.project();
  const empty = X.render(p, new Map());
  assert.ok(empty.width > 0 && empty.height > 0);
  const image = X.render(
    p,
    new Map([
      [
        "route",
        [
          { x: -100000, y: -100000 },
          { x: 100000, y: 100000 },
        ],
      ],
    ]),
  );
  assert.ok(image.width <= 12000 && image.height <= 12000);
  assert.ok(image.width * image.height < 24010000);
});
function twoBranches() {
  const p = E.project();
  p.nodes = [1, 2].map((i) =>
    E.makeNode({
      name: "Нагрузка " + i,
      category: "consumer",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      watts: 1000,
    }),
  );
  return p;
}
test("рамка и штамп имеют физические размеры ЕСКД и не сужаются при масштабе 50%", () => {
  const X = exporter(),
    p = twoBranches(),
    mm = 72 / 25.4;
  for (const paper of ["a4", "a3", "a2"])
    for (const orientation of ["portrait", "landscape"]) {
      const full = X.plans(p, { paper, orientation, scale: 100 })[0],
        half = X.plans(p, { paper, orientation, scale: 50 })[0],
        f = full.sheet.frame,
        b = full.sheet.stamp;
      assert.deepEqual(full.sheet, half.sheet);
      assert.equal(half.scale, full.scale / 2);
      assert.ok(Math.abs(f.x - 20 * mm) < 1e-8);
      assert.ok(Math.abs(f.y - 5 * mm) < 1e-8);
      assert.ok(Math.abs(full.pw - f.x - f.w - 5 * mm) < 1e-8);
      assert.ok(Math.abs(full.ph - f.y - f.h - 5 * mm) < 1e-8);
      assert.ok(Math.abs(b.w - 185 * mm) < 1e-8);
      assert.ok(Math.abs(b.h - 55 * mm) < 1e-8);
      assert.ok(Math.abs(b.x + b.w - (f.x + f.w)) < 1e-8);
      assert.ok(Math.abs(b.y + b.h - (f.y + f.h)) < 1e-8);
      const notes = full.sheet.notes,
        drawing = full.sheet.drawing;
      assert.ok(drawing.y + drawing.h <= Math.min(notes.y, b.y));
      assert.ok(notes.x + notes.w <= f.x + f.w + 1e-8);
      if (paper === "a4") assert.ok(full.ph > full.pw);
    }
});
test("ветки разделяются на страницы, ориентация и масштаб сохраняют пропорции", () => {
  const X = exporter(),
    p = twoBranches();
  assert.equal(X.plans(p).length, 1);
  const list = X.plans(p, {
    separateBranches: true,
    orientation: "portrait",
    paper: "a4",
  });
  assert.equal(list.length, 2);
  assert.equal(list[1].options.branchNumber, 2);
  assert.ok(list[0].pw < list[0].ph);
  const full = X.plans(p, { scale: 100 })[0],
    half = X.plans(p, { scale: 50 })[0];
  assert.equal(half.scale, full.scale / 2);
  assert.ok(full.pw > full.ph);
});
test("PDF векторный, содержит встроенный OpenGOST и две страницы без растровых изображений", async () => {
  const X = exporter(),
    blob = X.pdf(twoBranches(), {
      separateBranches: true,
      paper: "a4",
      orientation: "portrait",
    }),
    bytes = Buffer.from(await blob.arrayBuffer()),
    text = bytes.toString("latin1");
  assert.ok(text.startsWith("%PDF-"));
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.ok(text.includes("/FontFile2"));
  assert.ok(text.includes("/ToUnicode"));
  assert.equal(text.includes("/Subtype /Image"), false);
  const box = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(box && Number(box[1]) < Number(box[2]));
});

test("для полной базовой схемы авто выбирает A0 и сохраняет горизонтальную раскладку",()=>{
 const plan=exporter().plans(require('../default-project.json'),{paper:'auto'})[0];
 assert.ok(Math.abs(plan.pw-1189*72/25.4)<0.01);
 assert.ok(plan.size.width*plan.scale<=plan.sheet.drawing.w+1e-8);
});

test("примечания 5:4 с равными отступами; книжный лист меняет раскладку",()=>{
 const X=exporter(),p=require('../default-project.json'),mm=72/25.4;
 const portrait=X.plans(p,{paper:'a0',orientation:'portrait'})[0],landscape=X.plans(p,{paper:'a0',orientation:'landscape'})[0];
 for(const page of [portrait,landscape]){
 const {notes:n,frame:f}=page.sheet;
 assert.ok(Math.abs(n.w/n.h-1.25)<1e-8);
 assert.ok(Math.abs(n.x-f.x-5*mm)<1e-8);
 assert.ok(Math.abs(f.y+f.h-n.y-n.h-5*mm)<1e-8);
 assert.ok(n.w<=125*mm+1e-8);
 }
 assert.ok(portrait.size.width<=landscape.size.width);
 assert.ok(portrait.size.height>=landscape.size.height);
});

test("ползунок компоновки меняет размещение, масштаб сохраняет рамку",()=>{
 const X=exporter(),p=require('../default-project.json');
 const vertical=X.plans(p,{layoutBalance:25})[0],horizontal=X.plans(p,{layoutBalance:200})[0];
 assert.ok(vertical.size.width<horizontal.size.width);
 const half=X.plans(p,{scale:50})[0],full=X.plans(p,{scale:100})[0];assert.equal(half.scale,full.scale/2);
 assert.deepEqual(half.sheet,full.sheet);
});

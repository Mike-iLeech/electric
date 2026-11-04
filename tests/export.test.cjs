const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  E = require("../engine"),
  R = require("../renderer");
const S = require("../schematic");
const Sheet = require("../sheet");
test("редактируемые данные основной надписи выводятся на листе", () => {
  const p = E.project();
  Object.assign(p.meta, {drawingTitle:"Вводной щит", designation:"ЩР-01", designer:"Иванов", drawingDate:"2026-11-03"});
  const plan = exporter().plans(p, {paper:"a3", orientation:"landscape"})[0];
  const printed = [];
  const canvas = new Proxy({measureText: value => ({width:String(value).length * 2}), fillText: value => printed.push(String(value))},
    {get: (target, key) => key in target ? target[key] : () => {}});
  Sheet.draw(plan, canvas);
  for (const value of ["Вводной щит", "ЩР-01", "Иванов", "03.11.2026"]) assert.ok(printed.includes(value), value);
});
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
      assert.equal(full.ph > full.pw, orientation === "portrait");
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
  assert.equal(list[1].options.branchNumber, null);
  assert.equal(list[1].options.withoutSupply, true);
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

test("на A4 блок примечаний и его текст пропорционально меньше, чем на A3", () => {
  const X = exporter(), p = E.project();
  const a4 = X.plans(p, {paper:"a4", orientation:"portrait"})[0];
  const a3 = X.plans(p, {paper:"a3", orientation:"landscape"})[0];
  const ratio = (210 / 297) ** 2;
  assert.ok(Math.abs(a4.sheet.notes.w / a3.sheet.notes.w - ratio) < 1e-8);
  assert.ok(Math.abs(a4.sheet.notes.h / a3.sheet.notes.h - ratio) < 1e-8);
  const fontSize = plan => {
    const fonts = [];
    const ctx = new Proxy({measureText: value => ({width:String(value).length}), fillText(value) {
      if (String(value).startsWith("ПОЯСНЕНИЯ")) fonts.push(parseFloat(ctx.font));
    }}, {get: (target, key) => key in target ? target[key] : () => {}});
    Sheet.draw(plan, ctx);
    return fonts[0];
  };
  assert.ok(Math.abs(fontSize(a4) / fontSize(a3) - ratio) < 1e-8);
  assert.ok(a4.sheet.drawing.y + a4.sheet.drawing.h <= a4.sheet.notes.y + 1e-8);
  const landscape = X.plans(p, {paper:"a4", orientation:"landscape"})[0];
  const {notes, stamp, drawing} = landscape.sheet;
  assert.ok(landscape.pw > landscape.ph);
  assert.ok(notes.x + notes.w <= stamp.x);
  assert.ok(drawing.y + drawing.h <= Math.min(notes.y, stamp.y) + 1e-8);
});

test("ползунок компоновки меняет размещение, масштаб сохраняет рамку",()=>{
 const X=exporter(),p=require('../default-project.json');
 const vertical=X.plans(p,{layoutBalance:25})[0],horizontal=X.plans(p,{layoutBalance:200})[0];
 assert.ok(vertical.size.width<horizontal.size.width);
 const half=X.plans(p,{scale:50})[0],full=X.plans(p,{scale:100})[0];assert.equal(half.scale,full.scale/2);
 assert.deepEqual(half.sheet,full.sheet);
});

test("короткая таблица журнала остаётся в одном столбце на A4–A0", () => {
  const p = require('../default-project.json');
  const cables = [...S.cableRows(p).values()].slice(0,7);
  for (const paper of ['a4','a3','a2','a1','a0']) {
    const plan = exporter().plans(p,{paper,cableJournal:true}) .find(page => page.journal);
    const printed=[];
    const context = new Proxy({measureText:value=>({width:String(value).length*5}),fillText:value=>printed.push(String(value))}, {get:(target,key)=>key in target?target[key]:()=>{}});
    const width=Sheet.journalWidths(cables,context).reduce((a,b)=>a+b,0);
    const height=(50+20*cables.length)*Math.min(1,plan.sheet.drawing.w/width)+1;
    plan.journalTables=[{rows:cables,number:1,offset:0,height}];
    Sheet.draw(plan,context);
    assert.equal(printed.filter(value=>value==='№ трассы').length,1,paper);
  }
});

test("мировые параметры кабеля применяются в расчётах с приоритетом индивидуальных", () => {
 const settings={cableDefaults:{material:'al',ambientC:35,maxDropPercent:3,thermalResistance:2}};
 const port={nominalA:16};
 const cable=E.cableParameters({cable:{lengthM:10,ambientC:25}},port,port,settings);
 assert.equal(cable.material,'al');assert.equal(cable.ambientC,25);assert.equal(cable.maxDropPercent,3);assert.equal(cable.thermalResistance,2);
 assert.ok(E.cableEstimate(cable,1,{L1:10}).lossW > E.cableEstimate({...cable,material:'cu'},1,{L1:10}).lossW);
});

test('импорт отвергает некорректные мировые параметры кабелей',()=>{
 for(const defaults of [null,[],true,'x',12,{sectionMm2:-1},{ampacityA:0},{lengthM:100}]){
  const p=E.project();p.settings.cableDefaults=defaults;assert.throws(()=>E.validate(p));
 }
});

test('cos φ повышает ток при той же мощности и снижает доступную активную мощность',()=>{
 const p=E.project();const source=E.makeNode(E.catalog().find(n=>n.category==='input'));
 const load=E.makeNode(E.catalog().find(n=>n.category==='consumer'));
 p.nodes=[source,load];
 // A standalone load still has demand current independent of whether it is powered.
 p.settings.powerFactor=1;const first=E.calculate(p);
 p.settings.powerFactor=.5;E.validate(p);const second=E.calculate(p);
 assert.equal(E.sum(second.nodes.get(load.id).demandA),E.sum(first.nodes.get(load.id).demandA)*2);
 assert.equal(second.nodes.get(source.id).availableWatts,first.nodes.get(source.id).availableWatts/2);
 for(const value of [0,1.1,NaN]){p.settings.powerFactor=value;assert.throws(()=>E.validate(p));}
});

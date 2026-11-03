const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../engine"),
  R = require("../renderer");
test("порт 250А не мигает при перегрузке входа 16А на другом конце линии", () => {
  const p = E.project(),
    a = E.makeNode({
      name: "250",
      category: "input",
      phases: 3,
      inConnType: "terminal3",
      inA: 250,
      outputs: [{ connType: "terminal3", nominalA: 250 }],
    }),
    b = E.makeNode({
      name: "16",
      category: "consumer",
      phases: 3,
      inConnType: "terminal3",
      inA: 16,
      watts: 13500,
    });
  p.nodes = [a, b];
  E.connect(
    p,
    { nodeId: a.id, portId: a.outputs[0].id, kind: "out" },
    { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
  );
  const calc = E.calculate(p),
    alerts = R.overloadAlerts(p, calc);
  assert.equal(calc.nodes.get(a.id).overload, false);
  assert.equal(alerts.links.has(p.links[0].id), true);
  assert.equal(alerts.ports.has(a.id), false);
  assert.equal(alerts.ports.get(b.id).has(b.inputs[0].id), true);
});
test("перегрузка выхода 32А не подсвечивает исправную линию 63А выше", () => {
  const p = E.project();
  const a = E.makeNode({
    name: "125",
    category: "input",
    phases: 3,
    inA: 125,
    outputs: [{ connType: "cee3", nominalA: 63 }],
  });
  const b = E.makeNode({
    name: "63",
    category: "distributor",
    phases: 3,
    inConnType: "cee3",
    inA: 63,
    outputs: [{ connType: "cee3", nominalA: 32 }],
  });
  const c = E.makeNode({
    name: "Load",
    category: "consumer",
    phases: 3,
    inConnType: "cee3",
    inA: 32,
    watts: 30000,
  });
  p.nodes = [a, b, c];
  for (const [from, to] of [
    [a, b],
    [b, c],
  ])
    E.connect(
      p,
      { nodeId: from.id, portId: from.outputs[0].id, kind: "out" },
      { nodeId: to.id, portId: to.inputs[0].id, kind: "in" },
    );
  const calc = E.calculate(p),
    alerts = R.overloadAlerts(p, calc);
  assert.equal(calc.nodes.get(a.id).overload, false);
  assert.equal(calc.nodes.get(b.id).overload, true);
  assert.equal(alerts.links.has(p.links[0].id), false);
  assert.equal(alerts.links.has(p.links[1].id), true);
  assert.equal(alerts.ports.has(a.id), false);
  assert.equal(alerts.ports.get(b.id).has(b.inputs[0].id), false);
  assert.equal(alerts.ports.get(b.id).has(b.outputs[0].id), true);
});
test("цвета и капсулы соответствуют исходному дизайну v31", () => {
  for (const [category, conn, shield, color] of [
    ["input", "cee3", true, "#ffffff"],
    ["input", "cee3", false, "#ef4444"],
    ["input", "cee1", false, "#1e40af"],
    ["input", "euro", false, "#FFFACD"],
    ["distributor", "cee3", false, "#a3a11e"],
    ["extender", "euro", false, "#14532d"],
    ["consumer", "euro", false, "#0b2a63"],
  ]) {
    const n = E.makeNode({
      name: "Тест",
      category,
      inConnType: conn,
      phases: E.CONNECTORS[conn].phases,
      inA: 16,
      outputs: [{ connType: conn, nominalA: 16 }],
      shield,
    });
    assert.equal(R.fill(n), color);
    assert.equal(E.rect(n).right - E.rect(n).left, E.nodeWidth(n));
  }
});
test("пины рисуются после капсул и текста", () => {
  const n = E.makeNode(E.catalog().find((t) => t.category === "distributor")),
    p = E.project();
  p.nodes = [n];
  const calls = [],
    ctx = new Proxy(
      { measureText: (s) => ({ width: s.length * 5.5 }) },
      {
        get: (o, k) =>
          k in o ? o[k] : (...args) => calls.push({ method: k, args }),
      },
    );
  R.paintNode(ctx, n, E.calculate(p).nodes.get(n.id), {
    project: p,
    selected: false,
    hover: null,
    pendingPort: null,
  });
  const firstPin = calls.findIndex((c) => c.method === "arc"),
    lastText = calls.findLastIndex((c) => c.method === "fillText");
  assert.ok(firstPin > lastText);
  assert.equal(
    calls.filter((c) => c.method === "arc").length,
    n.inputs.length + n.outputs.length,
  );
});
test("геометрия капсулы порта совпадает с областью попадания и пином", () => {
  const n = E.makeNode(
    E.catalog().find(
      (t) => t.category === "distributor" && t.outputs.length === 6,
    ),
  );
  for (const v of [...n.inputs, ...n.outputs]) {
    const g = R.portGeometry(n, v);
    assert.deepEqual(g.at, E.portPosition(n, v));
    assert.ok(g.left < g.at.x && g.right > g.at.x);
    assert.equal(g.bottom - g.top, 26);
    assert.ok(g.w >= 80 && g.w <= 220);
  }
});
test("пересечения проводов получают дуги, касание конца не считается пересечением", () => {
  const paths = new Map([
      [
        "a",
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
      [
        "b",
        [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      ],
      [
        "c",
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      ],
    ]),
    r = R.crossings(paths);
  assert.equal(r.get("a").hits.length, 0);
  assert.deepEqual(r.get("b").hits, [{ segment: 1, x: 50, y: 50, radius: 5 }]);
  assert.equal(r.get("c").hits.length, 0);
  const ops = [],
    ctx = new Proxy(
      {},
      {
        get:
          (_, k) =>
          (...args) =>
            ops.push([k, ...args]),
      },
    );
  R.trace(ctx, r.get("b").points, r.get("b").hits);
  assert.equal(ops.filter((op) => op[0] === "bezierCurveTo").length, 1);
});
test("маршруты идут раздельно с зазором вместо общей линии", () => {
  const p = E.project(),
    source = E.makeNode(
      {
        name: "D",
        category: "distributor",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        outputs: Array.from({ length: 5 }, () => ({
          connType: "euro",
          nominalA: 16,
        })),
      },
      { x: 0, y: 0 },
    );
  p.nodes.push(source);
  for (let i = 0; i < 5; i++) {
    const c = E.makeNode(
      {
        name: "C" + i,
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: 900, y: (i - 2) * 350 },
    );
    p.nodes.push(c);
    E.connect(
      p,
      { nodeId: source.id, portId: source.outputs[i].id, kind: "out" },
      { nodeId: c.id, portId: c.inputs[0].id, kind: "in" },
    );
  }
  const reserved = [];
  for (const link of p.links) {
    const route = R.simplify(E.routeWire(p, link, reserved));
    assert.ok(route.length > 0, link.id);
    for (const old of reserved)
      for (let i = 1; i < route.length; i++)
        for (let j = 1; j < old.length; j++) {
          const a = route[i - 1],
            b = route[i],
            c = old[j - 1],
            d = old[j];
          let overlap = 0,
            distance = Infinity;
          if (a.x === b.x && c.x === d.x) {
            distance = Math.abs(a.x - c.x);
            overlap =
              Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
              Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
          } else if (a.y === b.y && c.y === d.y) {
            distance = Math.abs(a.y - c.y);
            overlap =
              Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
              Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
          }
          assert.ok(
            overlap <= 0 || distance >= 12 - 1e-6,
            JSON.stringify({ a, b, c, d, distance }),
          );
        }
    reserved.push(route);
  }
});
test("каталог содержит все запрошенные ветви и переходы с голых концов", () => {
  const rows = E.catalog(),
    paths = rows.map((t) => E.catalogPath(t).join("/"));
  for (const branch of [
    "Вводы/Щиты/С розеткой/Трёхфазные",
    "Вводы/Щиты/С розеткой/Однофазные/CEE",
    "Вводы/Щиты/С розеткой/Однофазные/Shuko",
    "Вводы/Щиты/С автоматом (клеммный ввод)/Трёхфазные",
    "Вводы/Щиты/С автоматом (клеммный ввод)/Однофазные",
    "Вводы/Розетки/Трёхфазные",
    "Вводы/Розетки/Однофазные/CEE",
    "Вводы/Розетки/Однофазные/Shuko",
    "Дистрибьюторы",
    "Переходные коробки и кабели",
    "Удлинители/CEE → SHUKO ×5",
    "Удлинители/SHUKO → SHUKO ×5",
    "Удлинители/Powercon → SHUKO ×5",
    "Потребители/Трёхфазные/CEE",
  ])
    assert.ok(
      paths.some((p) => p.startsWith(branch)),
      branch,
    );
  assert.ok(
    rows.some(
      (t) =>
        t.transition &&
        t.inConnType === "terminal1" &&
        t.outputs[0].connType === "euro",
    ),
  );
  for (const row of rows) {
    const p = E.project();
    p.nodes = [E.makeNode(row)];
    E.validate(p);
  }
});
test("все шаблоны и максимальный модуль: номенклатура внутри капсул, подписи автоматов не касаются следующего порта", () => {
  const custom = {
    name: "W".repeat(160),
    category: "distributor",
    phases: 3,
    inConnType: "terminal3",
    inA: 250,
    outputs: Array.from({ length: 32 }, (_, i) => ({
      connType: "terminal1",
      nominalA: 250,
      phase: E.PHASES[i % 3],
    })),
  };
  for (const tpl of [...E.catalog(), custom]) {
    const p = E.project(),
      n = E.makeNode(tpl);
    p.nodes = [n];
    E.validate(p);
    const r = E.rect(n),
      texts = [];
    const base = {
      font: "10px monospace",
      textAlign: "center",
      measureText(s) {
        const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10);
        return { width: String(s).length * size * 0.6 };
      },
      fillText(s, x, y) {
        const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10),
          w = this.measureText(s).width,
          left =
            this.textAlign === "center"
              ? x - w / 2
              : this.textAlign === "right"
                ? x - w
                : x;
        texts.push({
          s,
          left,
          right: left + w,
          top: y - size / 2,
          bottom: y + size / 2,
        });
      },
    };
    const ctx = new Proxy(base, { get: (o, k) => (k in o ? o[k] : () => {}) });
    R.paintNode(ctx, n, E.calculate(p).nodes.get(n.id), {
      project: p,
      selected: false,
    });
    if (tpl !== custom)
      E.nomenclature(n, {connectors:true,compactConnectors:true})
        .split(" | ")
        .forEach((part, i) =>
          assert.equal(texts[i].s, part.replaceAll(" -> ", " → "), "Полная номенклатура: " + n.name),
        );
    assert.ok(!texts.some(t => ["ДИСТРИБЬЮТОР","ПОТРЕБИТЕЛЬ","ИСТОЧНИК","ЩИТ","УДЛИНИТЕЛЬ","ПЕРЕХОД"].includes(t.s)), "Нет дублирующей плашки типа");
    for (const t of texts)
      assert.ok(
        t.left >= r.left &&
          t.right <= r.right &&
          t.top >= r.top &&
          t.bottom <= r.bottom,
        tpl.name + ": " + t.s,
      );
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++)
        assert.ok(
          !E.overlaps(texts[i], texts[j], 0),
          tpl.name + ": " + texts[i].s + " / " + texts[j].s,
        );
    for (let i = 1; i < n.outputs.length; i++) {
      const a = R.portGeometry(n, n.outputs[i - 1]),
        b = R.portGeometry(n, n.outputs[i]);
      assert.ok(a.bottom + 12 < b.top, tpl.name);
    }
  }
});

test("плашки автоматов внутри модулей, слева от сокетов и без пересечений",()=>{
 for(const t of E.catalog()){
 const n=E.makeNode(t),r=E.rect(n),buttons=R.breakerButtons(n),ports=[...n.inputs,...n.outputs].map(v=>R.portGeometry(n,v));
 const rects=[...buttons.map(b=>({left:b.left,right:b.left+b.w,top:b.top,bottom:b.top+b.h})),...ports];
 for(const b of buttons){assert.ok(b.left>=r.left&&b.left+b.w<=r.right&&b.top>=r.top&&b.top+b.h<=r.bottom,t.name);const g=R.portGeometry(n,[...n.inputs,...n.outputs].find(v=>v.id===b.portId));assert.ok(n.inputs.some(v=>v.id===b.portId)?b.left>g.right:b.left+b.w<g.left);assert.equal(b.top,g.top);assert.equal(b.h,g.bottom-g.top);}
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,t.name);}
 }
});

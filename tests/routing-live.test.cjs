const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../engine"),
  Q = require("../routing"),
  R = require("../renderer");
function fixture() {
  const p = E.project(),
    d = E.makeNode(
      {
        name: "D",
        category: "distributor",
        phases: 3,
        inA: 32,
        outputs: Array.from({ length: 6 }, (_, i) => ({
          connType: "euro",
          nominalA: 16,
          phase: E.PHASES[Math.floor(i / 2)],
        })),
      },
      { x: 0, y: 0 },
    );
  p.nodes.push(d);
  for (const [i, y] of [-1000, -650, -300, 50, 400, 750].entries()) {
    const c = E.makeNode(
      {
        name: "C" + i,
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1000,
      },
      { x: 2200, y },
    );
    p.nodes.push(c);
    E.connect(
      p,
      { nodeId: d.id, portId: d.outputs[i].id, kind: "out" },
      { nodeId: c.id, portId: c.inputs[0].id, kind: "in" },
    );
  }
  return p;
}
test("пучок как на скриншоте идёт по общему коридору, соседние дорожки через 12", () => {
  const p = fixture(),
    routes = Q.routeConnections(p);
  assert.equal([...routes.values()].filter((v) => v.length).length, 6);
  const upper = p.links.slice(0, 3).map((l) => routes.get(l.id));
  const main = upper.map(
    (path) =>
      Q.segments(path)
        .filter((s) => s.h)
        .sort((a, b) => Math.abs(b.b.x - b.a.x) - Math.abs(a.b.x - a.a.x))[0],
  );
  assert.ok(main.every((s) => Math.abs(s.b.x - s.a.x) > 1700));
  assert.equal(main[1].a.y - main[0].a.y, 12);
  assert.equal(main[2].a.y - main[1].a.y, 12);
  for (const l of p.links)
    assert.ok(
      Q.valid(
        p,
        l,
        routes.get(l.id),
        [...routes].filter(([id]) => id !== l.id).map(([, p]) => p),
      ),
    );
});
test("порядок создания связей не влияет на маршруты", () => {
  const p = fixture(),
    a = Q.routeConnections(p);
  p.links.reverse();
  const b = Q.routeConnections(p);
  for (const [id, path] of a) assert.deepEqual(b.get(id), path);
});
test("перенос конца обновляет связанные пути и сохраняет остальные", () => {
  const p = fixture(),
    before = Q.routeConnections(p),
    moved = p.nodes[1];
  moved.pos.x += 80;
  moved.pos.y -= 40;
  const dirty = Q.affectedByMove(p, [moved.id], before),
    after = Q.routeConnections(p, before, dirty);
  assert.equal(dirty.size, 1);
  for (const l of p.links) {
    assert.ok(after.get(l.id).length);
    if (dirty.has(l.id)) {
      assert.notDeepEqual(after.get(l.id), before.get(l.id));
      const port = moved.inputs[0];
      assert.deepEqual(after.get(l.id).at(-1), E.portPosition(moved, port));
    } else assert.equal(after.get(l.id), before.get(l.id));
  }
});
test("неподключённый модуль перестраивает перекрытые линии", () => {
  const p = fixture(),
    before = Q.routeConnections(p),
    wire = before.get(p.links[0].id),
    long = Q.segments(wire)
      .filter((s) => s.h)
      .sort((a, b) => Math.abs(b.b.x - b.a.x) - Math.abs(a.b.x - a.a.x))[0],
    ob = E.makeNode(
      {
        name: "Obstacle",
        category: "consumer",
        phases: 1,
        inConnType: "euro",
        inA: 16,
        watts: 1,
      },
      { x: (long.a.x + long.b.x) / 2, y: long.a.y },
    );
  p.nodes.push(ob);
  const dirty = Q.affectedByMove(p, [ob.id], before);
  assert.ok(dirty.has(p.links[0].id));
  const after = Q.routeConnections(p, before, dirty);
  assert.ok(after.get(p.links[0].id).length);
  assert.notDeepEqual(after.get(p.links[0].id), before.get(p.links[0].id));
  assert.ok(Q.valid(p, p.links[0], after.get(p.links[0].id)));
});
test("при диагональном движении модуль скользит вдоль границы", () => {
  const p = E.project(),
    t = {
      name: "N",
      category: "extender",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      outputs: [{ connType: "euro", nominalA: 16 }],
    };
  const a = E.makeNode(t, { x: 0, y: 0 }),
    b = E.makeNode(t, { x: 500, y: 0 });
  p.nodes = [a, b];
  const delta = E.slideGroup(p, [a.id], 300, 60);
  assert.equal(delta.x, 130);
  assert.equal(delta.y, 60);
  assert.ok(!E.overlaps(E.rect(a), E.rect(b), 16));
  for (let i = 0; i < 5; i++) E.slideGroup(p, [a.id], 20, 10);
  assert.equal(a.pos.y, 110);
  assert.equal(a.pos.x, 130);
  E.slideGroup(p, [a.id], -20, 0);
  assert.equal(a.pos.x, 110);
});
test("быстрый перенос не проходит сквозь препятствие", () => {
  const p = E.project(),
    t = {
      name: "N",
      category: "consumer",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      watts: 1,
    },
    a = E.makeNode(t, { x: 0, y: 0 }),
    b = E.makeNode(t, { x: 500, y: 0 });
  p.nodes = [a, b];
  E.slideGroup(p, [a.id], 1500, 0);
  assert.equal(a.pos.x, 130);
});
test("свободный порт не рисует вывод за пределами модуля", () => {
  const p = E.project(),
    n = E.makeNode({
      name: "N",
      category: "extender",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      outputs: [{ connType: "euro", nominalA: 16 }],
    });
  p.nodes = [n];
  const ops = [],
    ctx = new Proxy(
      { measureText: (s) => ({ width: s.length * 6 }) },
      { get: (o, k) => (k in o ? o[k] : (...args) => ops.push([k, ...args])) },
    );
  R.paintNode(ctx, n, E.calculate(p).nodes.get(n.id), {
    project: p,
    selected: false,
  });
  assert.equal(ops.filter((v) => v[0] === "lineTo").length, 0);
  assert.equal(ops.filter((v) => v[0] === "arc").length, 2);
});
test("свёртка коллинеарных точек убирает нулевые сегменты и обратные хвосты", () => {
  assert.deepEqual(
    R.simplify([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 30 },
    ]),
    [
      { x: 0, y: 0 },
      { x: 0, y: 30 },
    ],
  );
  const d = R.svgPath([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 30 },
  ]);
  assert.equal(d, "M0 0 L20 0 L20 30");
});
module.exports = { fixture };
test("при свободном прямом коридоре маршрут вверх не делает петлю вниз", () => {
  const p = fixture(),
    l = p.links[0],
    a = p.nodes[0],
    b = p.nodes[1],
    start = E.portPosition(a, a.outputs[0]),
    end = E.portPosition(b, b.inputs[0]),
    x = E.rect(a).right + 28,
    t = E.rect(b).left - 28;
  const bad = [
      start,
      { x, y: start.y },
      { x, y: start.y + 80 },
      { x: t, y: start.y + 80 },
      { x: t, y: end.y },
      end,
    ],
    path = Q.routeOne(p, l, [], bad);
  assert.ok(path.length > 0);
  assert.ok(
    Q.segments(path)
      .filter((s) => !s.h)
      .every((s) => s.b.y < s.a.y),
  );
  assert.equal(path.length, 4);
});
test("перенос дистрибьютора сохраняет единый пучок для всех его линий", () => {
  const p = fixture(),
    before = Q.routeConnections(p);
  p.nodes[0].pos.x += 40;
  p.nodes[0].pos.y += 30;
  const dirty = Q.affectedByMove(p, [p.nodes[0].id], before),
    incremental = Q.routeConnections(p, before, dirty),
    canonical = Q.routeConnections(p);
  assert.equal(dirty.size, 6);
  for (const l of p.links)
    assert.deepEqual(incremental.get(l.id), canonical.get(l.id));
});

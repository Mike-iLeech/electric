const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  E = require("../engine");
const add = (p, t, pos) => {
  const n = E.makeNode(t, pos);
  p.nodes.push(n);
  return n;
};
const src = (p, phases = 3) =>
  add(
    p,
    {
      name: "Щит",
      category: "input",
      phases,
      inA: 32,
      shield: true,
      outputs: [
        {
          connType: phases === 3 ? "cee3" : "euro",
          nominalA: phases === 3 ? 32 : 16,
        },
      ],
    },
    { x: 0, y: 0 },
  );
const dist = (p) =>
  add(
    p,
    {
      name: "Дистро",
      phases: 3,
      inA: 32,
      outputs: E.PHASES.map((phase) => ({
        connType: "euro",
        nominalA: 16,
        phase,
      })),
    },
    { x: 600, y: 0 },
  );
const ext = (p) =>
  add(
    p,
    {
      name: "Удлинитель",
      category: "extender",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      outputs: [{ connType: "euro", nominalA: 16 }],
    },
    { x: 1200, y: 0 },
  );
const load = (p, w = 2300, phases = 1) =>
  add(
    p,
    {
      name: "Потребитель",
      category: "consumer",
      phases,
      inConnType: phases === 3 ? "cee3" : "euro",
      inA: phases === 3 ? 32 : 16,
      watts: w,
    },
    { x: 1800, y: 0 },
  );
const conn = (p, a, b, i = 0) =>
  E.connect(
    p,
    { nodeId: a.id, portId: a.outputs[i].id, kind: "out" },
    { nodeId: b.id, portId: b.inputs[0].id, kind: "in" },
  );
const almost = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("все шаблоны каталога соответствуют схеме и имеют уникальные ID", () => {
  for (const t of E.catalog()) {
    const p = E.project();
    add(p, t);
    E.validate(p);
  }
  assert.ok(E.catalog().length >= 52);
});
test("фаза наследуется при любой очередности сборки, в том числе снизу вверх", () => {
  for (const bottomUp of [true, false])
    for (let phase = 0; phase < 3; phase++) {
      const p = E.project(),
        s = src(p),
        d = dist(p),
        e = ext(p),
        c = load(p);
      if (bottomUp) {
        conn(p, e, c);
        conn(p, d, e, phase);
        conn(p, s, d);
      } else {
        conn(p, s, d);
        conn(p, d, e, phase);
        conn(p, e, c);
      }
      const r = E.calculate(p);
      assert.equal(r.nodes.get(c.id).inPhase, E.PHASES[phase]);
      almost(r.nodes.get(s.id).loadW[E.PHASES[phase]], 2300);
      almost(r.nodes.get(c.id).loadA[E.PHASES[phase]], 10);
    }
});
test("перенос ветки L2 → L3 пересчитывает всех потомков", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p),
    e = ext(p),
    c = load(p);
  conn(p, s, d);
  const l = conn(p, d, e, 1);
  conn(p, e, c);
  p.links = p.links.filter((v) => v.id !== l.id);
  conn(p, d, e, 2);
  const r = E.calculate(p);
  assert.equal(r.nodes.get(c.id).inPhase, "L3");
  assert.deepEqual(r.nodes.get(s.id).loadW, { L1: 0, L2: 0, L3: 2300 });
});
test("мощность и ток симметричного 3ф потребителя, единственное напряжение", () => {
  const p = E.project(),
    s = src(p),
    c = load(p, 6900, 3);
  conn(p, s, c);
  const r = E.calculate(p);
  for (const k of E.PHASES) {
    almost(r.nodes.get(c.id).loadA[k], 10);
    almost(r.nodes.get(s.id).loadW[k], 2300);
  }
  almost(r.voltageLL, 230 * Math.sqrt(3));
  almost(Math.sqrt(3) * r.voltageLL * 10, 6900);
});
test("потребитель без источника: фактический ток 0, требуемая мощность сохранена", () => {
  const p = E.project(),
    c = load(p, 4000),
    r = E.calculate(p).nodes.get(c.id);
  assert.equal(r.powered, false);
  assert.equal(r.status, "Нет источника");
  assert.equal(E.sum(r.loadW), 0);
  assert.equal(E.sum(r.demandW), 4000);
  assert.equal(r.overload, false);
});
test("открытый вводной 3P обесточивает все фазы, сохраняет причину нагрузки", () => {
  const p = E.project(),
    s = src(p),
    c = load(p, 9000, 3);
  conn(p, s, c);
  s.outputs[0].breaker.state = "open";
  const r = E.calculate(p);
  assert.equal(r.nodes.get(c.id).powered, false);
  assert.equal(E.sum(r.nodes.get(c.id).loadW), 0);
  assert.equal(E.sum(r.nodes.get(s.id).demandW), 9000);
});
test("отключение автомата выхода не обесточивает соседнюю ветку", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p),
    a = load(p),
    b = load(p);
  conn(p, s, d);
  conn(p, d, a);
  conn(p, d, b, 1);
  d.outputs[0].breaker.state = "open";
  const r = E.calculate(p);
  assert.equal(r.nodes.get(a.id).powered, false);
  assert.equal(r.nodes.get(b.id).powered, true);
  almost(r.nodes.get(s.id).loadW.L2, 2300);
  almost(r.nodes.get(s.id).loadW.L1, 0);
});
test("пороговая модель автомата: перегрузка и взвод", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p),
    c = load(p, 4000);
  conn(p, s, d);
  conn(p, d, c);
  assert.equal(E.calculate(p).nodes.get(d.id).overload, true);
  const trips = E.tripOverloads(p);
  assert.equal(trips.length, 1);
  assert.equal(d.outputs[0].breaker.state, "tripped");
  assert.equal(E.calculate(p).nodes.get(c.id).powered, false);
  c.consumerWatts = 2300;
  d.outputs[0].breaker.state = "closed";
  assert.equal(E.calculate(p).nodes.get(c.id).powered, true);
  assert.equal(E.tripOverloads(p).length, 0);
});
test("равный номиналу ток не отключает автомат", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p),
    c = load(p, 16 * 230);
  conn(p, s, d);
  conn(p, d, c);
  assert.equal(E.tripOverloads(p).length, 0);
});
test("выделенная единственная фаза считается неравномерной нагрузкой", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p),
    c = load(p);
  conn(p, s, d);
  conn(p, d, c);
  assert.equal(E.calculate(p).nodes.get(d.id).phaseImbalance, true);
});
test("1ф→3ф пассивный переход, недопустимый номинал и автомат отвергаются", () => {
  const p = E.project();
  add(p, {
    name: "Плохой",
    phases: 1,
    inConnType: "euro",
    inA: 16,
    outputs: [{ connType: "cee3", nominalA: 16 }],
  });
  assert.throws(() => E.validate(p), /1ф/);
  p.nodes = [];
  const n = ext(p);
  n.outputs[0].nominalA = 32;
  assert.throws(() => E.validate(p), /номинала/);
  n.outputs[0].nominalA = 16;
  n.outputs[0].breaker = E.breaker(20);
  assert.throws(() => E.validate(p), /выше/);
});
test("единая совместимость: занятость, направление, номинал и многоузловой цикл", () => {
  const p = E.project(),
    a = ext(p),
    b = ext(p),
    c = ext(p);
  conn(p, a, b);
  conn(p, b, c);
  assert.throws(() => conn(p, c, a), /Циклы/);
  assert.throws(() => conn(p, a, c), /занят/);
  assert.equal(E.compatible(a.inputs[0], b.inputs[0]).ok, false);
  assert.equal(
    E.compatible(E.port("out", "cee3", 32), E.port("in", "cee3", 16)).ok,
    false,
  );
});
test("импорт не допускает дубль связи, отсутствующий порт, цикл и NaN", () => {
  const p = E.project(),
    s = src(p),
    d = dist(p);
  conn(p, s, d);
  let bad = E.clone(p);
  bad.links.push({ ...bad.links[0], id: "duplicate" });
  assert.throws(() => E.migrate(bad), /занят/);
  bad = E.clone(p);
  bad.links[0].to.portId = "nope";
  assert.throws(() => E.migrate(bad), /не найден/);
  bad = E.clone(p);
  bad.nodes[0].pos.x = NaN;
  assert.throws(() => E.validate(bad), /число/);
});
test("версия и приложение проверяются; отрицательная мощность запрещена", () => {
  const p = E.project();
  load(p, -1);
  assert.throws(() => E.validate(p), /Мощность/);
  p.nodes = [];
  p.meta.version = 99;
  assert.throws(() => E.migrate(p), /Версия/);
  p.meta.version = 32;
  p.meta.app = "other";
  assert.throws(() => E.migrate(p), /другого/);
});
test("миграция v31 сохраняет 220В, номиналы и исходный файл", () => {
  const p = {
    meta: { app: E.APP, version: 31, name: "Старая схема" },
    nodes: [
      {
        id: "s",
        name: "Щит",
        templateName: "Щит",
        category: "input",
        pos: { x: 0, y: 0 },
        inputs: [],
        outputs: [
          {
            id: "o",
            kind: "out",
            connType: "cee3",
            nominalA: 32,
            phases: 3,
            label: "OUT",
          },
        ],
        consumerWatts: 0,
      },
    ],
    links: [],
    view: { panX: 0, panY: 0, zoom: 1 },
  };
  const migrated = E.migrate(p);
  assert.equal(migrated.meta.version, 32);
  assert.equal(migrated.settings.voltageLN, 220);
  assert.equal(migrated.nodes[0].outputs[0].breaker.ratingA, 32);
  assert.equal(p.meta.version, 31);
});
test("коллизия не допускает перекрытие, свободный перенос группы разрешён", () => {
  const p = E.project(),
    a = ext(p),
    b = load(p);
  a.pos = { x: 0, y: 0 };
  b.pos = { x: 500, y: 0 };
  const original = E.clone(a.pos);
  assert.equal(E.moveGroup(p, [a.id], 300, 0), false);
  assert.deepEqual(a.pos, original);
  assert.equal(E.moveGroup(p, [a.id, b.id], 100, 100), true);
});
test("новые модули размещаются без коллизий", () => {
  const p = E.project();
  for (let i = 0; i < 30; i++) {
    const n = E.makeNode(E.catalog()[i]);
    E.placeNode(p, n);
    assert.ok(!p.nodes.some((o) => E.overlaps(E.rect(n), E.rect(o))));
    p.nodes.push(n);
  }
});
test("провод идёт в обход третьего модуля, включая возврат справа налево", () => {
  for (const reverse of [false, true]) {
    const p = E.project(),
      a = ext(p),
      b = ext(p),
      obstacle = ext(p);
    a.pos = { x: reverse ? 1200 : 0, y: 0 };
    b.pos = { x: reverse ? 0 : 1200, y: 0 };
    obstacle.pos = { x: 600, y: 0 };
    const l = conn(p, a, b),
      route = E.routeWire(p, l);
    assert.ok(route.length > 3);
    for (let i = 1; i < route.length; i++) {
      const v = route[i - 1],
        w = route[i],
        r = E.rect(obstacle);
      assert.equal(
        v.x === w.x
          ? v.x > r.left &&
              v.x < r.right &&
              Math.max(v.y, w.y) > r.top &&
              Math.min(v.y, w.y) < r.bottom
          : v.y > r.top &&
              v.y < r.bottom &&
              Math.max(v.x, w.x) > r.left &&
              Math.min(v.x, w.x) < r.right,
        false,
      );
    }
  }
});
test("пофазная сумма сохраняется в разветвлённом дереве и после отключения ветки", () => {
  const p = E.project(),
    s = src(p),
    d = add(p, {
      name: "D",
      phases: 3,
      inA: 32,
      outputs: Array.from({ length: 12 }, (_, i) => ({
        connType: "euro",
        nominalA: 16,
        phase: E.PHASES[i % 3],
      })),
    });
  conn(p, s, d);
  const expected = { L1: 0, L2: 0, L3: 0 };
  for (let i = 0; i < 12; i++) {
    const e = ext(p),
      c = load(p, 100 * (i + 1));
    conn(p, e, c);
    conn(p, d, e, i);
    expected[E.PHASES[i % 3]] += 100 * (i + 1);
  }
  let r = E.calculate(p);
  for (const k of E.PHASES) almost(r.nodes.get(s.id).loadW[k], expected[k]);
  d.outputs[7].breaker.state = "open";
  r = E.calculate(p);
  almost(r.nodes.get(s.id).loadW.L2, expected.L2 - 800);
  almost(r.nodes.get(s.id).demandW.L2, expected.L2);
});
test("импорт многоузлового цикла отвергается атомарно", () => {
  const p = E.project(),
    a = ext(p),
    b = ext(p),
    c = ext(p);
  conn(p, a, b);
  conn(p, b, c);
  p.links.push({
    id: "cycle",
    from: { nodeId: c.id, portId: c.outputs[0].id },
    to: { nodeId: a.id, portId: a.inputs[0].id },
  });
  assert.throws(() => E.migrate(p), /циклы/);
});
test("редактируемые выходы шаблона сохраняют номиналы автоматов", () => {
  const p = E.project();
  const n = add(p, {
    name: "custom",
    category: "distributor",
    phases: 3,
    inA: 32,
    outputs: [
      {
        connType: "euro",
        nominalA: 16,
        phase: "L2",
        breaker: { ratingA: 10, poles: 1, curve: "B", state: "closed" },
      },
    ],
  });
  E.validate(p);
  assert.equal(n.outputs[0].breaker.ratingA, 10);
  assert.equal(n.outputs[0].breaker.curve, "B");
});
test('подсветка ветки: весь путь, обратный выбор, соседние ветви и выключение',()=>{
 const p={settings:{highlightBranch:true},links:[{id:'ab',from:{nodeId:'a'},to:{nodeId:'b'}},{id:'bc',from:{nodeId:'b'},to:{nodeId:'c'}},{id:'bd',from:{nodeId:'b'},to:{nodeId:'d'}}]};
 const path=E.selectedBranch(p,new Set(['a','c']));assert.deepEqual([...path.nodes].sort(),['a','b','c']);assert.deepEqual([...path.links].sort(),['ab','bc']);
 assert.deepEqual([...E.selectedBranch(p,new Set(['c','a'])).links].sort(),['ab','bc']);
 assert.equal(E.selectedBranch(p,new Set(['c','d'])).links.size,0);assert.equal(E.selectedBranch(p,new Set(['a','x'])).links.size,0);assert.equal(E.selectedBranch(p,new Set(['a'])).links.size,0);
 p.settings.highlightBranch=false;assert.equal(E.selectedBranch(p,new Set(['a','c'])).links.size,0);
});

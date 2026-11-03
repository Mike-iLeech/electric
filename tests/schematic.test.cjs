const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../engine"),
  S = require("../schematic");
function fixture() {
  const p = E.project(),
    a = E.makeNode({
      name: "Источник",
      category: "input",
      phases: 3,
      inConnType: "terminal3",
      inA: 125,
      outputs: [{ connType: "cee3", nominalA: 63 }],
    }),
    b = E.makeNode({
      name: "Дистро",
      category: "distributor",
      phases: 3,
      inConnType: "cee3",
      inA: 63,
      outputs: [{ connType: "euro", nominalA: 16, phase: "L1" }],
    }),
    c = E.makeNode({
      name: "Нагрузка",
      category: "consumer",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      watts: 4500,
    }),
    d = E.makeNode({
      name: "Без подключения",
      category: "consumer",
      phases: 1,
      inConnType: "euro",
      inA: 16,
      watts: 1000,
    });
  p.nodes = [a, b, c, d];
  for (const [from, to] of [
    [a, b],
    [b, c],
  ])
    E.connect(
      p,
      { nodeId: from.id, portId: from.outputs[0].id, kind: "out" },
      { nodeId: to.id, portId: to.inputs[0].id, kind: "in" },
    );
  return p;
}
test("сводка включает неподключённые нагрузки, внешние вводы и количество модулей", () => {
  const p = fixture(),
    s = S.summary(p);
  assert.equal(s.watts, 5500);
  assert.equal(s.consumers, 2);
  assert.equal(s.distros, 1);
  assert.equal(s.modules, 4);
  assert.equal(s.points.length, 2);
  const input = s.points.find((v) => v.nominal === 125);
  assert.equal(input.count, 1);
  assert.equal(input.watts, 4500);
  assert.equal(input.capacity, 86250);
  p.nodes[1].mainBreaker.state = "open";
  assert.equal(S.summary(p).watts, 5500);
  assert.equal(S.summary(p).points.find((v) => v.nominal === 125).watts, 4500);
});
test("автоматическая раскладка не перекрывает модули и не зависит от viewport", () => {
  const p = fixture(),
    before = [...S.layout(p)];
  for (const n of p.nodes) n.pos = { x: 9999, y: -9999 };
  p.view = { panX: 300, panY: 100, zoom: 2 };
  assert.deepEqual([...S.layout(p)], before);
  for (let i = 0; i < before.length; i++)
    for (let j = i + 1; j < before.length; j++) {
      const a = before[i][1],
        b = before[j][1];
      assert.ok(
        a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      );
    }
});

test("базовая схема раскладывается горизонтально и без наложений",()=>{
 const p=require('../default-project.json'), poses=[...S.layout(p).values()];
 const w=Math.max(...poses.map(r=>r.x+r.w)), h=Math.max(...poses.map(r=>r.y+r.h));
 assert.ok(w>h && w/h<2.5, w+'x'+h);
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++){
 const a=poses[i],b=poses[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
 }
});

test("все связи базовой схемы направлены вправо, маршруты не пересекают блоки",()=>{
 const p=require('../default-project.json'),poses=S.layout(p),routes=S.connectionPaths(p);
 for(const l of p.links){const a=poses.get(l.from.nodeId),b=poses.get(l.to.nodeId);assert.ok(b.x>a.x+a.w);const points=routes.get(l.id);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];assert.ok(b.x>=a.x,'Нет возврата влево');for(const r of poses.values())assert.ok(a.y===b.y?!(a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w):!(a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h));}
 }
});

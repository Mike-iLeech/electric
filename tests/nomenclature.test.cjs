const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../engine");
test("номенклатура каталога: название | фазность | вход → выход, без слов цвета и ошибки 2P+PE", () => {
  for (const t of E.catalog()) {
    const label = E.nomenclature(t),
      parts = label.split(" | ");
    assert.equal(parts.length, 3, label);
    assert.ok(parts[2].includes(" → "), label);
    assert.ok(
      parts[1].includes(
        t.phases === 3 ? "Трёхфазный" : "Однофазный",
      ),
      label,
    );
    assert.equal(/синий|красный|2P\+PE/i.test(label), false, label);
  }
  assert.equal(E.CONNECTORS.cee1.pins, "P+N+PE");
  assert.equal(
    E.nomenclature(E.catalog().find(t => t.category === "consumer" && t.inA === 16 && t.phases === 1 && t.watts === 3500)),
    "Потребитель | Однофазный | 16А → Нагрузка 3.5 кВт",
  );
  assert.ok(
    !E.catalog().some(
      (t) =>
        t.category === "input" &&
        !t.shield &&
        t.inConnType.startsWith("terminal"),
    ),
  );
});
test("клеммный ввод всегда щит; старые вводы преобразуются без смены ID и портов", () => {
  const p = E.project(),
    n = E.makeNode({
      name: "Клеммный ввод 3ф 250 А",
      category: "input",
      phases: 3,
      inConnType: "terminal3",
      inA: 250,
      outputs: [{ connType: "terminal3", nominalA: 250 }],
    });
  assert.equal(n.shield, true);
  assert.equal(n.outputs[0].breaker.ratingA, 250);
  const id = n.id,
    port = n.outputs[0].id;
  n.shield = false;
  n.mainBreaker = null;
  p.nodes = [n];
  const next = E.migrate(p);
  assert.equal(next.nodes[0].shield, true);
  assert.equal(next.nodes[0].id, id);
  assert.equal(next.nodes[0].outputs[0].id, port);
  assert.equal(next.nodes[0].outputs[0].breaker.ratingA, 250);
});

test("каталог различает дистрибьюторы с одинаковым номиналом и разными разъёмами", () => {
 const variants=E.catalog().filter(t=>t.category==='distributor'&&t.inA===32&&t.outputs.length===6);
 assert.equal(variants.length,2);
 const labels=variants.map(t=>E.nomenclature(t,{connectors:true}));
 assert.notEqual(labels[0],labels[1]);
 assert.ok(labels.some(s=>s.includes('CEE 3ф 32А → 6x Schuko 16А')));
 assert.ok(labels.some(s=>s.includes('CEE 3ф 32А → 6x CEE 1ф 16А')));
});

test("ошибочный кабель CEE250 удаляется, реальные переходы с клемм сохраняются",()=>{
 const p=E.project(), bad=E.makeNode({name:'Кабель с голыми концами',category:'extender',phases:3,inConnType:'cee3',inA:250,outputs:[{connType:'cee3',nominalA:250}]});
 const good=E.makeNode(E.catalog().find(t=>t.category==='extender'&&t.inConnType==='terminal3'&&t.inA===250));
 p.nodes=[bad,good]; const migrated=E.migrate(p);
 assert.deepEqual(migrated.nodes.map(n=>n.id),[good.id]);
 assert.ok(!E.catalog().some(E.obsoleteCable));
});

test("каталог исключает нагрузки powerCON, сохраняя удлинитель",()=>{
 assert.ok(!E.catalog().some(t=>t.category==='consumer'&&t.inConnType==='powercon'));
 assert.ok(E.catalog().some(t=>t.category==='extender'&&t.inConnType==='powercon'));
});

test("группа на капсуле содержит вход и выход с типами разъёмов",()=>{
 const t=E.catalog().find(t=>t.category==='distributor'&&t.inA===32&&t.outputs.length===6&&t.outputs[0].connType==='euro');
 assert.equal(E.nomenclature(E.makeNode(t),{compactConnectors:true}).split(' | ')[2],'CEE 32А 3P → 6 × SHUKO 16А');
});

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../engine"),
  S = require("../schematic");

test("зоны семи веток вместе с трассами не перекрываются в компоновке листа", () => {
  const p=E.project();
  for(let branch=0;branch<7;branch++){
    const source=E.makeNode({name:"Ввод "+branch,category:"input",phases:3,inA:63,outputs:[{connType:"cee3",nominalA:32}]});
    const d=E.makeNode({name:"Раздача",phases:3,inA:32,outputs:E.PHASES.map(phase=>({connType:"euro",nominalA:16,phase}))});
    p.nodes.push(source,d);
    const connect=(a,b,index=0)=>E.connect(p,{nodeId:a.id,portId:a.outputs[index].id},{nodeId:b.id,portId:b.inputs[0].id});
    connect(source,d);
    for(let phase=0;phase<3;phase++){
      const consumer=E.makeNode({name:"Нагрузка",category:"consumer",phases:1,inConnType:"euro",inA:16,watts:1000});
      p.nodes.push(consumer);connect(d,consumer,phase);
    }
  }
  for(const balance of [50,100,200]){
    const poses=S.layoutForSheet(p,1200,800,balance),zones=S.branchZoneBounds(p,poses);
    assert.equal(zones.length,7);
    assert.doesNotThrow(()=>S.validateBranchZones(zones));
    for(let i=1;i<zones.length;i++)assert.ok(zones[i].top-zones[i-1].bottom>=24);
  }
  assert.throws(()=>S.validateBranchZones([{left:0,right:100,top:0,bottom:100},{left:0,right:100,top:99,bottom:200}]),
    /Места не хватает, уменьшите масштаб/);
});

test("подписи веток остаются в собственной зоне с отступом от рамки", () => {
  const p=E.project();
  p.nodes=[1,2].map(i=>E.makeNode({name:"Ввод "+i,category:"input",phases:3,inA:63,outputs:[]}));
  const titles=[],ctx=new Proxy({font:"",measureText:t=>({width:String(t).length*24}),
    fillText(t,x,y){if(String(t).startsWith("Ветка №"))titles.push({t,x,y,size:parseFloat(this.font)});}},
    {get:(o,k)=>k in o?o[k]:()=>{}});
  S.render(p,{context:ctx,renderScale:1,diagramOnly:true});
  assert.equal(titles.length,2);
  const poses=S.layout(p);
  titles.forEach((title,i)=>{
    const contentTop=poses.get(p.nodes[i].id).y,top=Math.max(84,contentTop-90);
    assert.ok(title.y-title.size>=top+6,title.t);
    assert.ok(title.y<=contentTop-8,title.t);
  });
});
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

test("базовая схема раскладывается без наложений и чрезмерного растяжения",()=>{
 const p=require('./fixtures/full-catalog-project.json'), poses=[...S.layout(p).values()];
 const w=Math.max(...poses.map(r=>r.x+r.w)), h=Math.max(...poses.map(r=>r.y+r.h));
 assert.ok(w>0 && h>0 && Math.max(w,h)/Math.min(w,h)<2.5, w+'x'+h);
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

test("печатные кабели выдерживают зазор от модулей кроме собственных подводов", () => {
  const p = require('../default-project.json'), poses = S.layout(p);
  const routes = S.connectionPaths(p, poses);
  for (const link of p.links) {
    const points = routes.get(link.id);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i+1];
      if (a.x === b.x && a.y === b.y) continue;
      for (const [id,r] of poses) {
        if ((id === link.from.nodeId && i === 0) ||
            (id === link.to.nodeId && i === points.length-2)) continue;
        const crossed = a.y === b.y
          ? a.y > r.y-24 && a.y < r.y+r.h+24 && Math.max(a.x,b.x) > r.x-24 && Math.min(a.x,b.x) < r.x+r.w+24
          : a.x > r.x-24 && a.x < r.x+r.w+24 && Math.max(a.y,b.y) > r.y-24 && Math.min(a.y,b.y) < r.y+r.h+24;
        assert.equal(crossed, false, link.id + ' near ' + id);
      }
    }
  }
});

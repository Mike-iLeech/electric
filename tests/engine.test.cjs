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
test("постоянное сопротивление снижает ток и мощность при удлинении; выключенная опция сохраняет прежнюю модель", () => {
  const p=E.project(),s=src(p,1),c=load(p,2300);conn(p,s,c);
  p.settings.powerFactor=1;p.settings.enableConsumerModes=true;p.settings.defaultConsumerMode="resistance";
  p.links[0].cable={lengthM:100,sectionMm2:2.37};
  let result=E.calculate(p),n=result.nodes.get(c.id);
  assert.equal(result.powerFlow.converged,true);
  almost(n.loadA.L1,230/(23+2));
  almost(n.phaseVoltage.L1,230*23/25);
  almost(E.sum(n.loadW),2300*(23/25)**2);
  almost(E.sum(result.nodes.get(s.id).loadW),E.sum(n.loadW));
  p.links[0].cable.lengthM=200;
  assert.ok(E.calculate(p).nodes.get(c.id).loadA.L1<n.loadA.L1);
  p.settings.enableConsumerModes=false;
  almost(E.sum(E.calculate(p).nodes.get(c.id).loadW),2300);
  p.settings.enableConsumerModes=true;c.consumerMode="power";
  almost(E.sum(E.calculate(p).nodes.get(c.id).loadW),2300);
  c.consumerMode="resistance";
  assert.equal(E.consumerMode(E.validate(JSON.parse(JSON.stringify(p))),c),"resistance");
  c.consumerMode="invalid";assert.throws(()=>E.validate(p),/режим потребителя/);
});
test("длинная линия постоянного сопротивления имеет устойчивое аналитическое решение",()=>{
  const p=E.project(),s=src(p,1),c=load(p,2300);conn(p,s,c);
  p.settings.powerFactor=1;p.settings.enableConsumerModes=true;c.consumerMode="resistance";
  for(const lengthM of [4000,10000]){
    p.links[0].cable={lengthM,sectionMm2:2.37};
    const result=E.calculate(p),n=result.nodes.get(c.id),expected=230/(23+lengthM*.02);
    assert.equal(result.powerFlow.converged,true);
    almost(n.loadA.L1,expected);almost(n.voltageLN,expected*23);
    almost(E.sum(n.loadW),expected**2*23);
  }
  assert.equal(E.cableLengthLimits(p,p.links[0].id).loadLength,Infinity);
});

test("смешанная постоянная мощность и сопротивление сходятся на длинной общей линии",()=>{
  const p=E.project(),s=src(p,1),d=ext(p),z=load(p,2300),cp=load(p,10);
  // Два параллельных потребителя: U = 230 - 80*(U/23 + 10/U).
  d.outputs.push(E.port("out","euro",16));
  conn(p,s,d);conn(p,d,z);conn(p,d,cp,1);
  p.settings.powerFactor=1;p.settings.enableConsumerModes=true;z.consumerMode="resistance";
  p.links[0].cable={lengthM:4000,sectionMm2:2.37};
  const result=E.calculate(p),a=1+80/23,u=(230+Math.sqrt(230**2-4*a*800))/(2*a);
  assert.equal(result.powerFlow.converged,true);
  almost(result.nodes.get(z.id).voltageLN,u);
  almost(result.nodes.get(z.id).loadA.L1,u/23);
  almost(result.nodes.get(cp.id).loadA.L1,10/u);
});

test("несходимость независимого ввода не меняет пределы и статус исправной сети",()=>{
  const p=E.project(),s=src(p,1),c=load(p,1000);conn(p,s,c);
  p.settings.powerFactor=1;p.links[0].cable={lengthM:10,sectionMm2:2.37};
  const before=E.cableLengthLimits(p,p.links[0].id);
  const badSource=src(p,1),badLoad=load(p,20000);conn(p,badSource,badLoad);
  p.links[1].cable={lengthM:100,sectionMm2:2.37};
  const result=E.calculate(p),after=E.cableLengthLimits(p,p.links[0].id);
  assert.equal(result.powerFlow.converged,false);
  assert.equal(result.nodes.get(c.id).powerFlowFailed,false);
  assert.equal(result.nodes.get(badLoad.id).powerFlowFailed,true);
  assert.equal(after.allowedLength,before.allowedLength);
  assert.equal(after.loadLength,before.loadLength);
  assert.equal(after.dropLength,before.dropLength);
  assert.equal(after.current.loadOK,true);
  assert.deepEqual(after.current.reasons,[]);
});

test("предел длины Z-нагрузки включает минимальную длину вместо ложного нуля",()=>{
  const p=E.project(),s=src(p,1),c=load(p,3800);conn(p,s,c);
  p.settings.powerFactor=1;p.settings.enableConsumerModes=true;c.consumerMode="resistance";
  p.links[0].cable={lengthM:100,sectionMm2:2.37,maxDropPercent:20};
  const limits=E.cableLengthLimits(p,p.links[0].id),z=230**2/3800;
  const min=(230/16-z)/.02,max=z*.2/(.8*.02);
  assert.ok(Math.abs(limits.minLength-min)<.02);
  assert.ok(Math.abs(limits.allowedLength-max)<.02);
  assert.equal(limits.loadMinLength,limits.minLength);
  assert.equal(limits.loadLength,Infinity);
  assert.equal(limits.current.loadOK,true);assert.equal(limits.current.dropOK,true);
  almost(limits.current.calc.nodes.get(c.id).loadA.L1,230/(z+2));
  p.links[0].cable.lengthM=limits.minLength;
  assert.equal(E.cableLengthLimits(p,p.links[0].id).current.loadOK,true);
  p.links[0].cable.lengthM=limits.minLength-.02;
  assert.equal(E.cableLengthLimits(p,p.links[0].id).current.loadOK,false);
  // The entered point itself need not be valid for discovery of the interval.
  p.links[0].cable.lengthM=0;
  const fromZero=E.cableLengthLimits(p,p.links[0].id);
  assert.equal(fromZero.minLength,limits.minLength);
  assert.equal(fromZero.allowedLength,limits.allowedLength);
  p.links[0].cable.maxDropPercent=1;
  const impossible=E.cableLengthLimits(p,p.links[0].id);
  assert.equal(impossible.minLength,null);assert.equal(impossible.allowedLength,0);
});

test("смешанная P/Z нагрузка может требовать положительной минимальной длины",()=>{
  const p=E.project(),s=src(p,1),d=ext(p),z=load(p,3800),cp=load(p,100);
  d.outputs.push(E.port("out","euro",16));conn(p,s,d);conn(p,d,z);conn(p,d,cp,1);
  p.settings.powerFactor=1;p.settings.enableConsumerModes=true;z.consumerMode="resistance";
  p.links[0].cable={lengthM:100,sectionMm2:2.37,maxDropPercent:20};
  const limits=E.cableLengthLimits(p,p.links[0].id),g=3800/230**2;
  const u=(16+Math.sqrt(16**2-4*g*100))/(2*g),min=(230-u)/.32;
  assert.ok(Math.abs(limits.minLength-min)<.02);
  assert.ok(limits.allowedLength>100);assert.equal(limits.current.loadOK,true);
  assert.equal(limits.current.dropOK,true);
  p.links[0].cable.lengthM=limits.minLength-.02;
  assert.equal(E.cableLengthLimits(p,p.links[0].id).current.loadOK,false);
});

test("ΔU считается между соседними узлами относительно напряжения отправителя", () => {
  const node=lineVoltage=>({
    phaseVoltage:Object.fromEntries(E.PHASES.map(k=>[k,lineVoltage/Math.sqrt(3)])),
    phaseVoltagePhasor:Object.fromEntries(E.PHASES.map((k,i)=>[k,{
      re:lineVoltage/Math.sqrt(3)*Math.cos(-i*2*Math.PI/3),
      im:lineVoltage/Math.sqrt(3)*Math.sin(-i*2*Math.PI/3)}])),
  });
  const drop=E.cableVoltageDrop(node(389),node(320),3);
  almost(drop.dropV,69);
  almost(drop.dropPercent,100*69/389);
  assert.ok(drop.dropPercent>5);
});
test("предельная длина учитывает рост тока постоянной мощности и не меняет проект", () => {
  const p=E.project(), s=src(p,1), c=load(p,3400);
  conn(p,s,c); p.settings.powerFactor=1;
  p.links[0].cable={lengthM:10,sectionMm2:2.5,material:"cu"};
  const before=JSON.stringify(p), limits=E.cableLengthLimits(p,p.links[0].id);
  assert.equal(JSON.stringify(p),before);
  const expectedLoad=(230-3400/16)*2500/(2*23.7*16);
  const expectedDrop=(230*.05)*2500/(2*23.7*(3400/(230*.95)));
  assert.ok(Math.abs(limits.loadLength-expectedLoad)<.02);
  assert.ok(Math.abs(limits.dropLength-expectedDrop)<.02);
  assert.equal(limits.allowedLength,Math.min(limits.loadLength,limits.dropLength));
  assert.ok(limits.limiting.some(r=>r.kind==="drop"&&r.phase==="L1"&&r.linkId===p.links[0].id));
  assert.ok(limits.theoreticalLength>limits.allowedLength);
  assert.equal(limits.ratedCurrentA,16);
  almost(limits.theoreticalLength,230*2500/(2*23.7*16));
  p.links[0].cable.lengthM=limits.loadLength;
  assert.ok(E.calculate(p).nodes.get(c.id).loadA.L1<=16);
  p.links[0].cable.lengthM=limits.loadLength+.1;
  assert.ok(E.calculate(p).nodes.get(c.id).loadA.L1>16);
  const exceeded=E.cableLengthLimits(p,p.links[0].id);
  assert.ok(exceeded.current.reasons.some(r=>r.kind==="cable"&&r.phase==="L1"&&r.limitA===16));
  assert.ok(exceeded.current.reasons.some(r=>r.kind==="port"&&r.nodeId===s.id));
});
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

test("сводка считает каждый ввод один раз и исключает отключённые и неподключённые нагрузки", () => {
  const p = E.project(), s = src(p), d = dist(p), c = load(p), second = src(p, 1);
  conn(p, s, d); conn(p, d, c);
  const other = load(p, 4600); conn(p, second, other);
  load(p, 99999); // no source
  let calc = E.calculate(p), summary = E.networkSummary(p, calc);
  almost(summary.watts, 6900);
  almost(summary.currents.L1, 30);
  almost(summary.currents.L2, 0);
  assert.equal(summary.branches.length, 2);
  almost(summary.branches[0].watts, 2300);
  almost(summary.branches[0].apparentVA, 2300 / p.settings.powerFactor);
  almost(summary.branches[0].phaseVoltages.L1, 230);
  almost(summary.branches[0].lineVoltages["L1–L2"], 230 * Math.sqrt(3));
  assert.equal(summary.branches[1].lineVoltages["L1–L2"], null);
  almost(summary.phaseVoltages.L1.min, 230);
  almost(summary.lineVoltages["L1–L2"].max, 230 * Math.sqrt(3));
  d.mainBreaker.state = "open";
  calc = E.calculate(p); summary = E.networkSummary(p, calc);
  almost(summary.watts, 4600);
  almost(summary.currents.L1, 20);
  assert.equal(calc.nodes.get(s.id).phaseImbalance, false);
  assert.equal(calc.nodes.get(d.id).phaseImbalance, false);
  second.mainBreaker = {...E.breaker(32), state:"open"};
  s.mainBreaker = {...E.breaker(32, 3), state:"open"};
  summary = E.networkSummary(p, E.calculate(p));
  almost(summary.watts, 0);
  assert.equal(summary.phaseVoltages.L1, null);
  assert.equal(summary.lineVoltages["L1–L2"], null);
});

test("напряжения фаз учитывают нейтраль, балансировку и отключение в обычном режиме", () => {
  const p = E.project(), s = src(p), d = dist(p);
  conn(p, s, d);
  p.links[0].cable = {lengthM:100, sectionMm2:2.37, material:"cu"}; // R = 1 Ω
  p.settings.powerFactor = 1;
  p.settings.advancedMode = false;
  const loads = E.PHASES.map((_, i) => {
    const c = load(p, i === 0 ? 2300 : 0);
    conn(p, d, c, i);
    return c;
  });
  let c = E.calculate(p).nodes.get(d.id);
  const loadedVoltage = (230 + Math.sqrt(230 ** 2 - 8 * 2300)) / 2;
  almost(c.phaseVoltage.L1, loadedVoltage); // V = E − 2RP/V
  almost(c.phaseVoltage.L2, Math.hypot(-115 - 2300 / loadedVoltage, -230 * Math.sqrt(3) / 2));
  almost(c.phaseVoltage.L3, c.phaseVoltage.L2);
  assert.ok(c.phaseVoltage.L2 > 230); // neutral shift raises unloaded phases
  loads.forEach(n => n.consumerWatts = 2300);
  c = E.calculate(p).nodes.get(d.id);
  for (const phase of E.PHASES) almost(c.phaseVoltage[phase], (230 + Math.sqrt(230 ** 2 - 4 * 2300)) / 2);
  loads.forEach(n => n.consumerWatts = 0);
  c = E.calculate(p).nodes.get(d.id);
  for (const phase of E.PHASES) almost(c.phaseVoltage[phase], 230);
  d.mainBreaker.state = "open";
  c = E.calculate(p).nodes.get(d.id);
  for (const phase of E.PHASES) almost(c.phaseVoltage[phase], 0);
});

test("векторное падение складывается по цепи и учитывает cos φ", () => {
  const p = E.project(), s = src(p),
    a = add(p, {name:"3ф", phases:3, inA:32, outputs:[{connType:"cee3", nominalA:32}]}),
    d = dist(p), c = load(p);
  conn(p, s, a); conn(p, a, d); conn(p, d, c);
  p.settings.powerFactor = 0.8;
  for (const link of p.links.slice(0, 2))
    link.cable = {lengthM:50, sectionMm2:2.37, material:"cu"};
  const result = E.calculate(p).nodes.get(d.id);
  const v = result.phaseVoltagePhasor.L1, i = result.currentPhasor.L1;
  almost(v.re * i.re + v.im * i.im, 2300);
  almost(v.im * i.re - v.re * i.im, 1725);
  almost(v.re, 230 - 2 * i.re);
  almost(v.im, -2 * i.im);
  const estimate = E.cableEstimate({lengthM:100, sectionMm2:2.37, material:"cu", ampacityA:32, powerFactor:0.8}, 3, {L1:12.5,L2:0,L3:0});
  almost(estimate.phaseDropPhasor.L1.re, 20);
  almost(estimate.phaseDropPhasor.L1.im, -15);
});

test("постоянная мощность: аналитический ток, перегрузка и баланс потерь", () => {
  const p = E.project(), s = src(p, 1), c = load(p, 3450);
  conn(p, s, c); p.settings.powerFactor = 1;
  p.links[0].cable = {lengthM:100, sectionMm2:2.37, material:"cu"};
  const result = E.calculate(p), cc = result.nodes.get(c.id), sc = result.nodes.get(s.id);
  assert.equal(result.powerFlow.converged, true);
  const expectedI = (230 - Math.sqrt(230 ** 2 - 8 * 3450)) / 4;
  almost(cc.loadA.L1, expectedI);
  assert.ok(expectedI > 16); // nominal-voltage estimate was only 15 A
  assert.equal(result.ports.get(s.outputs[0].id).overload, true);
  almost(cc.phaseVoltage.L1 * cc.loadA.L1, 3450);
  const cable = E.cableParameters(p.links[0], s.outputs[0], c.inputs[0], p.settings);
  const port = result.ports.get(s.outputs[0].id);
  const estimate = E.cableEstimate(cable, 1, port.loadA, port.currentPhasor);
  almost(sc.phaseVoltage.L1 * sc.loadA.L1, 3450 + estimate.lossW);
  c.consumerWatts = 0;
  almost(E.calculate(p).nodes.get(c.id).phaseVoltage.L1, 230);
});

test("несходимость постоянной мощности явно помечается без NaN", () => {
  const p = E.project(), s = src(p, 1), c = load(p, 20000);
  conn(p, s, c); p.settings.powerFactor = 1;
  p.links[0].cable = {lengthM:100, sectionMm2:2.37, material:"cu"};
  const result = E.calculate(p);
  assert.equal(result.powerFlow.converged, false);
  assert.equal(result.nodes.get(c.id).powerFlowFailed, true);
  assert.ok(Number.isFinite(result.nodes.get(c.id).loadA.L1));
  assert.ok(Number.isFinite(result.nodes.get(c.id).phaseVoltage.L1));
});

test("K₂U: симметрия, известная обратная последовательность и нулевая последовательность", () => {
  const phases = (negative, neutral = 0) => Object.fromEntries(E.PHASES.map((k, i) => {
    const angle = i * 2 * Math.PI / 3;
    return [k, {re:230*Math.cos(angle) + negative*Math.cos(angle) + neutral,
      im:-230*Math.sin(angle) + negative*Math.sin(angle)}];
  }));
  almost(E.voltageUnbalance(phases(0)), 0);
  almost(E.voltageUnbalance(phases(4.6)), 2);
  almost(E.voltageUnbalance(phases(6.9, 20)), 3);
  almost(E.voltageUnbalance(phases(0, 20)), 0);
  assert.equal(E.voltageUnbalance({L1:{re:0,im:0}, L2:{re:0,im:0}, L3:{re:0,im:0}}), null);
  const p = E.project(), s = src(p), d = dist(p), c = load(p, 2300);
  conn(p,s,d); conn(p,d,c);
  p.links[0].cable = {lengthM:100, sectionMm2:2.37, material:"cu"};
  let result = E.calculate(p);
  assert.equal(result.nodes.get(s.id).voltageUnbalance, false);
  assert.equal(result.nodes.get(d.id).voltageUnbalance, false); // below threshold
  c.consumerWatts = 4000;
  result = E.calculate(p);
  assert.equal(result.nodes.get(d.id).voltageUnbalance, true);
  d.mainBreaker.state = "open";
  assert.equal(E.calculate(p).nodes.get(d.id).voltageUnbalancePercent, null);
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
  assert.doesNotThrow(() => E.validate(p));
  n.outputs[0].nominalA = 1001;
  assert.throws(() => E.validate(p), /Номинал порта/);
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
test("АВР подаёт нагрузку только через один ввод и возвращается на основной", () => {
  const p = E.project();
  const main = src(p), backup = src(p), transfer = dist(p), consumer = load(p);
  backup.pos.y = 500;
  transfer.transfer = true;
  transfer.inputs.push(E.port("in", "cee3", 32));
  const connect = (from, out, to, input) => E.connect(p,
    {nodeId:from.id, portId:out.id, kind:"out"},
    {nodeId:to.id, portId:input.id, kind:"in"});
  const reserve = connect(backup, backup.outputs[0], transfer, transfer.inputs[1]);
  const normal = connect(main, main.outputs[0], transfer, transfer.inputs[0]);
  connect(transfer, transfer.outputs[0], consumer, consumer.inputs[0]);
  E.validate(p);
  const check = (active, idle, link) => {
    const result = E.calculate(p);
    assert.equal(result.activeInputs.get(transfer.id), link);
    assert.equal(E.sum(result.nodes.get(active.id).loadW), 2300);
    assert.equal(E.sum(result.nodes.get(idle.id).loadW), 0);
    assert.equal(result.nodes.get(consumer.id).powered, true);
  };
  check(main, backup, normal);
  main.outputs[0].breaker.state = "open";
  check(backup, main, reserve);
  main.outputs[0].breaker.state = "closed";
  check(main, backup, normal);
  const S = require("../schematic");
  const paths = S.connectionPaths(p);
  assert.notEqual(paths.get(reserve.id).at(-1).y, paths.get(normal.id).at(-1).y);
});

test("сценарий защиты вычисляет ток петли, диапазон времени, тепловую память и TT", () => {
  const result = E.protectionScenario({
    earthing:"TT", loopOhm:2.3, earthOhm:100, rcdMa:30, residualMa:40,
    measuredTripSeconds:.1, targetSeconds:.2, startA:100, startSeconds:1,
    starts:2, pauseSeconds:2, coolingSeconds:2,
    curve:[[100,2,4],[200,1,2]], upstreamCurve:[[100,5,7],[200,2,3]],
  },230);
  assert.ok(Math.abs(result.faultA - 100) < 1e-9);
  assert.deepEqual(result.downstream,[2,4]);
  assert.ok(result.separatedBands);
  assert.ok(Math.abs(result.thermal[0] - .5*(1+Math.exp(-1))) < 1e-9);
  assert.equal(result.ttTouchV,3);
  assert.ok(result.rcdThresholdReached && result.disconnectionWithinTarget);
});

test("примерное сечение нестандартных номиналов рассчитывается по заданной формуле",()=>{
 for(const nominalA of [6,16,80,300,600,601,5]) {
  const p={nominalA};const cable=E.cableParameters({},p,p);
  if([80,300,600].includes(nominalA)) {
   assert.equal(cable.sectionMm2,Number((0.0368*nominalA**1.3754).toFixed(2)));
   assert.equal(cable.sectionApproximate,true);
  } else if([6,16].includes(nominalA)) {
   assert.equal(cable.sectionMm2,E.CABLE_SECTIONS[nominalA]);assert.equal(cable.sectionApproximate,false);
  } else {assert.equal(cable.sectionMm2,undefined);assert.equal(cable.sectionApproximate,false);}
 }
 const p={nominalA:600};
 assert.equal(E.cableParameters({cable:{sectionMm2:185}},p,p).sectionApproximate,false);
 assert.equal(E.cableParameters({cable:{sectionMm2:185}},p,p).sectionMm2,185);
 assert.equal(E.cableParameters({},p,p,{cableDefaults:{sectionMm2:240}}).sectionApproximate,false);
});

test("номинал ввода источника ограничивает доступную мощность независимо от запаса сети",()=>{
 const p=E.project();p.settings.advancedMode=true;
 const source=E.makeNode({name:"Сеть 600 / ввод 16",category:"input",phases:1,inConnType:"cee1",inA:16,supplyA:600,supplyNominalA:16,mainA:null,outputs:[{connType:"cee1",nominalA:63,breaker:null}]});
 const load=E.makeNode({name:"Нагрузка",category:"consumer",phases:1,inConnType:"cee1",inA:63,watts:4600,mainA:null});
 p.nodes=[source,load];E.connect(p,{nodeId:source.id,portId:source.outputs[0].id},{nodeId:load.id,portId:load.inputs[0].id});
 const calc=E.calculate(p);
 assert.equal(calc.nodes.get(source.id).currentLimit,16);
 assert.equal(calc.nodes.get(source.id).availableWatts,3680);
 assert.equal(calc.nodes.get(load.id).currentLimit,16);
 assert.equal(calc.nodes.get(load.id).availableWatts,3680);
 assert.equal(calc.nodes.get(source.id).overload,true);
 assert.deepEqual(E.overloadOrigins(p,calc).find(o=>o.nodeId===source.id).phases,["L1"]);
});

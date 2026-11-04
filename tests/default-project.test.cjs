const {test}=require('node:test'), assert=require('node:assert/strict');
const D=require('../default-project'), original=require('../default-project.json');

test('демопроект запитан без перегрузок, дисбаланса и превышения падения напряжения',()=>{
  const E=require('../engine'), p=D.create(), c=E.calculate(p);
  assert.equal(c.powerFlow.converged,true);
  for(const n of p.nodes){
    const v=c.nodes.get(n.id);
    assert.ok(v.powered,n.name);
    assert.ok(!v.overload&&!v.phaseImbalance&&!v.voltageUnbalance&&!v.voltagePowerDeficit,n.name);
  }
  for(const l of p.links){
    const a=p.nodes.find(n=>n.id===l.from.nodeId),b=p.nodes.find(n=>n.id===l.to.nodeId);
    const o=a.outputs.find(o=>o.id===l.from.portId),i=b.inputs.find(i=>i.id===l.to.portId),load=c.ports.get(o.id);
    const cable=E.cableParameters(l,o,i,p.settings);
    const estimate={...E.cableEstimate(cable,o.phases,load.loadA,load.currentPhasor),...load.voltageDrop};
    assert.deepEqual(E.cableWarnings(cable,estimate,o,i,p.settings.voltageLN),[],l.id);
  }
});
test('стартовая схема сохраняет узлы, связи и настройки пользовательского файла',()=>{
  const p=D.create();
  assert.deepEqual(p.nodes,require('../engine').migrate(original).nodes);
  assert.deepEqual(p.links,original.links);
  assert.deepEqual(p.settings,original.settings);
  assert.deepEqual(p.meta,original.meta);
  p.nodes[0].name='Изменено';
  assert.equal(D.create().nodes[0].name,original.nodes[0].name);
});

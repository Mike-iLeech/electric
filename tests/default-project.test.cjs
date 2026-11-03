const {test}=require('node:test'), assert=require('node:assert/strict');
const D=require('../default-project'), original=require('../default-project.json');
test('стартовая схема сохраняет узлы, связи и настройки пользовательского файла',()=>{
  const p=D.create();
  assert.deepEqual(p.nodes,require('../engine').migrate(original).nodes);
  assert.deepEqual(p.links,original.links);
  assert.deepEqual(p.settings,original.settings);
  assert.deepEqual(p.meta,original.meta);
  p.nodes[0].name='Изменено';
  assert.equal(D.create().nodes[0].name,original.nodes[0].name);
});

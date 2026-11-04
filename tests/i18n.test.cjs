const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../engine.js');
const scripts=['i18n-help.js','i18n.js','engine.js','default-project.js','routing.js','renderer.js','schematic.js','sheet.js','app.js','export.js'];
async function editor(language='en') {
  const errors=[], writes=new Map(); let listener,settingsOpened=0;
  const project=E.project(); project.meta.name='Проект';
  const n=E.makeNode(E.catalog().find(t=>t.category==='consumer'),{x:350,y:300});n.name='Сохранить';project.nodes.push(n);
  const supply=E.makeNode(E.catalog().find(t=>t.category==='input'),{x:0,y:0});supply.name='Сохранить';project.nodes.push(supply);
  writes.set('electriccad.session.v32',JSON.stringify(project));
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),{
    url:'https://electric.example',runScripts:'outside-only',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(e)),
  });
  const w=dom.window;
  await new Promise(r=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',r,{once:true}):r());
  w.electricDesktop={info:{language,dataDirectory:'C:\\Test\\ElectricCAD Easy'}, storage:{getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)},openSettings:()=>{settingsOpened++},openDataFolder:()=>Promise.resolve(),onLanguageChanged:fn=>listener=fn};
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.ResizeObserver=class{observe(){}};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:t=>({width:String(t).length*6})},{get:(o,k)=>k in o?o[k]:()=>{}});
  w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,AA==';
  w.requestAnimationFrame=()=>1;
  for(const script of scripts) w.eval(fs.readFileSync(path.join(__dirname,'..',script),'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise(r=>setTimeout(r,0));
  return {dom,w,errors,writes,$:id=>w.document.getElementById(id),setLanguage:next=>listener(next),get settingsOpened(){return settingsOpened;}};
}

test('RU/EN меняет интерфейс и всю текстовую справку, не изменяя проект и имена пользователя',async()=>{
  const s=await editor();
  assert.deepEqual(s.errors,[]);
  assert.equal(s.w.document.documentElement.lang,'en');
  assert.equal(s.$('btnSave').textContent.trim(),'Save');
  assert.equal(s.$('projectName').value,'Проект');
  assert.equal(s.$('projectPill').textContent,'Проект');
  assert.equal(s.$('powerBranchLoads').querySelector('[data-no-translate]').textContent,'Сохранить');
  assert.match(s.$('outlinerTree').textContent,/Сохранить/);
  assert.equal(s.w.electricDiagnostics().project.nodes[0].name,'Сохранить');
  assert.equal(s.$('btnDesktopSettings').textContent,'PC updates and data');
  s.$('btnDesktopSettings').click(); assert.equal(s.settingsOpened,1);
  const helpBlocks=[...s.w.document.querySelectorAll('[data-help-translated]')];
  assert.ok(helpBlocks.length >= 146);
  for(const block of helpBlocks) assert.doesNotMatch(block.textContent,/[А-Яа-яЁё]/,block.textContent);
  for(const section of s.w.document.querySelectorAll('.helpGuide'))
    assert.doesNotMatch(section.textContent,/[А-Яа-яЁё]/,section.id);
  assert.match(s.$('helpCalculations').textContent,/Iphase = Pphase\/\(Uphase × cos φ\)/);
  const project=JSON.stringify(s.w.electricDiagnostics().project);
  s.setLanguage('ru'); await new Promise(r=>setTimeout(r,0));
  assert.equal(s.$('btnSave').textContent.trim(),'Сохранить');
  assert.match(s.$('helpNavigate').textContent,/Сенсорный экран/);
  assert.equal(JSON.stringify(s.w.electricDiagnostics().project),project);
  s.setLanguage('en'); await new Promise(r=>setTimeout(r,0));
  assert.equal(s.$('btnSave').textContent.trim(),'Save');
  assert.equal(s.$('projectPill').textContent,'Проект');
  assert.equal(s.w.ElectricI18n.t('Удалить шаблон «Проект» из каталога?'),'Delete template “Проект” from the catalog?');
  s.dom.window.close();
});

test('динамические свойства, поиск каталога и уведомления переключаются без смены значений',async()=>{
  const s=await editor();
  const n=s.w.electricDiagnostics().project.nodes[0];
  s.$('moduleNavigator').value=n.id;s.$('moduleNavigator').dispatchEvent(new s.w.Event('change'));
  await new Promise(r=>setTimeout(r,0));
  assert.match(s.$('propsBody').textContent,/Power consumption, W/);
  assert.equal(s.$('propsBody').querySelector('h3').textContent.startsWith('Сохранить'),true);
  s.$('catalogSearch').value='distributor';s.$('catalogSearch').dispatchEvent(new s.w.Event('input'));
  await new Promise(r=>setTimeout(r,0));
  assert.ok(s.$('catalog').querySelectorAll('.nodeItem').length>0);
  s.$('btnSave').click(); await new Promise(r=>setTimeout(r,0));
  assert.match(s.$('sessionStatus').textContent,/Saved on this computer/);
  assert.match(s.$('toastMsg').textContent,/Project saved/);
  assert.equal(JSON.parse(s.writes.get('electriccad.session.v32')).meta.name,'Проект');
  s.$('btnNewNode').click();
  s.$('newNodeName').value='Сохранить';
  s.$('newNodeName').dispatchEvent(new s.w.Event('input'));
  await new Promise(r=>setTimeout(r,0));
  assert.ok(s.$('builderPreview').querySelector('strong').textContent.startsWith('Сохранить'));
  s.dom.window.close();
});

test('управление и настройки переключают язык в обе стороны',async()=>{
 const s=await editor('ru');
 for(const language of ['en','ru','en']){
  s.setLanguage(language);
  assert.match(s.$('controlsDialog').textContent,language==='en'?/Touch screen/:/Сенсорный экран/);
  if(language==='en')assert.doesNotMatch(s.$('appSettingsDialog').textContent,/[А-Яа-яЁё]/);
  let closed=false;s.$('controlsDialog').close=()=>{closed=true;};
  s.$('controlsDialog').querySelector('a[href="#helpCables"]').click();
  assert.equal(closed,true);assert.equal(s.$('helpModal').getAttribute('aria-hidden'),'false');
 }
 s.dom.window.close();
});

"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {execFileSync,spawn}=require("node:child_process");
if(process.platform!=="darwin")throw Error("Run mac-verify on macOS.");
const arch=process.argv[2];
assert.ok(["arm64","x64"].includes(arch));
const root=path.join(__dirname,"../release"),name="ElectricCAD Easy";
const app=path.join(root,arch==="arm64"?"mac-arm64":"mac",name+".app");
const plist=path.join(app,"Contents/Info.plist"),version=require("../package.json").version;
const read=key=>execFileSync("/usr/libexec/PlistBuddy",["-c","Print :"+key,plist],{encoding:"utf8"}).trim();
assert.equal(read("CFBundleShortVersionString"),version);
assert.equal(read("CFBundleIdentifier"),"org.ileech.electriccad");
const executable=path.join(app,"Contents/MacOS",read("CFBundleExecutable"));
const actual=execFileSync("/usr/bin/lipo",["-archs",executable],{encoding:"utf8"}).trim();
assert.equal(actual,arch==="x64"?"x86_64":"arm64");
execFileSync("/usr/bin/codesign",["--verify","--deep","--strict",app],{stdio:"inherit"});
let icon=read("CFBundleIconFile");if(!icon.endsWith(".icns"))icon+=".icns";
assert.ok(fs.statSync(path.join(app,"Contents/Resources",icon)).size>1000);
assert.ok(fs.statSync(path.join(app,"Contents/Resources/app.asar")).size>1000000);
for(const ext of ["dmg","zip"]){
  const artifact=path.join(root,`ElectricCAD-Easy-${version}-mac-${arch}.${ext}`);
  assert.ok(fs.statSync(artifact).size>1000000);
  if(ext==="dmg")execFileSync("/usr/bin/hdiutil",["verify",artifact],{stdio:"inherit"});
}
// Launch the actual signed bundle, including its hardened runtime and preload.
// DevTools is enabled only for this isolated CI process, on loopback.
async function launchBundle(){
  const net=require("node:net");
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  const directory=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"electriccad-packaged-"));
  const env={...process.env,ELECTRICCAD_DATA_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(executable,[`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1"],{env,stdio:["ignore","pipe","pipe"]});
  let log="",spawnError;child.on("error",error=>{spawnError=error;});
  for(const stream of [child.stdout,child.stderr])stream.on("data",data=>{log=(log+data).slice(-12000);});
  let socket;
  try{
    const deadline=Date.now()+60000;let target;
    while(Date.now()<deadline){
      if(spawnError)throw spawnError;
      if(child.exitCode!==null||child.signalCode!==null)throw Error("Packaged app exited: "+log);
      try{
        const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500)})).json();
        target=targets.find(item=>item.type==="page"&&item.url==="electriccad://app/index.html");
        if(target)break;
      }catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(target,"Packaged renderer did not load: "+log);
    socket=new WebSocket(target.webSocketDebuggerUrl);
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("Packaged renderer probe timeout: "+log)),20000);
      socket.addEventListener("error",()=>{clearTimeout(timer);reject(Error("DevTools connection failed"));});
      socket.addEventListener("open",()=>socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{
        expression:"(async()=>{for(let i=0;i<100&&typeof electricDiagnostics!=='function';i++)await new Promise(r=>setTimeout(r,100));const s=await electricDesktop.getSettings();return {nodes:electricDiagnostics().project.nodes.length,packaged:s.packaged,supported:s.update.supported,status:s.update.status,nodeIntegration:typeof require};})()",
        awaitPromise:true,returnByValue:true,
      }})));
      socket.addEventListener("message",event=>{
        const message=JSON.parse(event.data);if(message.id!==1)return;
        clearTimeout(timer);
        if(message.error||message.result?.exceptionDetails)reject(Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
    });
    assert.ok(result.nodes>0);assert.equal(result.packaged,true);
    assert.equal(result.supported,false);assert.equal(result.status,"manual");
    assert.equal(result.nodeIntegration,"undefined");
  }finally{
    socket?.close();
    if(!spawnError&&child.pid&&child.exitCode===null&&child.signalCode===null){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error("Packaged app did not terminate")),5000);
        child.once("exit",()=>{clearTimeout(timer);resolve();});
        if(!child.kill("SIGKILL")){clearTimeout(timer);reject(Error("Cannot terminate packaged app"));}
      });
    }
  }
  console.log("MAC_VERIFY_PASS "+arch+" "+version+" packaged app launch");
}
launchBundle().catch(error=>{console.error(error);process.exitCode=1;});

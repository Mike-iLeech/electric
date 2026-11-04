"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
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
console.log("MAC_VERIFY_PASS "+arch+" "+version);

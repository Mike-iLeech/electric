const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const phase = process.argv[2];
const directory = process.env.ELECTRICCAD_DATA_DIR;
const errors = [];
let editorObserved = false;
const timer = setTimeout(() => { console.error("Desktop smoke timeout", errors); app.exit(1); }, 80000);
app.on("browser-window-created", (_event, win) => {
  if (editorObserved) return;
  editorObserved = true;
  win.webContents.on("console-message", (_event, ...args) => {
    const details = args[0];
    const message = typeof details === "object" ? details.message : args[1];
    if (/Uncaught|Refused to|Unable to load preload|Error/.test(message)) errors.push(message);
  });
  win.webContents.once("did-finish-load", async () => {
    try {
      const js = code => win.webContents.executeJavaScript(code);
      assert.equal(await js("typeof window.electricDesktop"), "object");
      assert.equal(await js("typeof require"), "undefined");
      assert.ok(await js("electricDiagnostics().project.nodes.length > 0"));
      assert.equal(await js("document.getElementById('desktopData').hidden"), false);
      assert.equal(await js("document.querySelectorAll('[data-gif]').length"), 5);
      assert.equal(await js("electricDesktop.info.dataDirectory"), directory);
      if (phase === "write") {
        const originalName = await js("electricDiagnostics().project.meta.name");
        await js("electricDesktop.openSettings()");
        const settings = BrowserWindow.getAllWindows().find(candidate => candidate !== win);
        assert.ok(settings, "settings window opens");
        if (settings.webContents.isLoading()) await new Promise(resolve => settings.webContents.once("did-finish-load", resolve));
        const settingsJS = code => settings.webContents.executeJavaScript(code);
        for (let i = 0; i < 30 && !await settingsJS("document.getElementById('version').textContent"); i++)
          await new Promise(resolve => setTimeout(resolve, 50));
        await settingsJS("document.getElementById('language').value='en'; document.getElementById('language').dispatchEvent(new Event('change'))");
        for (let i = 0; i < 30 && await js("document.documentElement.lang") !== "en"; i++)
          await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(await js("document.documentElement.lang"), "en");
        assert.equal(await settingsJS("document.querySelector('h1').textContent"), "Settings");
        assert.equal(await js("electricDiagnostics().project.meta.name"), originalName);
        await settingsJS("document.getElementById('autoUpdate').checked=false; document.getElementById('autoUpdate').dispatchEvent(new Event('change'))");
        for (let i = 0; i < 30 && (await js("electricDesktop.getSettings()")).preferences.autoUpdate; i++)
          await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal((await js("electricDesktop.getSettings()")).preferences.autoUpdate, false);
        assert.equal((await js("electricDesktop.getSettings()")).update.canInstall, false);
        const blocked = await settingsJS("(() => { try { electricDesktop.storage.getItem('electriccad.session.v32'); return false; } catch { return true; } })()");
        assert.equal(blocked, true, "settings frame cannot read the editor project via IPC");
        fs.writeFileSync(path.join(directory, "settings-en.png"), (await settings.webContents.capturePage()).toPNG());
        settings.close();
        await js(`electricDesktop.storage.setItem('electriccad.templates.v32', '[]');
          document.getElementById('toggleLeftSidebar').click();`);
        // Close immediately, before the app's 500 ms save debounce.
        await js(`const name = document.getElementById('projectName'); name.focus();
          name.value = 'Desktop persistence — немедленное закрытие'; name.dispatchEvent(new Event('change'));`);
      } else {
        assert.equal(await js("document.documentElement.lang"), "en");
        assert.equal((await js("electricDesktop.getSettings()")).preferences.autoUpdate, false);
        await js("electricDesktop.setPreferences({language:'ru'})");
        for (let i = 0; i < 30 && await js("document.documentElement.lang") !== "ru"; i++)
          await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(await js("electricDiagnostics().project.meta.name"), "Desktop persistence — немедленное закрытие");
        assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "Settings/ui.json"), "utf8")).hideLeft, true);
        await js("document.getElementById('toggleLeftSidebar').click()");
        const download = async (extension, trigger) => {
          const file = path.join(directory, "Exports", "smoke." + extension);
          const done = new Promise((resolve, reject) => {
            win.webContents.session.once("will-download", (_event, item) => {
              try {
                const options = item.getSaveDialogOptions();
                assert.ok(options.defaultPath.startsWith(directory));
                assert.equal(options.filters[0].extensions[0], extension);
                item.setSavePath(file);
                item.once("done", (_event, state) => state === "completed" ? resolve() : reject(new Error(state)));
              } catch (error) { reject(error); }
            });
          });
          await js(trigger);
          await done;
          return fs.readFileSync(file);
        };
        const json = await download("json", "document.getElementById('btnSave').click()");
        assert.equal(JSON.parse(json).meta.name, "Desktop persistence — немедленное закрытие");
        await js("document.getElementById('btnExport').click()");
        for (let i = 0; i < 150 && !await js("!!document.querySelector('[title=\"Сохранить PDF\"]')"); i++)
          await new Promise(resolve => setTimeout(resolve, 100));
        const pdf = await download("pdf", "document.querySelector('[title=\"Сохранить PDF\"]').click()");
        assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
        const png = await download("png", "document.querySelector('[title=\"Сохранить PNG\"]').click()");
        assert.equal(png.subarray(1, 4).toString(), "PNG");
        const jpg = await download("jpg", "document.querySelector('[title=\"Сохранить JPG\"]').click()");
        assert.equal(jpg.subarray(0, 2).toString("hex"), "ffd8");
        assert.equal(await js("document.querySelectorAll('.projectSettingsRow > button').length"),1);
        await js("document.querySelector('.schemeExport [aria-label=\"Закрыть\"]').click();document.getElementById('btnAppSettings').click()");
        assert.equal(await js("document.getElementById('appSettingsDialog').open && !document.getElementById('pcSettingsInline').hidden"),true);
        assert.equal(await js("document.getElementById('appSettingsDialog').contains(document.getElementById('autoUpdate'))"),true);
        assert.equal(await js("!!document.querySelector('.exportCompletionToast button')"),true);
      }
      await new Promise(resolve=>setTimeout(resolve,200));
      fs.writeFileSync(path.join(directory, phase + ".png"), (await win.webContents.capturePage()).toPNG());
      assert.equal(await js("electricPrepareToExit()"), true);
      assert.deepEqual(errors, []);
      clearTimeout(timer);
      win.close();
      console.log("PASS desktop " + phase);
    } catch (error) { console.error(error, errors); app.exit(1); }
  });
});
require("../desktop/main.cjs");

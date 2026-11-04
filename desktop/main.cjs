"use strict";
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStorage } = require("./storage.cjs");
const { createPreferences } = require("./preferences.cjs");
const { createUpdateService } = require("./updates.cjs");
const translate = require("./strings.cjs");

const APP_URL = "electriccad://app/index.html";
const SETTINGS_URL = "electriccad://app/settings.html";
const root = process.env.ELECTRICCAD_DATA_DIR
  ? path.resolve(process.env.ELECTRICCAD_DATA_DIR)
  : path.join(app.getPath("appData"), "ElectricCAD Easy");
app.setName("ElectricCAD Easy");
app.setPath("userData", root);
app.setPath("sessionData", path.join(root, "Browser"));
app.setAppUserModelId("org.ileech.electriccad");
protocol.registerSchemesAsPrivileged([{ scheme: "electriccad", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let mainWindow, settingsWindow, preferences, updates;
const exportedFiles = new Map();
const t = value => translate(preferences?.read().language || "ru", value);
function isAppURL(value) {
  try { const url = new URL(value); url.hash = ""; return url.href === APP_URL; }
  catch { return false; }
}
function trusted(event) {
  return mainWindow && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame && isAppURL(event.senderFrame.url);
}
function trustedSettings(event) {
  return settingsWindow && !settingsWindow.isDestroyed() && event.sender === settingsWindow.webContents &&
    event.senderFrame === settingsWindow.webContents.mainFrame && event.senderFrame.url === SETTINGS_URL;
}
function trustedWindow(event) { return trusted(event) || trustedSettings(event); }
function snapshot() {
  return { preferences: preferences.read(), update: updates.state(), version: app.getVersion(),
    dataDirectory: root, packaged: app.isPackaged };
}
function publishSettings() {
  if (!updates) return;
  for (const win of [mainWindow, settingsWindow])
    if (win && !win.isDestroyed()) win.webContents.send("electric:settings-changed", snapshot());
}
function secureWindow(win, allowedURL) {
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== allowedURL) { event.preventDefault(); openExternal(url); }
  });
  win.webContents.on("will-attach-webview", event => event.preventDefault());
}
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ parent: mainWindow, width: 680, height: 900, minWidth: 540, minHeight: 560,
    title: t("Настройки ElectricCAD Easy"), backgroundColor: "#0b1018", show: false,
    icon: path.join(__dirname, "assets/icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
      nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true },
  });
  settingsWindow.setMenu(null);
  secureWindow(settingsWindow, SETTINGS_URL);
  settingsWindow.once("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("closed", () => { settingsWindow = null; });
  settingsWindow.loadURL(SETTINGS_URL).catch(() => {});
}
function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "ileech.mywire.org" || url.hostname === "github.com"))
      shell.openExternal(url.href).catch(() => {});
  } catch {}
}
function command(id) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click()`).catch(() => {});
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(async () => {
    const storage = createStorage(root);
    preferences = createPreferences(root);
    const { autoUpdater } = require("electron-updater");
    updates = createUpdateService({ updater: autoUpdater, app, readPreferences: preferences.read,
      patchPreferences: changes => preferences.patch(changes),
      onChange: () => publishSettings(),
    });
    const html = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8").replace(/\r\n?/g, "\n");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, source]) =>
      "'sha256-" + crypto.createHash("sha256").update(source).digest("base64") + "'");
    const csp = `default-src 'none'; script-src ${scripts.join(" ")}; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
    protocol.handle("electriccad", request => {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Not found", { status: 404 });
      if (url.pathname === "/favicon.ico") return new Response(fs.readFileSync(path.join(__dirname, "assets/icon.ico")), { headers: { "Content-Type": "image/x-icon" } });
      const assets = { "/settings.html": "text/html; charset=utf-8", "/settings.js": "text/javascript; charset=utf-8", "/settings.css": "text/css; charset=utf-8" };
      if (Object.hasOwn(assets, url.pathname) && !url.search)
        return new Response(fs.readFileSync(path.join(__dirname, url.pathname.slice(1))), { headers: {
          "Content-Type": assets[url.pathname], "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
        } });
      if (url.href !== APP_URL) return new Response("Not found", { status: 404 });
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } });
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    ipcMain.on("electric:storage", (event, payload) => {
      try {
        const { action, key, value } = payload || {};
        if (!(action === "info" ? trustedWindow(event) : trusted(event))) throw new Error("Доступ запрещён");
        let result;
        if (action === "info") result = { dataDirectory: root, version: app.getVersion(), language: preferences.read().language };
        else if (action === "get") result = storage.getItem(key);
        else if (action === "set") storage.setItem(key, value);
        else throw new Error("Неизвестное действие");
        event.returnValue = { ok: true, value: result };
      } catch (error) { event.returnValue = { ok: false, error: error.message }; }
    });
    ipcMain.handle("electric:open-data", async event => {
      if (!trustedWindow(event)) throw new Error("Доступ запрещён");
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
    });
    const handle = (name, callback) => ipcMain.handle(name, (event, value) => {
      if (!trustedWindow(event)) throw new Error("Доступ запрещён");
      return callback(value);
    });
    handle("electric:open-settings", () => openSettings());
    handle("electric:open-export", async token => {const file=exportedFiles.get(token);if(!file)throw Error("Неизвестный экспорт");const error=await shell.openPath(file);if(error)throw Error(error);});
    handle("electric:get-settings", () => snapshot());
    handle("electric:set-preferences", changes => {
      const before = preferences.read();
      const after = preferences.patch(changes, {fromRenderer:true});
      if (before.language !== after.language) {
        updateMenu();
        for (const win of [mainWindow, settingsWindow])
          if (win && !win.isDestroyed()) win.webContents.send("electric:language", after.language);
      }
      updates.refreshSchedule(); publishSettings(); return snapshot();
    });
    handle("electric:check-updates", async () => { await updates.check({manual:true}); return snapshot(); });
    handle("electric:download-update", async () => { await updates.download(); return snapshot(); });
    let installing = false;
    handle("electric:install-update", async () => {
      if (installing || !updates.state().canInstall) return snapshot();
      installing = true;
      try {
        const saved = await mainWindow.webContents.executeJavaScript("window.electricPrepareToExit?.() === true");
        if (!saved) {
          await dialog.showMessageBox(settingsWindow || mainWindow, { type: "warning", title:t("Сначала сохраните проект"),
            message:t("Обновление не установлено: не удалось сохранить текущие данные.") });
          return snapshot();
        }
        // The updater takes over quitting immediately after data has reached disk.
        updates.install();
        return snapshot();
      } finally { installing = false; }
    });
    mainWindow = new BrowserWindow({
      width: 1440, height: 940, minWidth: 900, minHeight: 600,
      backgroundColor: "#0b0f14", title: "ElectricCAD Easy", show: false,
      icon: path.join(__dirname, "assets/icon.ico"),
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true },
    });
    mainWindow.once("ready-to-show", () => mainWindow.show());
    secureWindow(mainWindow, APP_URL);
    mainWindow.webContents.on("will-prevent-unload", event => {
      const response = dialog.showMessageBoxSync(mainWindow, { type: "warning", title: t("Данные не сохранены"),
        message: t("Не удалось сохранить изменения на диск."),
        detail: t("Вернитесь в редактор и сохраните проект в JSON или проверьте доступ к папке данных."),
        buttons: [t("Вернуться в редактор"), t("Закрыть без сохранения")], defaultId: 0, cancelId: 0, noLink: true });
      if (response === 1) event.preventDefault();
    });
    session.defaultSession.on("will-download", (_event, item, contents) => {
      if (contents !== mainWindow.webContents || !isAppURL(contents.getURL())) { item.cancel(); return; }
      const filename = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      const ext = path.extname(filename).slice(1).toLowerCase();
      if (!["json", "pdf", "png", "jpg"].includes(ext)) { item.cancel(); return; }
      const folder = ext === "json" ? "Projects" : "Exports";
      item.setSaveDialogOptions({ title: t("Сохранить") + " " + ext.toUpperCase(), defaultPath: path.join(root, folder, filename),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      item.once("done", (_event, state) => {
        if(state === "completed" && !mainWindow.isDestroyed() && ext !== "json") {
          const token=crypto.randomUUID(), file=item.getSavePath();exportedFiles.set(token,file);
          if(exportedFiles.size>100)exportedFiles.delete(exportedFiles.keys().next().value);
          mainWindow.webContents.send("electric:export-completed",{token,path:file});
        }
        if (state === "interrupted" && !mainWindow.isDestroyed())
          dialog.showMessageBox(mainWindow, { type: "error", message: t("Не удалось сохранить файл"), detail: t("Проверьте свободное место и доступ к выбранной папке.") });
      });
    });
    function updateMenu() {
    const menu = [
      { label: "Проект", submenu: [
        { label: "Сохранить проект JSON…", click: () => command("btnSave") },
        { label: "Импортировать JSON…", click: () => command("btnImport") },
        { label: "Экспорт схемы…", click: () => command("btnExport") },
        { type: "separator" }, { label: "Открыть папку данных", click: () => shell.openPath(root) },
        { type: "separator" }, { label: "Выход", role: "quit" },
      ] },
      { label: "Настройки", submenu: [
        { label: "Настройки приложения…", accelerator:"Ctrl+,", click:()=>command("btnAppSettings") },
        { label: "Проверить обновления…", click: () => { command("btnAppSettings"); void updates.check({manual:true}); } },
      ] },
      { label: "Окно", submenu: [{ label: "На весь экран", role: "togglefullscreen" }] },
      { label: "Помощь", submenu: [
        { label: "Справка", click: () => command("helpTip") },
        { label: "GitHub", click: () => openExternal("https://github.com/Mike-iLeech/electric") },
        { label: "О программе", click: () => dialog.showMessageBox(mainWindow, { type: "info", title: "ElectricCAD Easy",
          message: `ElectricCAD Easy ${app.getVersion()}`, detail: `${t("Автономный редактор электрических схем.")}\n\n${t("Папка данных")}:\n${root}\n\n${t("Сайт и Windows-приложение хранят проекты отдельно. Для переноса используйте JSON.")}` }) },
      ] },
    ];
    function localize(items) { return items.map(item => ({...item, ...(item.label ? {label:t(item.label)} : {}), ...(item.submenu ? {submenu:localize(item.submenu)} : {})})); }
    Menu.setApplicationMenu(Menu.buildFromTemplate(localize(menu)));
    }
    updateMenu();
    await mainWindow.loadURL(APP_URL);
    updates.start();
  }).catch(error => {
    dialog.showErrorBox("ElectricCAD Easy — ошибка запуска", "Не удалось открыть приложение или папку данных.\n" + error.message);
    app.exit(1);
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => updates?.stop());
}

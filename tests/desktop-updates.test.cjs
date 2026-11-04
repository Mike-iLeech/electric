const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createUpdateService, WEEK_MS } = require("../desktop/updates.cjs");

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(t, options = {}) {
  const updater = new EventEmitter();
  let checks = 0, downloads = 0, installs = 0, time = 1800000000000;
  let preferences = { autoUpdate: true, lastUpdateCheck: 0, ...options.preferences };
  const timers = new Map(), changes = [];
  let timerID = 0;
  updater.checkForUpdates = async () => { checks++; updater.emit("update-not-available", { version: "32.0.0" }); return {}; };
  updater.downloadUpdate = async () => { downloads++; updater.emit("update-downloaded", { version: "32.1.0" }); return ["test-installer.exe"]; };
  updater.quitAndInstall = (silent, runAfter) => { assert.equal(silent, false); assert.equal(runAfter, true); installs++; };
  const service = createUpdateService({
    supported: options.supported ?? true,
    updater,
    app: { isPackaged: options.packaged ?? true, getVersion: () => "32.0.0" },
    readPreferences: () => preferences,
    patchPreferences: patch => { if (options.failWrite) throw new Error("readonly"); preferences = { ...preferences, ...patch }; },
    now: () => time,
    setTimer: (callback, delay) => { const id = ++timerID; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimer: id => timers.delete(id),
    onChange: value => { changes.push(value); if (options.failObserver) throw new Error("Window closed"); },
  });
  t.after(() => service.dispose());
  return {
    service, updater, timers, changes,
    counts: () => ({ checks, downloads, installs }),
    preferences: () => preferences,
    setPreferences: patch => { preferences = { ...preferences, ...patch }; service.refreshSchedule(); },
    available() {
      updater.checkForUpdates = async () => { checks++; updater.emit("update-available", { version: "32.1.0", releaseNotes: "<script>ignored</script>" }); return {}; };
    },
    async advance(amount) {
      time += amount;
      const due = [...timers.entries()].filter(([, item]) => item.due <= time);
      for (const [id, item] of due) { timers.delete(id); item.callback(); }
      await flush();
    },
  };
}

test("updates: еженедельное расписание хранит время проверки и не повторяет её при перезапуске", async t => {
  const first = fixture(t);
  first.service.start();
  await first.advance(0);
  assert.equal(first.counts().checks, 1);
  assert.equal(first.service.state().status, "up-to-date");
  const saved = first.preferences().lastUpdateCheck;
  const second = fixture(t, { preferences: { lastUpdateCheck: saved } });
  second.service.start();
  await second.advance(WEEK_MS - 1);
  assert.equal(second.counts().checks, 0);
  await second.advance(1);
  assert.equal(second.counts().checks, 1);
  assert.equal(second.preferences().lastUpdateCheck, saved + WEEK_MS);
  assert.equal([...second.timers.values()][0].due, saved + 2 * WEEK_MS);
});

test("updates: отключение отменяет таймер, ручная проверка остаётся без фоновой загрузки", async t => {
  const f = fixture(t);
  f.available();
  f.service.start();
  f.setPreferences({ autoUpdate: false });
  assert.equal(f.timers.size, 0);
  await f.advance(WEEK_MS);
  assert.equal(f.counts().checks, 0);
  await f.service.check({ manual: true });
  assert.equal(f.service.state().status, "available");
  assert.equal(f.counts().downloads, 0);
  assert.equal(f.service.state().canDownload, true);
  f.setPreferences({ autoUpdate: true });
  assert.equal(f.timers.size, 1);
});

test("updates: одновременные ручные и автоматические проверки используют один запрос", async t => {
  const f = fixture(t, { preferences: { autoUpdate: false } });
  const gate = deferred();
  let checks = 0;
  f.updater.checkForUpdates = async () => { checks++; await gate.promise; f.updater.emit("update-not-available", {}); return {}; };
  const first = f.service.check({ manual: true });
  const second = f.service.check({ manual: true });
  assert.equal(first, second);
  await flush();
  assert.equal(checks, 1);
  assert.equal(f.service.state().canCheck, false);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(f.service.state().canCheck, true);
});

test("updates: ошибка сети и отсутствие релиза не вызывают повтор на каждом запуске", async t => {
  for (const [message, expected] of [["net::ERR_INTERNET_DISCONNECTED", "network"], ["404 Not Found", "no-release"]]) {
    const f = fixture(t);
    f.updater.checkForUpdates = async () => { throw new Error(message); };
    f.service.start();
    await f.advance(0);
    assert.equal(f.service.state().errorCode, expected);
    assert.equal(f.service.state().lastCheckedAt, f.preferences().lastUpdateCheck);
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers.values()][0].due, f.preferences().lastUpdateCheck + WEEK_MS);
    const restarted = fixture(t, { preferences: f.preferences() });
    restarted.service.start();
    await restarted.advance(0);
    assert.equal(restarted.counts().checks, 0);
  }
});

test("updates: GitHub без опубликованных версий возвращает no-release даже без кода ошибки", async t => {
  const f = fixture(t);
  f.updater.checkForUpdates = async () => { throw new Error("No published versions on GitHub"); };
  const state = await f.service.check({ manual: true });
  assert.equal(state.status, "no-release");
  assert.equal(state.errorCode, "no-release");
  assert.equal(state.errorStage, "check");
  assert.equal(state.canCheck, true);
  assert.equal(state.canDownload, false);
});

test("updates: отсутствие файла канала у релиза считается invalid-release, даже при HTTP 404", async t => {
  const f = fixture(t);
  f.updater.checkForUpdates = async () => {
    throw Object.assign(new Error("Cannot find latest.yml in the latest release artifacts (404 Not Found)"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    });
  };
  const state = await f.service.check({ manual: true });
  assert.equal(state.status, "error");
  assert.equal(state.errorCode, "invalid-release");
  assert.equal(state.errorStage, "check");
  assert.equal(state.canCheck, true);
  assert.equal(state.canDownload, false);
});

test("updates: фоновая загрузка доступной версии не устанавливает её при обычном закрытии", async t => {
  const f = fixture(t, { failObserver: true });
  f.available();
  f.service.start();
  await f.advance(0);
  assert.equal(f.service.state().status, "downloaded");
  assert.equal(f.counts().downloads, 1);
  assert.equal(f.counts().installs, 0);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.updater.disableWebInstaller, true);
  assert.equal(f.service.state().canInstall, true);
  assert.equal(f.service.state().nextCheckAt, null);
  assert.equal("releaseNotes" in f.service.state(), false);
  assert.equal(f.service.install(), true);
  assert.equal(f.counts().installs, 1);
  assert.equal(f.service.install(), false);
});

test("updates: обновление загружается без сертификата и устанавливается по команде", async t => {
  const f = fixture(t);
  f.available();
  f.service.start();
  await f.advance(0);
  assert.equal(f.counts().downloads, 1);
  assert.equal(f.service.state().canInstall, true);
  assert.equal(f.counts().installs, 0);
  assert.equal(f.service.install(), true);
});

test("updates: прогресс нормализуется; ошибка подписи не превращается в готовый установщик", async t => {
  const f = fixture(t, { preferences: { autoUpdate: false } });
  f.available();
  await f.service.check({ manual: true });
  const gate = deferred();
  let downloads = 0;
  f.updater.downloadUpdate = async () => {
    downloads++;
    f.updater.emit("download-progress", { percent: 142, total: -1, transferred: NaN, bytesPerSecond: 150 });
    await gate.promise;
    throw Object.assign(new Error("Publisher signature mismatch"), { code: "ERR_UPDATER_INVALID_SIGNATURE" });
  };
  const first = f.service.download(), second = f.service.download();
  assert.equal(first, second);
  await flush();
  assert.equal(downloads, 1);
  assert.equal(f.service.state().progress, 100);
  assert.deepEqual(f.service.state().downloadStats, { percent: 100, total: 0, transferred: 0, bytesPerSecond: 150 });
  gate.resolve();
  await first;
  assert.equal(f.service.state().errorCode, "signature");
  assert.equal(f.service.state().canInstall, false);
  assert.equal(f.service.install(), false);
});

test("updates: dev-режим не обращается к сети даже по ручной команде", async t => {
  const f = fixture(t, { packaged: false });
  f.service.start();
  await f.advance(WEEK_MS);
  await f.service.check({ manual: true });
  await f.service.download();
  assert.equal(f.service.state().status, "dev");
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.counts(), { checks: 0, downloads: 0, installs: 0 });
});

test("updates: ручное обновление macOS не запускает сеть или установщик", async t => {
  const f = fixture(t, { supported: false });
  f.service.start();
  await f.advance(WEEK_MS);
  await f.service.check({ manual: true });
  await f.service.download();
  assert.equal(f.service.install(), false);
  const state = f.service.state();
  assert.equal(state.status, "manual");
  assert.equal(state.nextCheckAt, null);
  assert.equal(state.canCheck, false);
  assert.equal(state.canDownload, false);
  assert.equal(state.canInstall, false);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.counts(), { checks: 0, downloads: 0, installs: 0 });
});

test("updates: ошибка записи настроек не запускает сеть и не создаёт цикл повторов", async t => {
  const f = fixture(t, { failWrite: true });
  f.service.start();
  await f.advance(0);
  assert.equal(f.service.state().errorCode, "preferences-write-failed");
  assert.equal(f.counts().checks, 0);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].due, 1800000000000 + WEEK_MS);
});

test("updates: смена часов назад и остановка сервиса не оставляют бесконечного таймера", async t => {
  const f = fixture(t, { preferences: { lastUpdateCheck: 1900000000000 } });
  f.service.start();
  await f.advance(0);
  assert.equal(f.counts().checks, 1);
  f.service.stop();
  assert.equal(f.timers.size, 0);
  await f.advance(WEEK_MS * 4);
  assert.equal(f.counts().checks, 1);
});

test("updates: выключение автоматической проверки во время запроса не запускает загрузку", async t => {
  const f = fixture(t);
  const gate = deferred();
  f.updater.checkForUpdates = async () => {
    await gate.promise;
    f.updater.emit("update-available", { version: "32.1.0" });
    return {};
  };
  f.service.start();
  await f.advance(0);
  f.setPreferences({ autoUpdate: false });
  gate.resolve();
  await flush();
  assert.equal(f.service.state().status, "available");
  assert.equal(f.counts().downloads, 0);
  assert.equal(f.timers.size, 0);
  await f.service.download();
  assert.equal(f.counts().downloads, 1);
  assert.equal(f.service.state().canInstall, true);
});

test("updates: синхронная ошибка запуска установщика не выдаётся за успешный запуск", async t => {
  const f = fixture(t);
  f.available();
  f.service.start();
  await f.advance(0);
  f.updater.quitAndInstall = () => f.updater.emit("error", new Error("Installer cannot start"));
  assert.equal(f.service.install(), false);
  assert.equal(f.service.state().status, "error");
  assert.equal(f.service.state().errorStage, "install");
  assert.equal(f.service.state().canInstall, true);
});

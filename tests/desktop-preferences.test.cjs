const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPreferences, normalize } = require("../desktop/preferences.cjs");
const { createUpdateService, WEEK_MS } = require("../desktop/updates.cjs");
const { EventEmitter } = require("node:events");

function fixture(t) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "electriccad-preferences-"));
  const file = path.join(root, "Settings", "application.json");
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("electriccad-preferences-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, file, preferences: createPreferences(root) };
}

test("preferences: первый запуск использует русский язык и автоматическую проверку", t => {
  const f = fixture(t);
  assert.deepEqual(f.preferences.read(), { language: "ru", autoUpdate: true, lastUpdateCheck: 0 });
  assert.ok(fs.statSync(path.dirname(f.file)).isDirectory());
  const snapshot = f.preferences.read();
  snapshot.language = "en";
  assert.equal(f.preferences.read().language, "ru");
});

test("preferences: язык, переключатель и дата сохраняются между процессами", t => {
  const f = fixture(t);
  f.preferences.patch({ language: "en", autoUpdate: false }, { fromRenderer: true });
  f.preferences.patch({ lastUpdateCheck: 1800000000000 });
  const expected = { language: "en", autoUpdate: false, lastUpdateCheck: 1800000000000 };
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, "utf8")), expected);
  assert.deepEqual(createPreferences(f.root).read(), expected);
  assert.equal(fs.existsSync(f.file + ".tmp"), false);
});

test("preferences: renderer не может изменить дату следующей проверки или произвольный ключ", t => {
  const f = fixture(t);
  f.preferences.patch({ lastUpdateCheck: 1800000000000 });
  const before = fs.readFileSync(f.file, "utf8");
  for (const patch of [
    { lastUpdateCheck: 0 }, { nextCheckAt: 0 }, { publisherName: "Other" },
    { language: "en", lastUpdateCheck: 1900000000000 },
    JSON.parse('{"__proto__":{"autoUpdate":false}}'), { constructor: {} },
  ]) assert.throws(() => f.preferences.patch(patch, { fromRenderer: true }), /Unknown preference/);
  assert.equal(fs.readFileSync(f.file, "utf8"), before);
  assert.equal(f.preferences.read().language, "ru");
});

test("preferences: неверные типы и значения отклоняются до записи", t => {
  const f = fixture(t);
  f.preferences.patch({ language: "en" });
  const before = fs.readFileSync(f.file, "utf8");
  for (const patch of [
    null, [], "en", { language: "de" }, { language: 1 }, { autoUpdate: "false" },
    { autoUpdate: 0 }, { lastUpdateCheck: -1 }, { lastUpdateCheck: Infinity },
    { lastUpdateCheck: NaN }, { lastUpdateCheck: "1800000000000" },
    { unknown: "value" },
  ]) assert.throws(() => f.preferences.patch(patch), /Invalid|Unknown/);
  assert.equal(fs.readFileSync(f.file, "utf8"), before);
  assert.equal(f.preferences.read().language, "en");
});

test("preferences: повреждённый JSON сохраняется отдельной копией до восстановления настроек", t => {
  const f = fixture(t);
  const original = '{"language":"en", broken';
  fs.writeFileSync(f.file, original, "utf8");
  const recovered = createPreferences(f.root);
  assert.deepEqual(recovered.read(), { language: "ru", autoUpdate: true, lastUpdateCheck: 0 });
  assert.equal(fs.readFileSync(f.file, "utf8"), original);
  const backups = fs.readdirSync(path.dirname(f.file)).filter(name => name.startsWith("application.json.corrupt-"));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(f.file), backups[0]), "utf8"), original);
  recovered.patch({ language: "en" });
  assert.equal(JSON.parse(fs.readFileSync(f.file, "utf8")).language, "en");
  assert.equal(fs.readFileSync(path.join(path.dirname(f.file), backups[0]), "utf8"), original);
});

test("preferences: ошибка атомарного переименования сохраняет предыдущие настройки и память", t => {
  const f = fixture(t);
  f.preferences.patch({ language: "en", autoUpdate: false });
  const before = fs.readFileSync(f.file, "utf8"), state = f.preferences.read();
  const rename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (destination === f.file) throw Object.assign(new Error("Disk write failed"), { code: "EACCES" });
    return rename(source, destination);
  };
  try { assert.throws(() => f.preferences.patch({ language: "ru" }), /Disk write failed/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(f.file, "utf8"), before);
  assert.deepEqual(f.preferences.read(), state);
  assert.equal(fs.existsSync(f.file + ".tmp"), false);
});

test("preferences: нормализация неизвестных сохранённых значений не включает лишние параметры", () => {
  assert.deepEqual(normalize({ language: "de", autoUpdate: "false", lastUpdateCheck: -1, feed: "https://example.test" }),
    { language: "ru", autoUpdate: true, lastUpdateCheck: 0 });
  assert.deepEqual(normalize(null), { language: "ru", autoUpdate: true, lastUpdateCheck: 0 });
});

test("preferences: реальный файл даты удерживает недельный интервал после повторного создания сервиса", t => {
  const f = fixture(t), time = 1800000000000;
  f.preferences.patch({ lastUpdateCheck: time });
  const reopened = createPreferences(f.root), updater = new EventEmitter();
  let delay;
  const service = createUpdateService({
    updater, app: { isPackaged: true, getVersion: () => "32.0.0" },
    readPreferences: reopened.read, patchPreferences: changes => reopened.patch(changes),
    now: () => time + 5000, setTimer: (_callback, value) => { delay = value; return 1; }, clearTimer: () => {},
  });
  t.after(() => service.dispose());
  service.start();
  assert.equal(delay, WEEK_MS - 5000);
  assert.equal(service.state().nextCheckAt, time + WEEK_MS);
  assert.equal(service.state().lastCheckedAt, time);
});

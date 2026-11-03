const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage, FILES } = require("../desktop/storage.cjs");

const SESSION = "electriccad.session.v32";
const BACKUP = "electriccad.session.v32.backup";
const CUSTOM = "electriccad.templates.v32";
const UI = "electriccad.ui.v32";
const project = name => JSON.stringify({ meta: { name }, nodes: [], links: [] });

function fixture(t) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "electriccad-storage-test-"));
  t.after(() => {
    // Only remove the exact temporary directory created by this test.
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("electriccad-storage-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, storage: createStorage(root) };
}

test("desktop: все четыре раздела сохраняются отдельно и доступны после повторного открытия", t => {
  const { root, storage } = fixture(t);
  const values = new Map([
    [SESSION, project("Текущий проект — кириллица")],
    [BACKUP, project("Предыдущий проект")],
    [CUSTOM, JSON.stringify([{ id: "custom-1", name: "Мой модуль" }])],
    [UI, JSON.stringify({ treeHeight: 284, hideRight: true })],
  ]);
  for (const [key, value] of values) {
    assert.equal(storage.getItem(key), null);
    storage.setItem(key, value);
    assert.equal(fs.readFileSync(path.join(root, ...FILES[key]), "utf8"), value);
  }
  const reopened = createStorage(root);
  for (const [key, value] of values) assert.equal(reopened.getItem(key), value);
  for (const name of ["Projects", "Backups", "Settings", "Exports", "Browser"])
    assert.ok(fs.statSync(path.join(root, name)).isDirectory(), name);
});

test("desktop: allowlist запрещает произвольные пути, traversal и свойства прототипа", t => {
  const { root, storage } = fixture(t);
  for (const key of [
    "", "unknown", "../outside.json", "..\\outside.json",
    path.join(root, "outside.json"), "__proto__", "constructor", "toString",
    SESSION + "/../../outside.json",
  ]) {
    assert.throws(() => storage.getItem(key), /Неизвестный раздел данных/);
    assert.throws(() => storage.setItem(key, "{}"), /Неизвестный раздел данных/);
  }
  assert.equal(fs.existsSync(path.join(root, "outside.json")), false);
  for (const directory of fs.readdirSync(root))
    assert.deepEqual(fs.readdirSync(path.join(root, directory)), []);
});

test("desktop: неверный JSON и недопустимая структура не заменяют сохранённые данные", t => {
  const { storage } = fixture(t);
  const original = project("Сохранённый проект");
  storage.setItem(SESSION, original);
  for (const value of [undefined, null, 42, {}, "{", "null", '"text"', "42", "true", "{}", "[]",
    '{"meta":{},"nodes":[],"links":{}}', '{"meta":{},"nodes":{},"links":[]}']) {
    assert.throws(() => storage.setItem(SESSION, value));
    assert.equal(storage.getItem(SESSION), original);
  }
  storage.setItem(CUSTOM, "[]");
  assert.throws(() => storage.setItem(CUSTOM, "{}"), /Некорректный каталог/);
  assert.equal(storage.getItem(CUSTOM), "[]");
  storage.setItem(UI, "{}");
  assert.throws(() => storage.setItem(UI, "null"), /Ожидаются данные JSON/);
  assert.equal(storage.getItem(UI), "{}");
});

test("desktop: лимит 16 МБ проверяет байты UTF-8 и сохраняет предыдущий файл", t => {
  const { root, storage } = fixture(t);
  storage.setItem(UI, '{"treeHeight":240}');
  const oversized = JSON.stringify({ name: "я".repeat(8 * 1024 * 1024) });
  assert.ok(oversized.length < 16 * 1024 * 1024);
  assert.ok(Buffer.byteLength(oversized) > 16 * 1024 * 1024);
  assert.throws(() => storage.setItem(UI, oversized), /Недопустимый размер данных/);
  assert.equal(storage.getItem(UI), '{"treeHeight":240}');
  assert.equal(fs.existsSync(path.join(root, ...FILES[UI]) + ".tmp"), false);
});

test("desktop: ошибка атомарного переименования сохраняет предыдущий файл и убирает временный", t => {
  const { root, storage } = fixture(t);
  const original = project("До ошибки");
  storage.setItem(SESSION, original);
  const target = path.join(root, ...FILES[SESSION]);
  const rename = fs.renameSync;
  let attempted = false;
  fs.renameSync = (source, destination) => {
    if (destination === target) {
      attempted = true;
      assert.equal(source, target + ".tmp");
      assert.equal(fs.readFileSync(source, "utf8"), project("После ошибки"));
      const error = new Error("Тест: файл заблокирован");
      error.code = "EACCES";
      throw error;
    }
    return rename(source, destination);
  };
  try {
    assert.throws(() => storage.setItem(SESSION, project("После ошибки")), { code: "EACCES" });
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(attempted, true);
  assert.equal(storage.getItem(SESSION), original);
  assert.equal(createStorage(root).getItem(SESSION), original);
  assert.equal(fs.existsSync(target + ".tmp"), false);
  storage.setItem(SESSION, project("После восстановления доступа"));
  assert.equal(storage.getItem(SESSION), project("После восстановления доступа"));
});

test("desktop: повреждённая сессия не повреждает независимую валидную резервную копию", t => {
  const { root, storage } = fixture(t);
  const backup = project("Восстанавливаемый проект");
  storage.setItem(BACKUP, backup);
  storage.setItem(SESSION, project("Текущая версия"));
  fs.writeFileSync(path.join(root, ...FILES[SESSION]), "{broken", "utf8");
  const reopened = createStorage(root);
  assert.equal(reopened.getItem(SESSION), "{broken");
  assert.equal(reopened.getItem(BACKUP), backup);
  assert.throws(() => reopened.setItem(BACKUP, reopened.getItem(SESSION)));
  assert.equal(reopened.getItem(BACKUP), backup);
  reopened.setItem(SESSION, reopened.getItem(BACKUP));
  assert.equal(reopened.getItem(SESSION), backup);
  assert.equal(reopened.getItem(BACKUP), backup);
});

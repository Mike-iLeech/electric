/* ElectricCAD Easy v32 — DOM, pointer editing and local session. No network requests. */
(function () {
  "use strict";
  const tr = text => window.ElectricI18n?.t(text) ?? text;
  const E = ElectricEngine,
    $ = (id) => document.getElementById(id),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const SESSION = "electriccad.session.v32",
    BACKUP = "electriccad.session.v32.backup",
    CUSTOM = "electriccad.templates.v32";
  const UI_KEY = "electriccad.ui.v32";
  const desktop = window.electricDesktop;
  const storage = desktop?.storage || {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
  let uiSaveTimer = 0, uiStorageError = false, skipBackupOnce = false;
  let uiPrefs = {};
  try { uiPrefs = JSON.parse(storage.getItem(UI_KEY) || "{}") || {}; } catch {}
  E.setCableSections(uiPrefs.cableSections);
  function writeUI() {
    clearTimeout(uiSaveTimer); uiSaveTimer = 0;
    try { storage.setItem(UI_KEY, JSON.stringify(uiPrefs)); uiStorageError = false; return true; }
    catch { uiStorageError = true; return false; }
  }
  const saveUI = () => {
    if (!desktop) { writeUI(); return; }
    clearTimeout(uiSaveTimer);
    uiSaveTimer = setTimeout(() => {
      if (!writeUI()) notify("Не удалось сохранить настройки. Проверьте доступ к папке данных.");
      updateStatus();
    }, 150);
  };
  let p = E.project(),
    calc = E.calculate(p),
    selection = new Set(),
    undo = [],
    redo = [],
    clipboard = null,
    drag = null,
    pendingPort = null,
    hover = null,
    frame = 0,
    saveTimer = 0,
    toastTimer = 0,
    routeCache = new Map(),
    routeDirty = true,
    dirty = false,
    storageError = false,
    resizeRect = null,
    lastFocus = null,
    builderEdit = null;
  let templates = E.catalog(),
    custom = [],
    catalogQuery = "",
    draftRows = [],
    pointers = new Map(),
    pinch = null,
    lastTap = 0,
    lastTapNode = null;
  let staticKey = "";
  const scene = new ElectricRender.Scene($("workspace"));
  scene.onToggleBreaker=(nodeId,portId,main)=>{
    const n=p.nodes.find(n=>n.id===nodeId),v=[...n.inputs,...n.outputs].find(v=>v.id===portId),b=main?n.mainBreaker:v?.breaker;
    if(!b)return;
    transaction(()=>{b.state=b.state==="closed"?"open":"closed";},{geometry:false});
  };
  const ctx = $("canvas").getContext("2d"),
    ws = $("workspace");
  function moduleCaption(item, options) {
    const predefined = templates.some(template => template.name === (item.templateName || item.name)) &&
      (!item.templateName || item.name === item.templateName);
    return E.nomenclature(item, options).split(" | ").map((part, index) =>
      index === 0 && !predefined ? part : tr(part)).join(" | ");
  }
  const node = (id) => p.nodes.find((n) => n.id === id),
    port = (ref) => {
      const n = node(ref?.nodeId);
      return [...(n?.inputs || []), ...(n?.outputs || [])].find(
        (v) => v.id === ref.portId,
      );
    };
  const recentActions = [];
  let lastLoggedState;
  function updateActionLog() {
    if ($("actionLog")?.open) $("actionLogEntries").textContent = recentActions.join("\n");
  }
  function recordAction(message) {
    recentActions.unshift(new Date().toLocaleTimeString("ru-RU") + "  " + message);
    updateActionLog();
  }
  function logProjectChanges() {
    const nodeLabel = id => {
      const node = p.nodes.find(item => item.id === id);
      return node ? `«${node.name}» [${id}]` : id;
    };
    const indexed = items => Object.fromEntries(items.map(item => [item.id, item]));
    const nodes = Object.fromEntries(p.nodes.map(node => [node.id, {
      ...node, inputs: indexed(node.inputs), outputs: indexed(node.outputs),
      расчёт: calc.nodes.get(node.id),
      расчётПортов: Object.fromEntries(node.outputs.map(out => [out.id, calc.ports.get(out.id)])),
      активныйВвод: calc.activeInputs.get(node.id)?.id,
    }]));
    const links = indexed(p.links.map(link => {
      const out = port(link.from), inlet = port(link.to);
      const cable = E.cableParameters(link, out, inlet, p.settings);
      return {...link, трасса: `${nodeLabel(link.from.nodeId)} → ${nodeLabel(link.to.nodeId)}`,
        профиль: cable, расчёт: E.cableEstimate(cable, out.phases, calc.ports.get(out.id).loadA)};
    }));
    const snapshot = JSON.parse(JSON.stringify({метаданные:p.meta, настройки:p.settings, модули:nodes, линии:links}));
    const lines = [];
    const format = value => value === undefined ? "—" : JSON.stringify(value);
    function compare(before, after, path) {
      if (before === after) return;
      if (before && after && typeof before === "object" && typeof after === "object") {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          const label = path === "модули" ? `«${after[key]?.name ?? before[key]?.name}» [${key}]`
            : path === "линии" ? `${after[key]?.трасса ?? before[key]?.трасса} [${key}]` : key;
          compare(before[key], after[key], path ? path + " / " + label : label);
        }
      } else lines.push(`${path}: ${format(before)} → ${format(after)}`);
    }
    if (lastLoggedState) compare(lastLoggedState, snapshot, "");
    lastLoggedState = snapshot;
    if (lines.length) recordAction("Изменения проекта и расчёта\n" + lines.join("\n"));
  }
  function notificationKind(message) {
    if (message === "Вставлено") return "success";
    if (/^Перегрузка на фазе/.test(message)) return "overload";
    if (/^(Не удалось сохранить (проект|сессию)|Локальная сессия недоступна)/.test(message)) return "critical";
    if (/^(Скопировано|Сессия сохранена|Проект сохран[её]н|Проект импортирован|Импортировано|Шаблон сохран[её]н|Включено автоматов|Восстановлена резервная)/.test(message)) return "success";
    if (/^(Нажмите второй порт|Все модули|Все автоматы|Перегрузок включённых автоматов нет)/.test(message)) return "info";
    return "warning";
  }
  function notify(s) {
    recordAction(s);
    if (E.overloadOrigins(p, calc).length) { announceOverloads(); return; }
    $("toast").dataset.kind = notificationKind(s);
    $("toastMsg").textContent = s;
    $("toast").style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").style.display = "none"), 4500);
  }
  let overloadMessageKey = "";
  function announceOverloads() {
    const origins = E.overloadOrigins(p, calc);
    if (!origins.length) {
      overloadMessageKey = "";
      if ($("toast").dataset.kind === "overload") {
        clearTimeout(toastTimer); $("toast").style.display = "none";
        $("toastMsg").replaceChildren(); $("toast").dataset.kind = "";
      }
      return;
    }
    const key = JSON.stringify(origins.map(o => [o.nodeId,o.phases,E.nomenclature(node(o.nodeId),{connectors:true})]));
    if (key === overloadMessageKey && $("toast").dataset.kind === "overload") {
      clearTimeout(toastTimer); $("toast").style.display = "block"; return;
    }
    overloadMessageKey = key;
    $("toast").dataset.kind = "overload";
    clearTimeout(toastTimer);
    const msg = $("toastMsg"); msg.replaceChildren();
    for (const origin of origins) {
      const n = node(origin.nodeId), row = document.createElement("div");
      row.append(document.createTextNode("Перегрузка на фазе: " + origin.phases.join(", ") + ". Источник: "));
      const link = button(moduleCaption(n, {connectors:true}), () => {
        select(n.id); const r = ws.getBoundingClientRect();
        const fit = Math.min((r.width - 48) / E.nodeWidth(n), (r.height - 48) / E.nodeHeight(n));
        p.view.zoom = Math.max(.01, Math.min(1.25, fit));
        p.view.panX = r.width / 2 - n.pos.x * p.view.zoom;
        p.view.panY = r.height / 2 - n.pos.y * p.view.zoom;
        updateStatus(); scheduleSave(); requestDraw();
      }, "overloadSourceLink");
      for(const type of ["pointerdown", "pointerup", "dblclick"]) link.addEventListener(type, e => e.stopPropagation());
      row.append(link); msg.append(row);
    }
    $("toast").style.display = "block";

  }
  function serial() {
    return JSON.stringify(p);
  }
  function history(before) {
    if (before === serial()) return;
    undo.push(before);
    if (undo.length > 100) undo.shift();
    redo = [];
  }
  function transient() {
    selection = new Set([...selection].filter((id) => node(id)));
    drag = null;
    pendingPort = null;
    hover = null;
    pointers.clear();
    pinch = null;
    $("lasso").style.display = "none";
  }
  function changed({ geometry = true, props = true } = {}) {
    if (p.settings.autoTrip) E.tripOverloads(p);
    calc = E.calculate(p);
    logProjectChanges();
    announceOverloads();
    if (geometry) {
      routeCache.clear();
      routeDirty = true;
    }
    dirty = true;
    scheduleSave();
    requestDraw();
    if (props) renderProps();
    renderNavigator();
    updateStatus();
  }
  function transaction(fn, { geometry = true } = {}) {
    const before = serial();
    try {
      fn();
      E.validate(p);
      if (p.settings.autoTrip) { calc = E.calculate(p); announceOverloads(); E.tripOverloads(p); }
    } catch (e) {
      p = JSON.parse(before);
      renderProps();
      updateStatus();
      notify(e.message);
      return false;
    }
    history(before);
    changed({ geometry });
    return true;
  }
  function restore(s) {
    p = E.validate(JSON.parse(s));
    transient();
    changed();
    $("projectName").value = p.meta.name;
    $("voltageLN").value = p.settings.voltageLN;
  }
  function stepUndo() {
    if (!undo.length) return;
    redo.push(serial());
    restore(undo.pop());
  }
  function stepRedo() {
    if (!redo.length) return;
    undo.push(serial());
    restore(redo.pop());
  }
  function save() {
    clearTimeout(saveTimer);
    try {
      const text = serial(),
        old = storage.getItem(SESSION);
      if (!skipBackupOnce && old && old !== text) {
        // Keep a usable backup when the current file was damaged or hand-edited.
        let valid = false;
        try { E.migrate(JSON.parse(old)); valid = true; } catch {}
        if (valid) storage.setItem(BACKUP, old);
      }
      storage.setItem(SESSION, text);
      skipBackupOnce = false;
      dirty = false;
      storageError = false;
      updateStatus();
      return true;
    } catch (e) {
      storageError = true;
      updateStatus();
      notify(desktop ? "Не удалось сохранить проект на диск. Сохраните копию JSON и проверьте папку данных."
        : "Не удалось сохранить сессию в браузере. Экспортируйте JSON.");
      return false;
    }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  function updatePowerSummary() {
    const format = watts => {
      const [divisor, unit] = watts >= 1e6 ? [1e6, "МВт"] : watts >= 1000 ? [1000, "кВт"] : [1, "Вт"];
      return (watts / divisor).toLocaleString("ru-RU", {maximumFractionDigits:2}) + " " + unit;
    };
    const sources = p.nodes.filter(node => node.category === "input");
    let total = 0;
    const rows = sources.map(source => {
      const watts = E.sum(calc.nodes.get(source.id).loadW);
      total += watts;
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.dataset.noTranslate = "true";
      name.textContent = source.name;
      row.append(name, document.createTextNode(" · " + format(watts)));
      return row;
    });
    $("powerSummaryTotal").textContent = format(total);
    $("collapsedPowerTotal").textContent = "Итого " + format(total);
    $("powerBranchCount").textContent = "Веток от вводов: " + sources.length;
    $("powerBranchLoads").replaceChildren(...rows);
  }
  function updateStatus() {
    updatePowerSummary();
    $("btnSnap").setAttribute("aria-pressed", !!p.settings.snapToGrid);
    $("btnSnap").classList.toggle("active", !!p.settings.snapToGrid);
    $("autoTrip").checked = !!p.settings.autoTrip;
    $("advancedMode").checked = !!p.settings.advancedMode;
    $("highlightBranch").checked = !!p.settings.highlightBranch;
    if (document.activeElement !== $("voltageLN"))
      $("voltageLN").value = Number(p.settings.voltageLN.toFixed(6));
    if (document.activeElement !== $("voltageLL"))
      $("voltageLL").value = Number(
        (p.settings.voltageLN * Math.sqrt(3)).toFixed(6),
      );
    for (const el of $("outlinerTree").querySelectorAll("[data-node-id]")) {
      el.classList.toggle("selected", selection.has(el.dataset.nodeId));
      el.setAttribute("aria-pressed", selection.has(el.dataset.nodeId));
    }

    $("projectPill").textContent = p.meta.name;
    $("sessionStatus").textContent = (storageError || uiStorageError)
      ? "Ошибка локального сохранения"
      : dirty
        ? "Сохраняется…"
        : desktop ? "Сохранено на этом компьютере" : "Сохранено в этом браузере";
    $("btnUndo").disabled = !undo.length;
    $("btnRedo").disabled = !redo.length;
    const z = p.view.zoom;
    $("zoomReadout").textContent = Math.round(z * 100) + "%";
    $("panReadout").textContent =
      Math.round(p.view.panX) + ";" + Math.round(p.view.panY);
    $("selectionPill").textContent =
      selection.size === 1
        ? node([...selection][0])
          ? E.nomenclature(node([...selection][0]))
          : "Ничего"
        : selection.size + " выбрано";
    $("modelInfo").textContent = `PF=${p.settings.powerFactor} · 50 Гц · Uл = √3 × Uф`;
  }
  function point(e) {
    const r = ws.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const toWorld = (v) => ({
    x: (v.x - p.view.panX) / p.view.zoom,
    y: (v.y - p.view.panY) / p.view.zoom,
  });
  function center() {
    const r = ws.getBoundingClientRect();
    return toWorld({ x: r.width / 2, y: r.height / 2 });
  }
  function zoomAt(factor, at) {
    const before = toWorld(at);
    p.view.zoom = Math.max(0.01, Math.min(2.5, p.view.zoom * factor));
    p.view.panX = at.x - before.x * p.view.zoom;
    p.view.panY = at.y - before.y * p.view.zoom;
    requestDraw();
    scheduleSave();
    updateStatus();
  }
  function focusOrigin() {
    const r = ws.getBoundingClientRect();
    p.view = { zoom: 1, panX: r.width / 2, panY: r.height / 2 };
    requestDraw();
    scheduleSave();
    updateStatus();
  }
  function fitAll() {
    if (!p.nodes.length) {
      focusOrigin();
      return;
    }
    const rs = p.nodes.map(E.rect),
      r = ws.getBoundingClientRect(),
      l = Math.min(...rs.map((v) => v.left)) - 70,
      t = Math.min(...rs.map((v) => v.top)) - 70,
      w = Math.max(...rs.map((v) => v.right)) - l + 70,
      h = Math.max(...rs.map((v) => v.bottom)) - t + 70;
    p.view.zoom = Math.max(0.01, Math.min(1.2, r.width / w, r.height / h));
    p.view.panX = r.width / 2 - (l + w / 2) * p.view.zoom;
    p.view.panY = r.height / 2 - (t + h / 2) * p.view.zoom;
    requestDraw();
    scheduleSave();
    updateStatus();
  }
  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  const breakerText = (b) =>
    !b
      ? "—"
      : b.poles +
        "P " +
        b.curve +
        b.ratingA +
        " · " +
        (b.state === "closed"
          ? "ВКЛ"
          : b.state === "open"
            ? "ВЫКЛ"
            : "СРАБОТАЛ");
  function portRect(n, v) {
    return ElectricRender.portGeometry(n, v);
  }
  function hitPort(at) {
    const w = toWorld(at),
      ns = [...p.nodes]
        .sort(
          (a, b) => Number(selection.has(a.id)) - Number(selection.has(b.id)),
        )
        .reverse();
    for (const n of ns) {
      for (const v of [...n.inputs, ...n.outputs]) {
        const r = portRect(n, v);
        if (w.x >= r.left && w.x <= r.right && w.y >= r.top && w.y <= r.bottom)
          return { nodeId: n.id, portId: v.id, kind: v.kind };
      }
    }
    return null;
  }
  function hitNode(at) {
    const w = toWorld(at);
    return [...p.nodes]
      .sort((a, b) => Number(selection.has(a.id)) - Number(selection.has(b.id)))
      .reverse()
      .find((n) => {
        const r = E.rect(n);
        return (
          w.x >= r.left && w.x <= r.right && w.y >= r.top && w.y <= r.bottom
        );
      });
  }

  function ensureRoutes() {
    if (routeDirty) {
      routeCache = ElectricRouting.routeConnections(p);
      routeDirty = false;
    }
  }
  function wirePath(l) {
    ensureRoutes();
    return routeCache.get(l.id) || [];
  }
  function wireBarriers(ids = []) {
    const selected = new Set(ids),
      out = [];
    for (const l of p.links) {
      if (selected.has(l.from.nodeId) || selected.has(l.to.nodeId)) continue;
      const path = routeCache.get(l.id) || [];
      for (const s of ElectricRouting.segments(path))
        out.push({
          left: Math.min(s.a.x, s.b.x) - 3,
          right: Math.max(s.a.x, s.b.x) + 3,
          top: Math.min(s.a.y, s.b.y) - 3,
          bottom: Math.max(s.a.y, s.b.y) + 3,
        });
    }
    return out;
  }
  function placeNewInViewport(n) {
    ensureRoutes();
    const r = ws.getBoundingClientRect(),
      v = p.view,
      centerPoint = center(),
      bounds = {
        left: -v.panX / v.zoom,
        top: -v.panY / v.zoom,
        right: (r.width - v.panX) / v.zoom,
        bottom: (r.height - v.panY) / v.zoom,
      },
      barriers = wireBarriers(),
      clear = () =>
        !p.nodes.some((o) => E.overlaps(E.rect(n), E.rect(o))) &&
        !barriers.some((b) => E.overlaps(E.rect(n), b));
    const step = Math.max(40, Math.min(96, E.nodeHeight(n) / 4));
    for (let ring = 0; ring <= 20; ring++) {
      const offsets = [];
      for (let x = -ring; x <= ring; x++)
        for (let y = -ring; y <= ring; y++)
          if (Math.max(Math.abs(x), Math.abs(y)) === ring)
            offsets.push({ x, y });
      offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
      for (const o of offsets) {
        n.pos = {
          x: centerPoint.x + o.x * step,
          y: centerPoint.y + o.y * step,
        };
        if (p.settings.snapToGrid) { n.pos.x = Math.round(n.pos.x / 12) * 12; n.pos.y = Math.round(n.pos.y / 12) * 12; }
        const box = E.rect(n);
        if (
          box.left >= bounds.left + 12 / v.zoom &&
          box.right <= bounds.right - 12 / v.zoom &&
          box.top >= bounds.top + 12 / v.zoom &&
          box.bottom <= bounds.bottom - 12 / v.zoom &&
          clear()
        )
          return;
      }
    }
    n.pos = centerPoint;
    E.placeNode(p, n);
    for (let pass = 0; pass < 100 && !clear(); pass++) {
      n.pos.y += E.nodeHeight(n) + 32;
      E.placeNode(p, n);
    }
    if (!clear()) throw Error("Нет свободного места");
    v.zoom = Math.max(
      0.01,
      Math.min(v.zoom, (r.width - 40) / 354, (r.height - 40) / E.nodeHeight(n)),
    );
    v.panX = r.width / 2 - n.pos.x * v.zoom;
    v.panY = r.height / 2 - n.pos.y * v.zoom;
  }
  function applyPendingMove() {
    if (drag?.type !== "move" || !drag.target) return;
    ensureRoutes();
    const ids = [...drag.positions.keys()],
      anchor = node(ids[0]),
      origin = drag.positions.get(ids[0]),
      beforePositions = new Map(ids.map((id) => [id, { ...node(id).pos }]));
    const snap = v => p.settings.snapToGrid ? Math.round(v / 12) * 12 : v;
    const dx = snap(origin.x + drag.target.x - drag.start.x) - anchor.pos.x,
      dy = snap(origin.y + drag.target.y - drag.start.y) - anchor.pos.y;
    drag.target = null;
    if (Math.hypot(dx, dy) < 1e-7) return;
    // Existing wires keep their routes but never block dragging a module.
    const barriers = [];
    const delta = E.slideGroup(p, ids, dx, dy, 16, barriers),
      affected = ElectricRouting.affectedByMove(p, ids, routeCache);
    let next = ElectricRouting.routeConnections(p, routeCache, affected);
    if ([...affected].some((id) => !next.get(id)?.length)) {
      // Keep wires visible and valid. Approach a routable pose instead of drawing through a block.
      const target = new Map(ids.map((id) => [id, { ...node(id).pos }]));
      let lo = 0,
        hi = 1,
        best = routeCache,
        bestPositions = beforePositions;
      // A routing clearance must not suppress the tangential component either.
      let axisFound = false,
        bestDistance = Infinity;
      const fixed = p.nodes.filter((n) => !ids.includes(n.id));
      for (const axis of ["x", "y"]) {
        for (const id of ids) {
          const a = beforePositions.get(id),
            b = target.get(id);
          node(id).pos = { ...a };
        }
        E.slideGroup(
          p,
          ids,
          axis === "x"
            ? target.get(ids[0]).x - beforePositions.get(ids[0]).x
            : 0,
          axis === "y"
            ? target.get(ids[0]).y - beforePositions.get(ids[0]).y
            : 0,
          16,
          barriers,
        );
        if (
          ids.every(
            (id) =>
              Math.hypot(
                node(id).pos.x - beforePositions.get(id).x,
                node(id).pos.y - beforePositions.get(id).y,
              ) < 1e-7,
          )
        )
          continue;
        if (
          ids.some(
            (id) =>
              fixed.some((o) => E.overlaps(E.rect(node(id)), E.rect(o), 16)) ||
              barriers.some((b) => E.overlaps(E.rect(node(id)), b, 16)),
          )
        )
          continue;
        const dirty = ElectricRouting.affectedByMove(p, ids, routeCache),
          candidate = ElectricRouting.routeConnections(p, routeCache, dirty);
        if ([...dirty].some((id) => !candidate.get(id)?.length)) continue;
        const distance = ids.reduce(
          (sum, id) =>
            sum +
            Math.hypot(
              node(id).pos.x - target.get(id).x,
              node(id).pos.y - target.get(id).y,
            ),
          0,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          axisFound = true;
          best = candidate;
          bestPositions = new Map(ids.map((id) => [id, { ...node(id).pos }]));
        }
      }
      for (let step = 0; !axisFound && step < 6; step++) {
        const f = (lo + hi) / 2;
        for (const id of ids) {
          const a = beforePositions.get(id),
            b = target.get(id);
          node(id).pos = { ...a };
        }
        E.slideGroup(
          p,
          ids,
          (target.get(ids[0]).x - beforePositions.get(ids[0]).x) * f,
          (target.get(ids[0]).y - beforePositions.get(ids[0]).y) * f,
          16,
          barriers,
        );
        const dirty = ElectricRouting.affectedByMove(p, ids, routeCache),
          candidate = ElectricRouting.routeConnections(p, routeCache, dirty);
        if ([...dirty].every((id) => candidate.get(id)?.length)) {
          lo = f;
          best = candidate;
          bestPositions = new Map(ids.map((id) => [id, { ...node(id).pos }]));
        } else hi = f;
      }
      for (const id of ids) node(id).pos = bestPositions.get(id);
      next = best;
    }
    const moved = ids.some(
      (id) =>
        Math.hypot(
          node(id).pos.x - beforePositions.get(id).x,
          node(id).pos.y - beforePositions.get(id).y,
        ) > 1e-7,
    );
    if (moved) {
      drag.moved = true;
      routeCache = next;
      scene.move(p, ids);
    }
  }
  function draw() {
    frame = 0;
    applyPendingMove();
    ensureRoutes();
    const r = ws.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      can = $("canvas");
    if (!r.width || !r.height) return;
    const w = Math.round(r.width * dpr),
      h = Math.round(r.height * dpr);
    if (can.width !== w || can.height !== h) {
      can.width = w;
      can.height = h;
      staticKey = "";
    }
    const key = JSON.stringify([w, h, p.view]);
    if (key !== staticKey) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.save();
      ctx.translate(p.view.panX, p.view.panY);
      ctx.scale(p.view.zoom, p.view.zoom);
      const visible = {
        left: -p.view.panX / p.view.zoom,
        top: -p.view.panY / p.view.zoom,
        right: (r.width - p.view.panX) / p.view.zoom,
        bottom: (r.height - p.view.panY) / p.view.zoom,
      };
      ctx.lineWidth = 1 / p.view.zoom;
      ctx.strokeStyle = "rgba(70,95,140,.18)";
      const step = p.view.zoom < 0.3 ? 120 : 12;
      ctx.beginPath();
      for (
        let x = Math.floor(visible.left / step) * step;
        x < visible.right;
        x += step
      ) {
        ctx.moveTo(x, visible.top);
        ctx.lineTo(x, visible.bottom);
      }
      for (
        let y = Math.floor(visible.top / step) * step;
        y < visible.bottom;
        y += step
      ) {
        ctx.moveTo(visible.left, y);
        ctx.lineTo(visible.right, y);
      }
      ctx.stroke();
      ctx.restore();
      staticKey = key;
      scene.stats.staticPaints++;
    }
    scene.syncWires(p, calc, routeCache, selection);
    scene.sync(p, calc, selection, hover, pendingPort);
    scene.drawOverlay(
      p,
      pendingPort,
      hover,
      drag?.type === "connect" ? toWorld(drag.at) : null,
    );
    $("routeStatus").textContent = [...routeCache.values()].some(
      (v) => !v.length,
    )
      ? "Для части связей нет свободного маршрута. Раздвиньте модули."
      : "";
  }
  function select(id, toggle = false) {
    if (!toggle) selection.clear();
    if (id) {
      if (toggle && selection.has(id)) selection.delete(id);
      else selection.add(id);
    }
    renderProps();
    updateStatus();
    requestDraw();
  }
  function deleteSelection() {
    if (!selection.size) return;
    transaction(() => {
      p.nodes = p.nodes.filter((n) => !selection.has(n.id));
      p.links = p.links.filter(
        (l) => !selection.has(l.from.nodeId) && !selection.has(l.to.nodeId),
      );
      selection.clear();
    });
  }
  function disconnect(ref) {
    if (
      !p.links.some(
        (l) => l.from.portId === ref.portId || l.to.portId === ref.portId,
      )
    )
      return;
    transaction(() => {
      p.links = p.links.filter(
        (l) => l.from.portId !== ref.portId && l.to.portId !== ref.portId,
      );
    });
  }
  function connectRefs(a, b) {
    const result = E.canConnect(p, a, b);
    if (!result.ok) {
      notify(result.reason);
      return false;
    }
    transaction(() => E.connect(p, a, b));
    pendingPort = null;
    hover = null;
    return true;
  }
  function copy(cut = false) {
    const ns = p.nodes.filter((n) => selection.has(n.id));
    if (!ns.length) return;
    clipboard = E.clone({
      nodes: ns,
      links: p.links.filter(
        (l) => selection.has(l.from.nodeId) && selection.has(l.to.nodeId),
      ),
    });
    if (cut) deleteSelection();
    else notify("Скопировано " + ns.length + " модулей");
  }
  function paste() {
    if (!clipboard) return;
    const inserted = transaction(() => {
      const maps = new Map(),
        newNodes = E.clone(clipboard.nodes),
        links = E.clone(clipboard.links),
        base = newNodes[0].pos,
        target = center();
      for (const n of newNodes) {
        const old = n.id;
        n.id = E.uid("node");
        maps.set(old, n.id);
        n.pos = {
          x: n.pos.x - base.x + target.x,
          y: n.pos.y - base.y + target.y,
        };
        for (const v of [...n.inputs, ...n.outputs]) {
          const old = v.id;
          v.id = E.uid(v.kind);
          maps.set(old, v.id);
        }
      }
      // Keep relative positions of the entire copied group, find a collision-free translation.
      let delta = 0;
      while (
        newNodes.some((n) =>
          p.nodes.some((o) =>
            E.overlaps(
              E.rect({ ...n, pos: { x: n.pos.x, y: n.pos.y + delta } }),
              E.rect(o),
              48,
            ),
          ),
        )
      ) {
        delta += 60;
        if (delta > 1e6) throw Error("Нет места для вставки");
      }
      for (const n of newNodes) {
        n.pos.y += delta;
        p.nodes.push(n);
      }
      for (const l of links)
        p.links.push({
          ...l,
          id: E.uid("link"),
          from: {
            nodeId: maps.get(l.from.nodeId),
            portId: maps.get(l.from.portId),
          },
          to: { nodeId: maps.get(l.to.nodeId), portId: maps.get(l.to.portId) },
        });
      selection = new Set(newNodes.map((n) => n.id));
    });
    if (inserted) notify("Вставлено");
  }
  function button(text, action, cls = "btn") {
    const el = document.createElement("button");
    el.className = cls;
    el.textContent = text;
    el.type = "button";
    el.addEventListener("click", action);
    return el;
  }
  function field(title, type, value, onChange, options = {}) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const cap = document.createElement("span");
    cap.className = "label";
    cap.textContent = title;
    const input = document.createElement("input");
    input.className = "input";
    input.type = type;
    input.value = value ?? "";
    for (const [k, v] of Object.entries(options)) input.setAttribute(k, v);
    wrap.append(cap, input);
    let before = null;
    input.addEventListener("focus", () => (before = serial()));
    input.addEventListener("change", () => {
      const snap = before || serial();
      try {
        onChange(input.value);
        E.validate(p);
        history(snap);
        changed({ geometry: false });
      } catch (e) {
        p = JSON.parse(snap);
        renderProps();
        notify(e.message);
      }
      before = null;
    });
    return wrap;
  }
  function renderBreaker(b, title, onMutate) {
    const box = document.createElement("div");
    box.className = "breakerBox";
    const heading = document.createElement("strong");
    heading.textContent = title + " · " + breakerText(b);
    box.append(heading);
    const actions = document.createElement("div");
    actions.className = "btnRow";
    actions.append(
      button(b.state === "closed" ? "Отключить" : "Включить / взвести", () =>
        transaction(
          () => {
            b.state = b.state === "closed" ? "open" : "closed";
            onMutate?.();
          },
          { geometry: false },
        ),
      ),
    );
    box.append(actions);
    const label = document.createElement("label");
    label.textContent = "Номинал, А ";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "input";
    input.min = "1";
    input.max = "1000";
    input.value = b.ratingA;
    input.addEventListener("change", () =>
      transaction(() => (b.ratingA = Number(input.value)), { geometry: false }),
    );
    label.append(input);
    box.append(label);
    const curve = document.createElement("select");
    curve.className = "select";
    for (const c of ["B", "C", "D"])
      curve.add(new Option("Характеристика " + c, c));
    curve.value = b.curve;
    curve.setAttribute("aria-label", "Характеристика автомата");
    curve.addEventListener("change", () =>
      transaction(() => (b.curve = curve.value), { geometry: false }),
    );
    box.append(curve);
    return box;
  }
  function renderProtection(link) {
    const panel = document.createElement("details");
    const title = document.createElement("summary");
    title.textContent = "Сценарий защиты участка";
    panel.append(title);
    const config = link.protection || {};
    panel.open = Object.keys(config).length > 0;
    const storeValue = (key, value) => {
      link.protection ??= {};
      if (value === undefined) delete link.protection[key];
      else link.protection[key] = value;
    };
    const earthing = document.createElement("select");
    earthing.className = "select";
    earthing.setAttribute("aria-label", "Система заземления");
    for (const type of ["TN", "TT", "IT"]) earthing.add(new Option(type, type));
    earthing.value = config.earthing || "TN";
    earthing.onchange = () => transaction(() => storeValue("earthing", earthing.value), {geometry:false});
    panel.append(earthing);
    for (const [key, label, min, max] of [
      ["loopOhm", "Импеданс петли L–PE, Ом", 0.00001, 100000],
      ["earthOhm", "Сопротивление заземлителя TT, Ом", 0.00001, 100000],
      ["rcdMa", "Номинальный дифференциальный ток УЗО, мА", 0.01, 100000],
      ["residualMa", "Дифференциальный ток сценария, мА", 0, 1000000],
      ["measuredTripSeconds", "Время отключения по измерению, с", 0.00001, 100000],
      ["targetSeconds", "Допустимое время отключения, с", 0.00001, 100000],
      ["startA", "Пусковой ток, А", 0.01, 1000000],
      ["startSeconds", "Длительность пуска, с", 0.00001, 100000],
      ["starts", "Число одинаковых пусков", 1, 1000],
      ["pauseSeconds", "Пауза между пусками, с", 0, 100000],
      ["coolingSeconds", "Постоянная остывания, с", 0.00001, 100000],
    ]) {
      panel.append(field(label, "number", config[key], value => {
        const number = Number(value);
        if (value !== "" && (!Number.isFinite(number) || number < min || number > max || (key === "starts" && !Number.isInteger(number)))) throw Error("Проверьте значение: " + label);
        storeValue(key, value === "" ? undefined : number);
      }, {min, max, step:key === "starts" ? "1" : "any"}));
    }
    for (const [key, label] of [["curve", "Автомат участка"], ["upstreamCurve", "Автомат выше по цепи"]]) {
      const wrap = document.createElement("label");
      wrap.className = "field";
      const caption = document.createElement("span");
      caption.textContent = label + " · точки [А, мин. с, макс. с]";
      const input = document.createElement("textarea");
      input.className = "input";
      input.rows = 2;
      input.value = config[key] ? JSON.stringify(config[key]) : "";
      input.placeholder = "[[ток, время мин., время макс.], …]";
      input.onchange = () => transaction(() => {
        if (!input.value.trim()) return storeValue(key, undefined);
        const points = JSON.parse(input.value);
        if (!Array.isArray(points) || points.length < 2 || points.length > 100 ||
          points.some((point, i) => !Array.isArray(point) || point.length !== 3 ||
            point.some(value => !Number.isFinite(value) || value <= 0) ||
            point[1] > point[2] || (i && point[0] <= points[i - 1][0])))
          throw Error("Нужны точки паспортной кривой с возрастающим током и диапазоном времени");
        storeValue(key, points);
      }, {geometry:false});
      wrap.append(caption,input);
      panel.append(wrap);
    }
    const result = E.protectionScenario(config, p.settings.voltageLN);
    const lines = [];
    if (config.earthing === "IT") lines.push("Для IT нужна отдельная модель первого и второго замыкания.");
    if (result.faultA !== null) lines.push("Ожидаемый ток по заданной петле L–PE: " + result.faultA.toFixed(1) + " А.");
    if (result.downstream) lines.push((config.startA ? "Время по кривой при пусковом токе: " : "Время по кривой при токе замыкания: ") + result.downstream.map(n => n.toPrecision(3)).join("–") + " с.");
    if (result.separatedBands !== null) lines.push(result.separatedBands ? "При заданном токе диапазоны времени разделены." : "При заданном токе селективность по времени не подтверждена.");
    if (result.thermal) lines.push("Накопленная доля ресурса до срабатывания по модели остывания: " + result.thermal.map(n => (n * 100).toFixed(0) + "%").reverse().join("–") + ".");
    if (result.rcdThresholdReached !== null) lines.push(result.rcdThresholdReached ? "Достигнут номинальный дифференциальный ток УЗО." : "Дифференциальный ток ниже номинального порога УЗО.");
    if (result.ttTouchV !== null) lines.push("Для TT произведение RA × IΔn: " + result.ttTouchV.toFixed(2) + " В.");
    if (result.disconnectionWithinTarget !== null) lines.push(result.disconnectionWithinTarget ? "Измеренное время укладывается в заданный предел." : "Измеренное время превышает заданный предел.");
    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = lines.join(" ") || "Задайте параметры измерения или паспортные точки автоматов.";
    panel.append(summary);
    return panel;
  }
  function refreshCableSettings() {
    const dialog = $("cableSettingsDialog");
    if (!dialog?.open) return;
    const link = p.links.find(item => item.id === dialog.dataset.linkId);
    if (!link) {
      dialog.close();
      return;
    }
    const alert = $("cableSettingsAlert");
    const message = $("toast").dataset.kind === "overload" ? $("toastMsg").textContent.trim() : "";
    alert.replaceChildren();
    if (message) {
      const original = $("toastMsg");
      alert.append(...[...original.childNodes].map(child => child.cloneNode(true)));
      const links = original.querySelectorAll("button");
      alert.querySelectorAll("button").forEach((button, i) => {
        button.onclick = () => {
          dialog.close();
          links[i]?.click();
        };
      });
    }
    alert.hidden = !message;
    const body = $("cableSettingsBody");
    const helpOpen = body.querySelector(".cableProfileHelp")?.open;
    const panel = renderCable(link);
    panel.querySelector(".cableProfileHelp").open = !!helpOpen;
    body.replaceChildren(panel);
  }
  function cableDropError(estimate) {
    const voltage = p.settings.voltageLN * (estimate?.lineVoltage ? Math.sqrt(3) : 1);
    if (estimate?.dropV > voltage + 1e-8)
      return "Падение напряжения превышает 100%. Сократите длину трассы, увеличьте сечение или снизьте нагрузку.";
    return "";
  }
  function checkCableEdit(link) {
    const out = port(link.from);
    const estimate = E.cableEstimate(E.cableParameters(link, out, port(link.to), p.settings), out.phases, calc.ports.get(out.id).loadA);
    const error = cableDropError(estimate);
    if (error) throw Error(error);
  }
  function renderCable(link) {
    const panel = document.createElement("section");
    const title = document.createElement("strong");
    title.textContent = "Кабель · модельный профиль, cos φ = " + p.settings.powerFactor;
    panel.append(title);
    const out = port(link.from);
    const inlet = port(link.to);
    const cable = E.cableParameters(link, out, inlet, p.settings);
    const profile = E.cableParameters({}, out, inlet, p.settings);
    if (cable.sectionApproximate) {
      const notice = document.createElement("p");
      notice.className = "cableApproximateNotice"; notice.setAttribute("role", "status");
      notice.textContent = "Взято примерное значение сечения кабеля для этой силы тока — " + cable.sectionMm2 + " мм² (S = 0,0368 · I^1,3754). Введите точное значение!";
      panel.append(notice);
    }
    const help = document.createElement("details");
    help.className = "cableProfileHelp";
    const question = document.createElement("summary");
    question.textContent = "?";
    question.setAttribute("aria-label", "Справка по типовому кабелю на 100 метров");
    const reference = E.cableEstimate({...profile, lengthM:100}, out.phases,
      out.phases === 3 ? Object.fromEntries(E.PHASES.map(phase => [phase,profile.ampacityA])) : {L1:profile.ampacityA});
    const voltage = p.settings.voltageLN * (reference?.lineVoltage ? Math.sqrt(3) : 1);
    const info = document.createElement("p");
    info.textContent = reference ? "Типовой профиль: " + (profile.material === "al" ? "алюминий, " : "медь, ") + profile.sectionMm2 + " мм², " + profile.ampacityA +
      " А. На 100 м при номинальном токе и cos φ = " + p.settings.powerFactor + ": падение " + reference.dropV.toFixed(2) +
      " В (" + (100*reference.dropV/voltage).toFixed(2) + "%), потери " + reference.lossW.toFixed(1) +
      " Вт. Для 3 фаз предполагается равномерная нагрузка. Допустимое падение проверяют по всей цепи."
      : "Для номинала " + profile.ampacityA + " А типовой профиль кабеля не задан. Укажите сечение жилы в свойствах кабеля для расчёта падения напряжения и потерь.";
    const method = document.createElement("a");
    method.href = "https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions";
    method.target = "_blank";
    method.rel = "noopener noreferrer";
    method.textContent = "Методика расчёта";
    help.append(question,info,method);
    panel.append(help, button("Сбросить профиль кабеля", () => transaction(() => {
      if (!link.cable) return;
      for (const key of ["sectionMm2","ampacityA","ambientC","thermalResistance","material","maxDropPercent"]) delete link.cable[key];
    }, {geometry:false})));

    for (const [key, label, min, max] of [
      ["lengthM", "Длина, м", 0.01, 100000],
      ["sectionMm2", "Сечение жилы, мм²", 0.1, 500],
      ["ampacityA", "Допустимый ток для условий прокладки, А", 0.1, 10000],
      ["maxDropPercent", "Предел падения на участке, %", 0.1, 100],
      ["ambientC", "Температура среды, °C", -50, 100],
      ["thermalResistance", "Тепловое сопротивление участка, К/Вт", 0.0001, 1000],
    ]) {
      panel.append(field(label, "number", cable[key], value => {
        if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max)) throw Error("Проверьте диапазон: " + label);
        link.cable ??= {};
        if (value === "") delete link.cable[key];
        else link.cable[key] = Number(value);
        if (["lengthM", "sectionMm2"].includes(key)) checkCableEdit(link);
      }, {min, max, step:"any"}));
    }
    const material = document.createElement("select");
    material.className = "select";
    material.setAttribute("aria-label", "Материал жил");
    material.add(new Option("Медь", "cu"));
    material.add(new Option("Алюминий", "al"));
    material.value = cable.material === "al" ? "al" : "cu";
    material.onchange = () => transaction(() => {
      (link.cable ??= {}).material = material.value;
      checkCableEdit(link);
    }, {geometry:false});
    panel.append(material);
    const load = calc.ports.get(link.from.portId);
    const estimate = out && load && E.cableEstimate(cable, out.phases, load.loadA);
    const result = document.createElement("p");
    result.className = "hint";
    if (!estimate) result.textContent = "Задайте длину, сечение и допустимый ток.";
    else {
      const {dropV, lossW, current, exceedsAmpacity} = estimate;
      result.textContent = "Ток " + current.toFixed(2) + " А. " + (exceedsAmpacity ? "Превышен допустимый ток кабеля. " : "") +
        (dropV === null ? "Для несимметричной трёхфазной нагрузки падение напряжения и потери не оценены."
          : "Падение на участке " + dropV.toFixed(2) + " В. Потери " + lossW.toFixed(1) + " Вт.");
    }
    if (estimate?.lossW != null && Number.isFinite(cable.ambientC) && cable.thermalResistance > 0) {
      const temperature = cable.ambientC + estimate.lossW * cable.thermalResistance;
      result.textContent += " Оценка установившейся температуры: " + temperature.toFixed(1) + " °C.";
    }
    panel.append(result);
    const warnings = E.cableWarnings(cable, estimate, out, inlet, p.settings.voltageLN);
    if (warnings.length) {
      const alert = document.createElement("p");
      alert.className = "cableWarning";
      alert.setAttribute("role", "alert");
      alert.textContent = warnings.join(" ");
      panel.append(alert);
    }
    if (calc.nodes.get(link.to.nodeId).powered && calc.activeInputs.get(link.to.nodeId) === link) {
      const route = [];
      for (let segment = link; segment; segment = calc.activeInputs.get(segment.from.nodeId)) route.push(segment);
      if (route.length > 1) {
        const total = document.createElement("p");
        const estimates = route.map(segment => {
          const output = port(segment.from);
          return E.cableEstimate(E.cableParameters(segment, output, port(segment.to), p.settings), output.phases, calc.ports.get(segment.from.portId).loadA);
        });
        if (estimates.every(item => item?.dropV != null)) {
          const phase = calc.nodes.get(link.to.nodeId).inPhase;
          const drops = E.PHASES.map(key => estimates.reduce((sum, item) => sum + item.phaseDropV[key], 0));
          const dropLN = phase ? drops[E.PHASES.indexOf(phase)] : Math.max(...drops);
          const voltage = Math.max(0, p.settings.voltageLN - dropLN);
          const losses = estimates.reduce((sum, item) => sum + item.lossW, 0);
          total.textContent = "По пути от ввода: " + voltage.toFixed(2) + " В фазного напряжения на конце, потери " + losses.toFixed(1) + " Вт.";
        } else total.textContent = "Для оценки всей ветки задайте длину каждого участка.";
        panel.append(total);
      }
    }
    return panel;
  }
  function renderProps() {
    refreshCableSettings();
    const body = $("propsBody"), scrollTop = $("propsScroll").scrollTop;
    const openPorts = new Set([...body.querySelectorAll("details.portProps[open]")].map(el => el.dataset.portId));
    body.replaceChildren();
    $("propsHint").style.display = selection.size ? "none" : "block";
    const ns = p.nodes.filter((n) => selection.has(n.id));
    if (!ns.length) return;
    const header = document.createElement("h3");
    if (ns.length === 1) header.dataset.noTranslate = "true";
    header.textContent =
      ns.length === 1 ? moduleCaption(ns[0]) : "Выбрано модулей: " + ns.length;
    body.append(header);
    if (ns.length === 1) {
      const n = ns[0],
        c = calc.nodes.get(n.id);
      body.append(
        field(
          "Название",
          "text",
          E.nomenclature(n).split(" | ")[0],
          (v) => (n.name = v.trim() || n.templateName),
          { maxlength: 160 },
        ),
      );
      const desc = document.createElement("p");
      desc.className = "hint";
      desc.textContent = `${c.status}. X ${n.pos.x.toFixed(1)}; Y ${n.pos.y.toFixed(1)}. Требуется ${(E.sum(c.demandW) / 1000).toFixed(2)} кВт; подано ${(E.sum(c.loadW) / 1000).toFixed(2)} кВт.`;
      body.append(desc);
      body.append(button("Изменить модуль / порты", () => openBuilder(n)));
      if (p.settings.advancedMode && n.category === "distributor") {
        const backup = n.inputs[1];
        body.append(button(backup ? "Убрать резервный ввод" : "Добавить резервный ввод (АВР)", () => transaction(() => {
          if (backup) {
            if (p.links.some(link => link.to.portId === backup.id)) throw Error("Сначала разъедините резервный ввод");
            n.inputs.pop();
            delete n.transfer;
          } else {
            const main = n.inputs[0];
            n.inputs.push(E.port("in", main.connType, main.nominalA));
            n.transfer = true;
          }
        })));
        if (backup) {
          const status = document.createElement("p");
          const feed = calc.activeInputs.get(n.id);
          status.textContent = c.powered ? (feed?.to.portId === backup.id ? "АВР: резервный ввод" : "АВР: основной ввод") : "АВР: питание отсутствует";
          body.append(status);
        }
      }
      if (n.mainBreaker)
        body.append(renderBreaker(n.mainBreaker, "Вводной автомат"));
      for (const v of [...n.inputs, ...n.outputs]) {
        const box = document.createElement("details");
        box.className = "portProps";
        box.dataset.portId = v.id;
        box.open = openPorts.has(v.id);
        const title = document.createElement("summary");
        title.textContent = `${v.kind === "in" ? (n.transfer ? (v === n.inputs[0] ? "Основной ввод" : "Резервный ввод") : "Вход") : "Выход"} · ${E.CONNECTORS[v.connType].name} ${v.nominalA} А${v.phase ? " · " + v.phase : ""}`;
        box.append(title);
        if (p.settings.advancedMode) {
          for (const [key, label] of [["manufacturer", "Производитель"], ["partNumber", "Артикул"], ["ip", "Степень IP"], ["mechanicalKey", "Механический ключ"]]) {
            box.append(field(label, "text", v.hardware?.[key], value => { (v.hardware ??= {})[key] = value.trim().slice(0, 120); }, {maxlength:120}));
          }
        }
        if (v.breaker) box.append(renderBreaker(v.breaker, "Автомат линии"));
        const ref = { nodeId: n.id, portId: v.id, kind: v.kind };
        box.append(
          button("Выбрать для соединения", () => {
            pendingPort = ref;
            showPanel(null);
            notify("Нажмите второй порт на схеме или в свойствах");
            requestDraw();
          }),
        );
        const l = p.links.find(
          (l) => l.from.portId === v.id || l.to.portId === v.id,
        );
        if (l) {
          if (p.settings.advancedMode) box.append(renderCable(l), renderProtection(l));
          const txt = document.createElement("p");
          txt.textContent =
            E.nomenclature(node(l.from.nodeId)) +
            " -> " +
            E.nomenclature(node(l.to.nodeId));
          box.append(
            txt,
            button("Разъединить", () => disconnect(ref)),
          );
        }
        body.append(box);
      }
    }
    const consumers = ns.filter((n) => n.category === "consumer");
    if (consumers.length) {
      const vals = new Set(consumers.map((n) => n.consumerWatts));
      const f = field(
        consumers.length > 1
          ? "Мощность каждого выбранного потребителя, Вт"
          : "Потребление, Вт",
        "number",
        vals.size === 1 ? consumers[0].consumerWatts : "",
        (v) => {
          if (v === "") throw Error("Введите мощность");
          for (const n of consumers) n.consumerWatts = Number(v);
        },
        {
          min: 0,
          max: 10000000,
          placeholder: vals.size > 1 ? "Разные значения" : "",
        },
      );
      body.append(f);
      if (vals.size > 1) {
        const hint = document.createElement("p");
        hint.textContent =
          "Значения различаются. Ввод заменит мощность у всех выбранных потребителей.";
        hint.className = "hint";
        body.append(hint);
      }
    }
    body.append(button("Удалить выбранные", deleteSelection, "btn danger"));
    $("propsScroll").scrollTop = scrollTop;
    updateStatus();
  }
  function addTemplate(t) {
    transaction(
      () => {
        const n = E.makeNode(t, center());
        placeNewInViewport(n);
        p.nodes.push(n);
        selection = new Set([n.id]);
      },
      { geometry: false },
    );
    showPanel(null);
  }

  function renderNavigator() {
    const nav = $("moduleNavigator"),
      previous = nav.value;
    nav.replaceChildren(new Option("Выберите модуль…", ""));
    for (const n of p.nodes) nav.add(new Option(moduleCaption(n), n.id));
    nav.value =
      selection.size === 1 ? [...selection][0] : node(previous) ? previous : "";
    const tree = $("outlinerTree"),
      expanded = new Set(
        [...tree.querySelectorAll("details[open]")].map(
          (el) => el.dataset.category,
        ),
      );
    const initialized = tree.dataset.ready === "1";
    tree.replaceChildren();
    tree.dataset.ready = "1";
    $("outlinerCount").textContent = p.nodes.length + " мод.";
    const children = new Map(), incoming = new Set();
    for (const l of p.links) {
      if (!node(l.from.nodeId) || !node(l.to.nodeId)) continue;
      if (!children.has(l.from.nodeId)) children.set(l.from.nodeId, []);
      const list = children.get(l.from.nodeId);
      if (!list.includes(l.to.nodeId)) list.push(l.to.nodeId);
      incoming.add(l.to.nodeId);
    }
    const visited = new Set();
    const appendNode = (n, parent) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      const ids = (children.get(n.id) || []).filter(id => !visited.has(id));
      const branch = document.createElement(ids.length ? "details" : "div");
      branch.className = "outlinerBranch";
      let row = branch;
      if (ids.length) {
        branch.dataset.category = n.id;
        branch.open = initialized ? expanded.has(n.id) : (uiPrefs.tree?.[n.id] ?? !incoming.has(n.id));
        branch.addEventListener("toggle", () => { if (!branch.isConnected) return; (uiPrefs.tree ??= {})[n.id] = branch.open; saveUI(); });
        row = document.createElement("summary");
        branch.append(row);
      }
      const b = button(moduleCaption(n, {connectors:true}), e => {
        e.preventDefault();
        select(n.id, e.shiftKey || e.ctrlKey || e.metaKey);
      }, "outlinerNode");
      b.dataset.nodeId = n.id;
      b.setAttribute("aria-pressed", selection.has(n.id));
      b.classList.toggle("selected", selection.has(n.id));
      const note = document.createElement("small");
      note.textContent = n.phases + "ф · " + (n.inputs[0]?.nominalA ?? n.supplyA) + " А" + (ids.length ? " · " + ids.length + " ветв." : "");
      b.append(note);
      b.addEventListener("dblclick", () => {
        const r = ws.getBoundingClientRect();
        p.view.panX = r.width / 2 - n.pos.x * p.view.zoom;
        p.view.panY = r.height / 2 - n.pos.y * p.view.zoom;
        requestDraw();
      });
      row.append(b);
      parent.append(branch);
      if (ids.length) {
        const children = document.createElement("div");
        children.className = "outlinerChildren";
        branch.append(children);
        for (const id of ids) appendNode(node(id), children);
      }
    };
    for (const n of p.nodes.filter(n => !incoming.has(n.id))) appendNode(n, tree);
    for (const n of p.nodes) if (!visited.has(n.id)) appendNode(n, tree);
    if (!p.nodes.length) tree.textContent = "Добавьте модуль из каталога";
  }
  function renderModuleCatalog(cat, query) {
    const expanded = new Set(
      [...cat.querySelectorAll("details[open]")].map((el) => el.dataset.path),
    );
    const initialized = cat.dataset.ready === "1";
    cat.dataset.ready = "1";
    cat.replaceChildren();
    const root = { children: new Map(), items: [] };
    for (const t of [...templates, ...custom]) {
      const path = E.catalogPath(t);
      if (
        !(E.nomenclature(t, { connectors: true }) + " " + path.join(" ") + " " + tr(E.nomenclature(t, {connectors:true}) + " " + path.join(" ")))
          .toLowerCase()
          .includes(query)
      )
        continue;
      let current = root;
      for (const part of path) {
        if (!current.children.has(part))
          current.children.set(part, { children: new Map(), items: [] });
        current = current.children.get(part);
      }
      current.items.push(t);
    }
    const count = (branch) =>
      branch.items.length +
      [...branch.children.values()].reduce((a, b) => a + count(b), 0);
    const roots = [
      "Вводы",
      "Дистрибьюторы",
      "Переходные коробки и кабели",
      "Удлинители",
      "Потребители",
    ];
    const append = (parent, branch, path = []) => {
      const entries = [...branch.children];
      entries.sort(([a], [b]) =>
        /^\\d+ А$/.test(a) && /^\\d+ А$/.test(b)
          ? parseInt(a) - parseInt(b)
          : path.length === 0
            ? roots.indexOf(a) - roots.indexOf(b)
            : 0,
      );
      for (const [name, child] of entries) {
        const next = [...path, name],
          key = next.join("/"),
          d = document.createElement("details"),
          summary = document.createElement("summary");
        d.dataset.path = key;
        d.open =
          !!query ||
          (initialized ? expanded.has(key) : (uiPrefs.catalog?.[key] ?? (path.length === 0 && name === "Вводы")));
        d.addEventListener("toggle", () => {
          if (!d.isConnected || query) return;
          (uiPrefs.catalog ??= {})[key] = d.open; saveUI();
        });
        summary.textContent = name + " · " + count(child);
        d.append(summary);
        const children = document.createElement("div");
        children.className = "catalogChildren";
        append(children, child, next);
        d.append(children);
        parent.append(d);
      }
      for (const t of branch.items.sort(
        (a, b) => (a.watts || 0) - (b.watts || 0),
      )) {
        const el = button("", () => addTemplate(t), "nodeItem");
        el.dataset.templateId = t.id;
        el.innerHTML =
          '<span class="meta"><span class="name">' +
          esc(moduleCaption(t, { connectors: true }).replace(" -> ", " → ")) +
          '</span><span class="desc">' +
          t.phases +
          "ф · " +
          (t.outputs.length ? t.outputs.length + " вых." : t.watts + " Вт") +
          '</span></span><span class="badge">' +
          t.inA +
          "A</span>";
        if (!custom.includes(t)) {
          const row = document.createElement("div");
          row.className = "catalogItem";
          row.append(el);
          parent.append(row);
          continue;
        }
        const row = document.createElement("div");
        row.className = "catalogItem customCatalogRow";
        const remove = button("×", () => {
          if (!confirm(tr("Удалить шаблон «" + t.name + "» из каталога?"))) return;
          const next = custom.filter(template => template !== t);
          try {
            storage.setItem(CUSTOM, JSON.stringify(next));
          } catch {
            notify("Не удалось сохранить каталог");
            return;
          }
          custom = next;
          renderCatalog();
        }, "btn danger");
        remove.title = "Удалить шаблон";
        remove.setAttribute("aria-label", "Удалить шаблон «" + t.name + "»");
        row.append(el, remove);
        parent.append(row);
      }
    };
    append(cat, root);
    if (!root.children.size) cat.textContent = "Ничего не найдено";
  }
  function renderCatalog() {
    $("btnExportTemplates").disabled = custom.length === 0;
    renderModuleCatalog($("catalog"), catalogQuery.toLowerCase());
  }
  function exportProject() {
    const blob = new Blob([JSON.stringify(p, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (p.meta.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/[. ]+$/, "") || "Проект") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportScheme() {
    if (window.ElectricGostReady) {
      try {
        await window.ElectricGostReady;
      } catch {
        notify("Не удалось загрузить шрифт OpenGOST");
        return;
      }
    }
    ensureRoutes();
    const drawingOptions = {
      paper: "auto",
      orientation: "landscape",
      scale: "100",
      separateBranches: false,
      ...p.meta.exportSettings,
    };
    let pagePlans, selectedPage = 0;
    const backdrop = document.createElement("div");
    backdrop.className = "schemeExport";
    const panel = document.createElement("section"),
      title = document.createElement("h2"),
      image = document.createElement("img"),
      actions = document.createElement("div");
    const header = document.createElement("div"),
      preview = document.createElement("div"),
      previewFrame = document.createElement("div"),
      stampFields = document.createElement("div");
    header.className = "exportHeader";
    actions.className = "exportActions";
    preview.className = "exportPreview";
    previewFrame.className = "exportPreviewFrame";
    previewFrame.setAttribute("aria-label", "Предпросмотр листа: колесо мыши — масштаб, перетаскивание — панорама");
    stampFields.className = "exportStampFields";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Экспорт схемы");
    title.textContent = "Превью экспорта схемы";
    image.alt = "Вся электрическая схема для экспорта";
    image.draggable = false;
    let previewZoom = 1, previewX = 0, previewY = 0, previewDrag = null, previewDetailTimer = null;
    const zoomBar = document.createElement("div"), zoomValue = document.createElement("output");
    zoomBar.className = "exportPreviewControls";
    zoomBar.setAttribute("aria-label", "Масштаб предпросмотра");
    let detailView = null;
    const detail = document.createElement("canvas");
    detail.className = "exportPreviewDetail";
    const drawPreviewDetail = () => {
      if (!backdrop.isConnected || previewDrag || !pagePlans?.[selectedPage] || !image.clientWidth) return;
      const width = previewFrame.clientWidth, height = previewFrame.clientHeight;
      const scale = image.clientWidth * previewZoom / pagePlans[selectedPage].pw;
      const x = width / 2 + previewX - image.clientWidth * previewZoom / 2;
      const y = height / 2 + previewY - image.clientHeight * previewZoom / 2;
      const rendered = ElectricExport.previewCanvas(pagePlans[selectedPage], width, height, scale, x, y);
      detail.width = rendered.width; detail.height = rendered.height;
      detail.style.transform = "";
      detailView = {zoom:previewZoom, x:previewX, y:previewY};
      detail.getContext("2d").drawImage(rendered, 0, 0);
    };
    image.onload = drawPreviewDetail;
    const applyPreviewView = () => {
      image.style.transform = `translate(${previewX}px, ${previewY}px) scale(${previewZoom})`;
      if (detailView) {
        const factor = previewZoom / detailView.zoom;
        detail.style.transform = `translate(${previewX - factor * detailView.x}px, ${previewY - factor * detailView.y}px) scale(${factor})`;
      }
      zoomValue.textContent = Math.round(previewZoom * 100) + "%";
      clearTimeout(previewDetailTimer);
      previewDetailTimer = setTimeout(drawPreviewDetail, 350);
    };
    const setPreviewZoom = (next, px = 0, py = 0) => {
      const zoom = Math.max(1, Math.min(32, next));
      const factor = zoom / previewZoom;
      previewX = px - (px - previewX) * factor;
      previewY = py - (py - previewY) * factor;
      previewZoom = zoom;
      if (zoom === 1) previewX = previewY = 0;
      applyPreviewView();
      clearTimeout(previewDetailTimer);
      previewDetailTimer = setTimeout(drawPreviewDetail, 350);
    };
    for (const [label, caption, action] of [
      ["Уменьшить предпросмотр", "−", () => setPreviewZoom(previewZoom / 1.25)],
      ["Увеличить предпросмотр", "+", () => setPreviewZoom(previewZoom * 1.25)],
      ["Показать весь лист", "⛶", () => setPreviewZoom(1)],
    ]) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "btn"; button.textContent = caption;
      button.title = label; button.setAttribute("aria-label", label); button.onclick = action;
      zoomBar.append(button);
    }
    zoomValue.setAttribute("aria-live", "polite");
    zoomBar.insertBefore(zoomValue, zoomBar.lastChild);
    previewFrame.onwheel = event => {
      event.preventDefault();
      const r = previewFrame.getBoundingClientRect();
      setPreviewZoom(previewZoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX - (r.left + r.width / 2), event.clientY - (r.top + r.height / 2));
    };
    previewFrame.onpointerdown = event => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      previewDrag = {x:event.clientX, y:event.clientY, panX:previewX, panY:previewY};
      previewFrame.setPointerCapture(event.pointerId);
      previewFrame.classList.add("isPanning");
    };
    previewFrame.onpointermove = event => {
      if (!previewDrag) return;
      previewX = previewDrag.panX + event.clientX - previewDrag.x;
      previewY = previewDrag.panY + event.clientY - previewDrag.y;
      applyPreviewView();
    };
    previewFrame.onpointerup = previewFrame.onpointercancel = () => { previewDrag = null; previewFrame.classList.remove("isPanning"); applyPreviewView(); };
    applyPreviewView();
    const close = () => {
      backdrop.remove();
      $("btnExport").focus();
    };
    const filename = (p.meta.name || "Схема").replace(
      /[<>:"/\\|?*\u0000-\u001f]/g,
      "_",
    );
    const exportFilename = (ext,page=selectedPage) => filename + (pagePlans.length>1 && ext!=="pdf" ? `_лист-${page+1}` : "") + "." + ext;
    async function chooseExportFile(ext,page=selectedPage) {
      if(desktop || !window.showSaveFilePicker)return null;
      try{return await window.showSaveFilePicker({suggestedName:exportFilename(ext,page)});}
      catch(error){if(error.name!=="AbortError")notify("Не удалось выбрать файл экспорта");return false;}
    }
    const download = async (blob, ext, page = selectedPage, handle = null) => {
      if(!blob){notify("Не удалось сформировать файл экспорта");return;}
      const url=URL.createObjectURL(blob);
      if(handle){
        try{
          const writable=await handle.createWritable();await writable.write(blob);await writable.close();
          exportNotice(handle.name,()=>{window.open(url,"_blank");});
          setTimeout(()=>URL.revokeObjectURL(url),120000);
        }catch(error){URL.revokeObjectURL(url);notify("Не удалось сохранить экспортированный файл");}
        return;
      }
      const link=document.createElement("a");link.href=url;link.download=exportFilename(ext,page);link.click();
      if(!desktop)notify("Файл передан браузеру для сохранения: " + link.download);
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    const downloadRaster = async (ext,type) => {
      const index=selectedPage,plan=pagePlans[index];
      const handle=await chooseExportFile(ext,index);if(handle===false)return;
      try{
        const raster=ElectricExport.rasterCanvas(plan);
        raster.toBlob(blob=>{void download(blob,ext,index,handle);raster.width=raster.height=1;},type,1);
      }catch(error){notify("Не удалось сформировать файл экспорта");}
    };
    const downloadPDF = async () => {
      const index=selectedPage,project=E.clone(p),options={...drawingOptions};
      const handle=await chooseExportFile("pdf",index);if(handle===false)return;
      try{await download(ElectricExport.pdf(project,options),"pdf",index,handle);}
      catch(error){notify("Не удалось сформировать файл экспорта");}
    };
    for (const [label, glyph, action] of [
      ["Сохранить PNG", "PNG", () => downloadRaster("png", "image/png")],
      ["Сохранить JPG", "JPG", () => downloadRaster("jpg", "image/jpeg")],
      ["Сохранить PDF", "PDF", downloadPDF],
      ["Сохранить проект JSON", "{}", exportProject],
      ["Закрыть", "×", close],
    ]) {
      const button = document.createElement("button");
      button.className = "btn exportIconButton";
      if (glyph !== "×") button.dataset.format = glyph === "{}" ? "json" : glyph.toLowerCase();
      if (label === "Закрыть") button.textContent = glyph;
      else {
        button.innerHTML = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 2h9l5 5v15H5zM14 2v5h5"/></svg><span class="exportIconBadge"></span>';
        button.querySelector("span").textContent = glyph;
      }
      button.title = label;
      button.setAttribute("aria-label", label);
      button.onclick = action;
      actions.append(button);
    }
    const fields = document.createElement("div");
    fields.className = "drawingMetadata";
    const sheetLabel = document.createElement("label"),
      sheetSelect = document.createElement("select");
    sheetLabel.textContent = "Лист превью";
    sheetSelect.setAttribute("aria-label", "Лист превью");
    sheetLabel.append(sheetSelect);
    function refreshDrawing(rebuild = true) {
      fields.querySelectorAll("[data-orientation]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.orientation === drawingOptions.orientation));
      });
      if (rebuild || !pagePlans) pagePlans = ElectricExport.plans(p, drawingOptions);
      selectedPage = Math.min(selectedPage, pagePlans.length - 1);
      sheetSelect.replaceChildren(
        ...pagePlans.map((v, i) => {
          const o = document.createElement("option");
          o.value = i;
          o.textContent =
            `Лист ${i + 1}` +
            (v.journal ? " · Кабельный журнал" + (v.options.branchNumber
              ? ` · Ветка №${v.options.branchNumber}`
              : v.options.withoutSupply ? " · Группа без ввода" : "") : v.options.branchNumber
              ? ` · Ветка №${v.options.branchNumber}`
              : v.options.withoutSupply ? " · Группа без ввода" : " · Все ветки");
          return o;
        }),
      );
      sheetSelect.value = selectedPage;
      let canvas;
      try {
        canvas = ElectricExport.pageCanvas(pagePlans[selectedPage], 85);
      } catch (error) {
        clearTimeout(previewDetailTimer);
        detailView = null;
        detail.width = detail.height = 1;
        image.removeAttribute("src");
        image.alt = "Не удалось построить выбранный лист";
        notify("Не удалось построить выбранный лист: " + error.message);
        return;
      }
      image.alt = "Предпросмотр выбранного листа";
      clearTimeout(previewDetailTimer);
      detailView = null;
      detail.width = 1; detail.height = 1;
      detail.style.transform = "";
      image.src = canvas.toDataURL("image/png");
      if (previewZoom > 1) setPreviewZoom(previewZoom);
    }
    sheetSelect.onchange = () => {
      selectedPage = Number(sheetSelect.value);
      refreshDrawing();
    };
    const extraStamp = document.createElement("details");
    extraStamp.className = "extraStampFields";
    const extraSummary = document.createElement("summary");
    extraSummary.textContent = "Дополнительные графы";
    extraStamp.append(extraSummary);
    for (const [key, label, type, initial] of [
      ["drawingTitle", "1 · Наименование изделия и документа", "text", p.meta.drawingTitle || ""],
      ["designation", "2 · Обозначение документа", "text", p.meta.designation || ""],
      ["organization", "9 · Организация", "text", p.meta.organization || ""],
      ["designer", "11 · Разработал", "text", p.meta.designer || ""],
      ["checkedBy", "11 · Проверил", "text", p.meta.checkedBy || ""],
      ["technicalControlBy", "11 · Технический контроль", "text", p.meta.technicalControlBy || ""],
      ["additionalBy", "11 · Дополнительная строка", "text", p.meta.additionalBy || ""],
      ["standardsControlBy", "11 · Нормоконтроль", "text", p.meta.standardsControlBy || ""],
      ["approvedBy", "11 · Утвердил", "text", p.meta.approvedBy || ""],
      [
        "drawingDate",
        "Дата чертежа",
        "date",
        p.meta.drawingDate || new Date().toLocaleDateString("sv-SE"),
      ],
    ]) {
      const wrapper = document.createElement("label"),
        input = document.createElement("input");
      wrapper.textContent = label;
      input.type = type;
      input.value = initial;
      if (key === "drawingTitle") {
        input.placeholder = "Например: Электроснабжение сцены — Схема однолинейная";
        input.dataset.i18nUserPrefix = p.meta.name;
      }
      if (key === "designation") input.placeholder = "Например: ЭЛ.2026.001 Э3";
      if (key === "organization") input.placeholder = "Например: ООО «Электропроект»";
      if (["designer", "checkedBy", "technicalControlBy", "additionalBy", "standardsControlBy", "approvedBy"].includes(key))
        input.placeholder = "Например: Иванов И. И.";
      input.maxLength = 120;
      input.setAttribute("aria-label", label);
      wrapper.append(input);
      if (["technicalControlBy", "standardsControlBy", "additionalBy"].includes(key)) extraStamp.append(wrapper);
      else stampFields.append(wrapper);
      input.onchange = () => {
        p.meta[key] = input.value.trim();
        dirty = true;
        scheduleSave();
        refreshDrawing();
      };
    }
    for (const [key, label, choices] of [
      [
        "paper",
        "Формат листа",
        [
          ["auto", "Авто · по размеру схемы"],
          ["a4", "A4"],
          ["a3", "A3"],
          ["a2", "A2"],
          ["a1", "A1"],
          ["a0", "A0"],
        ],
      ],
    ]) {
      const wrapper = document.createElement("label"),
        select = document.createElement("select");
      wrapper.textContent = label;
      select.setAttribute("aria-label", label);
      for (const [value, text] of choices) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = text;
        select.append(o);
      }
      select.value = drawingOptions[key];
      wrapper.append(select);
      fields.append(wrapper);
      select.onchange = () => {
        drawingOptions[key] = select.value;
        p.meta.exportSettings = { ...drawingOptions };
        dirty = true;
        scheduleSave();
        refreshDrawing();
      };
    }
    const orientation = document.createElement("div");
    orientation.className = "exportOrientation";
    orientation.setAttribute("role", "group");
    orientation.setAttribute("aria-label", "Ориентация");
    orientation.append(document.createTextNode("Ориентация"));
    const orientationButtons = document.createElement("div");
    for (const [value, label] of [["portrait", "Книжная"], ["landscape", "Альбомная"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.dataset.orientation = value;
      button.textContent = label;
      button.onclick = () => {
        drawingOptions.orientation = value;
        p.meta.exportSettings = {...drawingOptions};
        dirty = true; scheduleSave(); refreshDrawing();
      };
      orientationButtons.append(button);
    }
    orientation.append(orientationButtons);
    fields.append(orientation);
    const sliders = [];
    for (const [key,label,min,max,initial] of [
      ["scale","Масштаб схемы",25,100,100],
      ["layoutBalance","Компоновка: вертикаль ↔ горизонталь",25,200,100],
    ]) {
      const wrapper=document.createElement("label"), slider=document.createElement("input"),value=document.createElement("output");
      slider.type="range"; slider.min=min;slider.max=max;slider.step="1";slider.value=drawingOptions[key]||initial;
      slider.setAttribute("aria-label",label);value.textContent=slider.value+"%";
      wrapper.className = "exportSlider";
      wrapper.append(document.createTextNode(label),value,slider);sliders.push(wrapper);
      let frame=null;
      slider.oninput=()=>{
        value.textContent=slider.value+"%";drawingOptions[key]=slider.value;
        p.meta.exportSettings={...drawingOptions};dirty=true;scheduleSave();
        if(frame===null)frame=requestAnimationFrame(()=>{frame=null;if(backdrop.isConnected)refreshDrawing();});
      };
    }
    const exportSwitches = document.createElement("div");
    exportSwitches.className = "exportSwitches";
    {
      const wrapper = document.createElement("label"),
        checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = drawingOptions.separateBranches;
      checkbox.setAttribute("aria-label", "Каждая ветка на отдельном листе");
      wrapper.title = "Каждая ветка на отдельном листе";
      wrapper.append(
        checkbox,
        document.createTextNode("Каждая ветка на отдельном листе"),
      );
      wrapper.className = "branchPageToggle exportSwitch";
      exportSwitches.append(wrapper);
      checkbox.onchange = () => {
        drawingOptions.separateBranches = checkbox.checked;
        p.meta.exportSettings = { ...drawingOptions };
        dirty = true;
        scheduleSave();
        selectedPage = 0;
        refreshDrawing();
      };
    }
    const journalToggle = document.createElement("label");
    journalToggle.className = "branchPageToggle exportSwitch";
    const journalCheckbox = document.createElement("input");
    journalCheckbox.type = "checkbox";
    journalCheckbox.checked = !!drawingOptions.cableJournal;
    journalToggle.title = "Выгрузка кабельного журнала";
    journalCheckbox.setAttribute("aria-label", journalToggle.title);
    journalToggle.append(journalCheckbox, document.createTextNode("Кабельный журнал"));
    const journalBranchToggle = document.createElement("label");
    journalBranchToggle.className = "branchPageToggle exportSwitch";
    const journalBranchCheckbox = document.createElement("input");
    journalBranchCheckbox.type = "checkbox";
    journalBranchCheckbox.checked = !!drawingOptions.separateJournalBranches;
    journalBranchCheckbox.disabled = !journalCheckbox.checked;
    journalBranchToggle.title = "Каждая ветка кабельного журнала на отдельном листе";
    journalBranchCheckbox.setAttribute("aria-label", journalBranchToggle.title);
    journalBranchToggle.append(journalBranchCheckbox,
      document.createTextNode("Журнал по веткам"));
    journalBranchCheckbox.onchange = () => {
      drawingOptions.separateJournalBranches = journalBranchCheckbox.checked;
      p.meta.exportSettings = {...drawingOptions};
      dirty = true;
      scheduleSave();
      selectedPage = Number.MAX_SAFE_INTEGER;
      refreshDrawing();
    };
    journalCheckbox.onchange = () => {
      drawingOptions.cableJournal = journalCheckbox.checked;
      journalBranchCheckbox.disabled = !journalCheckbox.checked;
      p.meta.exportSettings = {...drawingOptions};
      dirty = true;
      scheduleSave();
      selectedPage = journalCheckbox.checked ? Number.MAX_SAFE_INTEGER : 0;
      refreshDrawing();
    };
    exportSwitches.append(journalToggle, journalBranchToggle);
    stampFields.append(extraStamp);
    fields.append(exportSwitches, sheetLabel);
    header.append(title, actions);
    previewFrame.append(image, detail, zoomBar);
    preview.append(sliders[0], previewFrame, sliders[1]);
    panel.classList.add("exportInspectorLayout");
    const inspector = document.createElement("aside");
    inspector.className = "exportInspector";
    inspector.setAttribute("aria-label", "Настройки экспорта");
    const downloads = document.createElement("div");
    downloads.className = "exportDownloads exportActions";
    const closeButton = actions.lastElementChild;
    while (actions.firstElementChild !== closeButton) downloads.append(actions.firstElementChild);
    inspector.append(fields, ...sliders, downloads);
    panel.append(header, preview, stampFields, inspector);
    backdrop.append(panel);
    document.body.append(backdrop);
    refreshDrawing();
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close();
    };
    backdrop.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const buttons = [...panel.querySelectorAll("input,select,button")].filter(el => !el.disabled),
          i = buttons.indexOf(document.activeElement);
        e.preventDefault();
        buttons[
          (i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ].focus();
      }
    };
    actions.querySelector("button").focus();
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      notify("Файл больше 12 МБ");
      return;
    }
    try {
      const next = E.migrate(JSON.parse(await file.text()));
      const before = serial();
      p = next;
      selection.clear();
      transient();
      history(before);
      changed();
      $("projectName").value = p.meta.name;
      $("voltageLN").value = p.settings.voltageLN;
      notify("Проект импортирован. Фазы пересчитаны по схеме.");
    } catch (e) {
      notify("Ошибка импорта: " + e.message);
    } finally {
      $("fileImport").value = "";
    }
  }
  function showPanel(which) {
    document.body.dataset.panel = which || "";
    positionSidebarToggles();
    $("mobileShade").hidden = !which;
    requestDraw();
  }
  function positionSidebarToggles() {
    for (const [side, breakpoint] of [["Left", 760], ["Right", 1250]]) {
      const button = $("toggle" + side + "Sidebar");
      const visible = window.innerWidth <= breakpoint
        ? document.body.dataset.panel === side.toLowerCase()
        : !$("app").classList.contains("hide" + side + "Sidebar");
      button.setAttribute("aria-expanded", String(visible));
      const label = (visible ? "Скрыть" : "Показать") + (side === "Left" ? " левую панель" : " правую панель");
      button.title = label;
      button.setAttribute("aria-label", label);
    }
  }
  const helpAnimations = [];
  function stopHelpAnimations() {
    for (const stop of helpAnimations) stop();
  }
  function openModal(id) {
    lastFocus = document.activeElement;
    $("overlay").style.display = "block";
    $(id).style.display = "block";
    $(id).setAttribute("aria-hidden", "false");
    const f = $(id).querySelector("button,input,select");
    f?.focus();
  }
  function closeModal() {
    stopHelpAnimations();
    for (const id of ["helpModal", "nodeModal"]) {
      $(id).style.display = "none";
      $(id).setAttribute("aria-hidden", "true");
    }
    $("overlay").style.display = "none";
    builderEdit = null;
    lastFocus?.focus();
  }
  function options(conn, phases) {
    return Object.entries(E.CONNECTORS)
      .filter(([, c]) => !phases || c.phases === phases)
      .map(
        ([key, c]) =>
          `<option value="${key}:${c.phases}"${conn === key ? " selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("");
  }
  function connectorValue(id) {
    return $(id).value.split(":")[0];
  }
  function syncRatings(input, conn) {
    input.setAttribute("list", "moduleRatings");
  }
  function renderRows() {
    const body = $("outputRows");
    body.replaceChildren();
    draftRows.forEach((row, i) => {
      const el = document.createElement("div");
      el.className = "outputRow";
      el.innerHTML = `<strong>Выход ${i + 1}</strong><label>Разъём<select class="select" data-key="connType">${options(row.connType, Number($("modulePhases").value) === 1 ? 1 : null).replaceAll(/value="([^"]+):[13]"/g, 'value="$1"')}</select></label><label>Номинал, А<input class="input" type="number" min="1" max="1000" list="moduleRatings" data-key="nominalA" value="${row.nominalA}"></label><label${Number($("modulePhases").value) === 1 ? " hidden" : ""}>Фаза<select class="select" data-key="phase"${E.CONNECTORS[row.connType].phases === 3 || Number($("modulePhases").value) === 1 ? " disabled" : ""}>${E.PHASES.map((k) => `<option${k === row.phase ? " selected" : ""}>${k}</option>`).join("")}</select></label><label>Автомат<input type="checkbox" data-key="protected"${row.protected ? " checked" : ""}></label><label>Номинал автомата, А<input class="input" type="number" min="1" max="${row.nominalA}" list="moduleRatings" value="${row.ratingA}" data-key="ratingA"${row.protected ? "" : " disabled"}></label><label>Характеристика<select class="select" data-key="curve"${row.protected ? "" : " disabled"}>${["B", "C", "D"].map((k) => `<option${row.curve === k ? " selected" : ""}>${k}</option>`).join("")}</select></label>`;
      for (const field of el.querySelectorAll("[data-key]"))
        field.addEventListener("change", () => {
          const key = field.dataset.key;
          row[key] =
            field.type === "checkbox"
              ? field.checked
              : ["nominalA", "ratingA"].includes(key)
                ? Number(field.value)
                : field.value;
          row.ratingA = Math.min(row.ratingA, row.nominalA);
          renderRows();
          previewBuilder();
        });
      for (const field of el.querySelectorAll('input[type="number"]')) {
        field.addEventListener("input", () => {
          row[field.dataset.key] = Number(field.value);
          previewBuilder();
        });
      }
      body.append(el);
    });
  }
  function syncBuilder(reset = false) {
    const category = $("newNodeType").value,
      phases = Number($("modulePhases").value),
      consumer = category === "consumer",
      source = category === "input";
    $("consumerWField").hidden = !consumer;
    $("outputsCountField").hidden = consumer;
    $("builderOutputs").hidden = consumer;
    $("builderDefaults").hidden = consumer;
    $("builderInput").hidden = false;
    $("sourceShieldField").hidden = !source;
    $("sourceShield").checked = $("sourceKind").value === "shield";
    $("sourceSupplyField").hidden = false;
    $("sourceSupplyA").disabled = !source;
    $("mainBreakerField").hidden = false;
    $("newNodeInConn").disabled = false;
    $("newNodeInA").disabled = false;
    const input = connectorValue("newNodeInConn");
    $("newNodeInConn").innerHTML = options(input, phases);
    if ((source && $("sourceShield").checked) || category === "distributor") {
      for (const option of [...$("newNodeInConn").options])
        if (!/^(terminal|cee)/.test(option.value)) option.remove();
    }
    if (source && !$("sourceShield").checked) {
      for (const option of [...$("newNodeInConn").options]) if (option.value.startsWith("terminal")) option.remove();
    }
    const terminalSource =
      source &&
      (connectorValue("newNodeInConn").startsWith("terminal") ||
        draftRows.some((o) => o.connType.startsWith("terminal")));
    $("sourceShield").disabled = terminalSource;
    if (terminalSource) $("sourceShield").checked = true;
    $("mainBreakerField").hidden = false;
    syncRatings($("newNodeInA"), connectorValue("newNodeInConn"));
    const output = connectorValue("newNodeOutConn");
    $("newNodeOutConn").innerHTML = options(output, phases === 1 ? 1 : null);
    syncRatings($("newNodeOutA"), connectorValue("newNodeOutConn"));
    let count = consumer
      ? 0
      : Math.max(
          1,
          Math.min(32, Math.floor(Number($("newNodeOutCount").value) || 1)),
        );
    $("newNodeOutCount").value = count;
    if (reset) draftRows = [];
    while (draftRows.length < count) {
      const i = draftRows.length;
      draftRows.push({
        connType: connectorValue("newNodeOutConn"),
        nominalA: Number($("newNodeOutA").value),
        phase: phases === 3 ? E.PHASES[i % 3] : null,
        protected:
          category === "distributor" || (source && $("sourceShield").checked),
        ratingA: Number($("newNodeOutA").value),
        curve: "C",
      });
    }
    draftRows.length = count;
    for (const [rowIndex, row] of draftRows.entries()) {
      if (phases === 1 && E.CONNECTORS[row.connType].phases === 3) {
        row.connType = "euro";
        row.nominalA = 16;
        row.ratingA = Math.min(row.ratingA, 16);
      }
      if (phases === 3 && E.CONNECTORS[row.connType].phases === 1 && !row.phase)
        row.phase = E.PHASES[rowIndex % 3];
    }
    renderRows();
    previewBuilder();
  }
  function builderNode() {
    const category = $("newNodeType").value,
      phases = Number($("modulePhases").value),
      source = category === "input",
      outputs = draftRows.map((r) => ({
        connType: r.connType,
        nominalA: r.nominalA,
        phase: phases === 3 ? r.phase : null,
      })),
      n = E.makeNode({
        name: $("newNodeName").value.trim() || "Новый модуль",
        category,
        phases,
        inConnType: connectorValue("newNodeInConn"),
        inA: Number($("newNodeInA").value),
        outputs,
        watts: category === "consumer" ? Number($("newNodeW").value) : 0,
        shield: source && $("sourceShield").checked,
        mainA: $("mainBreakerEnabled").checked ? Number($("mainBreakerA").value) : null,
      });
    if (source) { n.supplyA = Number($("sourceSupplyA").value); n.supplyNominalA = Number($("newNodeInA").value); }
    n.mainBreaker = $("mainBreakerEnabled").checked ? E.breaker(Number($("mainBreakerA").value), phases) : null;
    n.outputs.forEach(
      (v, i) =>
        (v.breaker = draftRows[i].protected
          ? {
              ...E.breaker(draftRows[i].ratingA, v.phases),
              curve: draftRows[i].curve,
            }
          : null),
    );
    const test = E.project();
    test.nodes = [n];
    E.validate(test);
    return n;
  }
  let builderPreviewResize = null;
  window.addEventListener("resize", () => builderPreviewResize?.());
  function previewBuilder() {
    $("mainBreakerA").disabled = !$("mainBreakerEnabled").checked;
    try {
      const n = builderNode(),
        container = $("builderPreview");
      container.replaceChildren();
      container.classList.remove("invalid");
      builderPreviewResize = ElectricRender.previewNode(container, n, p);
      $("builderSaveLocation").hidden = false;
      $("builderCatalogDestination").textContent = "Раздел каталога (по номиналу входа): " + E.catalogPath(moduleTemplate(n)).join(" → ");
      $("builderStorageDestination").textContent = desktop
        ? "Файл каталога: " + desktop.info.dataDirectory + "\\Settings\\custom-modules.json"
        : "Хранение: локально в этом браузере. Для переноса модуля используйте «Экспорт JSON».";
      $("builderError").textContent = "";
      $("btnCreateNode").disabled = false;
    } catch (e) {
      $("builderSaveLocation").hidden = true;
      $("builderPreview").classList.add("invalid");
      $("builderPreview").textContent = "Проверьте параметры: " + e.message;
      $("builderError").textContent = e.message;
      $("btnCreateNode").disabled = true;
    }
  }
  function openBuilder(n = null) {
    builderEdit = n?.id || null;
    $("newNodeType").value = n?.category || "distributor";
    $("modulePhases").value = n?.phases || 3;
    $("newNodeName").value = n ? E.nomenclature(n).split(" | ")[0] : "";
    $("sourceShield").checked = n ? n.shield : true;
    $("sourceKind").value = n && !n.shield ? "socket" : "shield";
    const input = n?.inputs[0];
    $("sourceSupplyA").value = n?.supplyA || 32;
    $("newNodeInConn").innerHTML = options(
      input?.connType || n?.supplyConnType || "cee3",
      n?.phases || 3,
    );
    $("newNodeInA").value = input?.nominalA || n?.supplyNominalA || n?.supplyA || 32;
    $("mainBreakerEnabled").checked = n ? !!n.mainBreaker : true;
    $("mainBreakerA").disabled = !$("mainBreakerEnabled").checked;
    $("mainBreakerA").value = n?.mainBreaker?.ratingA || input?.nominalA || 32;
    $("newNodeW").value = n?.consumerWatts ?? 1000;
    $("newNodeOutCount").value = n?.outputs.length || 3;
    $("newNodeOutConn").innerHTML = options("euro");
    $("newNodeOutA").value = 16;
    draftRows = n
      ? n.outputs.map((v) => ({
          connType: v.connType,
          nominalA: v.nominalA,
          phase: v.phase,
          protected: !!v.breaker,
          ratingA: v.breaker?.ratingA || v.nominalA,
          curve: v.breaker?.curve || "C",
        }))
      : [];
    $("btnCreateNode").textContent = n ? "Применить изменения" : "Добавить в схему (без сохранения)";
    syncBuilder();
    openModal("nodeModal");
    builderPreviewResize?.();
  }
  function applyBuilder() {
    try {
      const n = builderNode();
      const ok = transaction(
        () => {
          if (builderEdit) {
            const old = node(builderEdit);
            n.id = old.id;
            n.pos = old.pos;
            n.templateName = old.templateName;
            if (old.transfer && n.category === "distributor") {
              n.transfer = true;
              n.inputs.push(E.clone(old.inputs[1]));
            }
            if (n.mainBreaker && old.mainBreaker) {
              n.mainBreaker.state = old.mainBreaker.state;
              n.mainBreaker.curve = old.mainBreaker.curve;
            }
            n.inputs.forEach((v, i) => {
              if (old.inputs[i]) {
                v.id = old.inputs[i].id;
                if (old.inputs[i].connType === v.connType && old.inputs[i].hardware) v.hardware = old.inputs[i].hardware;
              }
            });
            n.outputs.forEach((v, i) => {
              if (old.outputs[i]) {
                v.id = old.outputs[i].id;
                if (old.outputs[i].connType === v.connType && old.outputs[i].hardware) v.hardware = old.outputs[i].hardware;
                if (v.breaker && old.outputs[i].breaker)
                  v.breaker.state = old.outputs[i].breaker.state;
              }
            });
            const oldNodes = p.nodes;
            p.nodes = oldNodes.filter((v) => v.id !== old.id);
            if (p.nodes.some((o) => E.overlaps(E.rect(n), E.rect(o), 48)))
              E.placeNode(p, n);
            p.nodes = oldNodes.map((v) => (v.id === old.id ? n : v));
            const ports = new Set([...n.inputs, ...n.outputs].map((v) => v.id));
            if (
              p.links.some(
                (l) =>
                  (l.from.nodeId === n.id && !ports.has(l.from.portId)) ||
                  (l.to.nodeId === n.id && !ports.has(l.to.portId)),
              )
            )
              throw Error("Сначала разъедините удаляемые порты");
          } else {
            n.pos = center();
            placeNewInViewport(n);
            p.nodes.push(n);
          }
          selection = new Set([n.id]);
        },
        { geometry: !!builderEdit },
      );
      if (ok) {
        closeModal();
        showPanel(null);
      }
    } catch (e) {
      notify(e.message);
    }
  }
  function normalizeCustomTemplate(template) {
    if (!template || typeof template !== "object" || Array.isArray(template) ||
        !Array.isArray(template.outputs) || template.outputs.some(output => !output || typeof output !== "object") ||
        (template.category === "consumer" && template.outputs.length !== 0) || ![1, 3].includes(template.phases) ||
        !["input", "distributor", "extender", "consumer"].includes(template.category) ||
        !E.CONNECTORS[template.inConnType] || !Number.isFinite(template.inA) ||
        (template.catalogPath != null && (!Array.isArray(template.catalogPath) ||
          template.catalogPath.some(part => typeof part !== "string"))) ||
        E.obsoleteCable(template)) throw Error("В файле есть неподдерживаемый шаблон");
    const sample = E.project();
    const node = E.makeNode(template);
    sample.nodes.push(node);
    E.validate(sample);
    return {
      id: typeof template.id === "string" ? template.id : E.uid("custom"),
      name: node.name, category: node.category, phases: node.phases,
      inConnType: template.inConnType, inA: template.inA,
      supplyA: template.supplyA ?? node.supplyA, supplyNominalA: template.supplyNominalA,
      outputs: node.outputs.map(({connType, nominalA, phase, breaker}) => ({connType, nominalA, phase, breaker})),
      watts: node.consumerWatts, shield: Boolean(node.shield), transition: Boolean(node.transition),
      mainA: node.mainBreaker?.ratingA ?? null, catalogPath: template.catalogPath ?? null,
    };
  }

  async function importTemplates(file) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("Файл модулей больше 2 МБ");
      const incoming = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (!Array.isArray(incoming) || !incoming.length || incoming.length > 1500)
        throw Error("Ожидается JSON со списком пользовательских модулей");
      const next = [...custom];
      const signature = ({id, ...template}) => JSON.stringify(template);
      const known = new Set(custom.map(signature));
      for (const raw of incoming) {
        const template = normalizeCustomTemplate(raw);
        const key = signature(template);
        if (known.has(key)) continue;
        known.add(key);
        next.push({...template, id:E.uid("custom")});
      }
      storage.setItem(CUSTOM, JSON.stringify(next));
      const count = next.length - custom.length;
      custom = next;
      renderCatalog();
      notify(count ? "Импортировано модулей: " + count : "Все модули из файла уже есть в каталоге");
    } catch (error) {
      notify("Импорт модулей: " + error.message);
    }
  }
  function moduleTemplate(n) {
    return {name:n.name, category:n.category, phases:n.phases,
      inConnType:n.inputs[0]?.connType || n.supplyConnType,
      inA:n.inputs[0]?.nominalA || n.supplyNominalA || n.supplyA,
      supplyA:n.supplyA, supplyNominalA:n.supplyNominalA,
      outputs:n.outputs.map(({connType,nominalA,phase,breaker})=>({connType,nominalA,phase,breaker})),
      watts:n.consumerWatts, shield:n.shield, mainA:n.mainBreaker?.ratingA ?? null};
  }
  function exportBuilderModule() {
    try {
      const data = moduleTemplate(builderNode());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:"application/json"}));
      const link = document.createElement("a"); link.href=url; link.download="electriccad-module.json"; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) { notify(error.message); }
  }
  async function importBuilderModule(file) {
    if (!file) return;
    try {
      if (file.size > 2*1024*1024) throw Error("Файл модуля больше 2 МБ");
      const raw=JSON.parse((await file.text()).replace(/^\uFEFF/,""));
      const template=normalizeCustomTemplate(raw);
      const edit=builderEdit;
      openBuilder(E.makeNode(template));
      builderEdit=edit;
      $("btnCreateNode").textContent=edit ? "Применить изменения" : "Добавить в схему (без сохранения)";
    } catch(error) { notify("Импорт модуля: " + error.message); }
    finally { $("moduleJsonFile").value=""; }
  }
  function saveTemplate() {
    try {
      const n = builderNode(),
        t = {
          id: E.uid("custom"),
          name: n.name,
          category: n.category,
          phases: n.phases,
          inConnType: n.inputs[0]?.connType || n.supplyConnType || "euro",
          supplyA: n.supplyA, supplyNominalA: n.supplyNominalA,
          inA: n.inputs[0]?.nominalA || n.supplyNominalA || n.supplyA,
          outputs: n.outputs.map((v) => ({
            connType: v.connType,
            nominalA: v.nominalA,
            phase: v.phase,
            breaker: v.breaker,
          })),
          watts: n.consumerWatts,
          shield: n.shield,
          mainA: n.mainBreaker?.ratingA ?? null,
        };
      const saved = normalizeCustomTemplate(t);
      const next = [...custom, saved];
      storage.setItem(CUSTOM, JSON.stringify(next));
      custom = next;
      catalogQuery = ""; $("catalogSearch").value = "";
      renderCatalog();
      const path = E.catalogPath(saved);
      for (const details of $("catalog").querySelectorAll("details")) {
        if (path.map((_,i)=>path.slice(0,i+1).join("/")).includes(details.dataset.path)) details.open = true;
      }
      const item = [...$("catalog").querySelectorAll(".nodeItem")].find(el=>el.dataset.templateId === saved.id);
      item?.classList.add("catalogJustSaved");
      notify("Модуль сохранён: " + path.join(" → "));

    } catch (e) {
      notify(e.message);
    }
  }
  function initPointers() {
    ws.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (drag?.type === 'pan' && (drag.middleButton || (e.buttons & 4))) return;
        zoomAt(Math.exp(-e.deltaY * 0.0015), point(e));
      },
      { passive: false },
    );
    ws.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const hit = hitPort(point(e));
      if (hit) disconnect(hit);
    });
    ws.addEventListener("pointerdown", (e) => {
      if (e.button === 2) return;
      e.preventDefault();
      ws.focus({ preventScroll: true });
      ws.setPointerCapture(e.pointerId);
      const at = point(e);
      pointers.set(e.pointerId, at);
      if (pointers.size === 2) {
        if (drag?.type === "move" && drag.moved) {
          p = JSON.parse(drag.before);
          calc = E.calculate(p);
          routeCache.clear();
          routeDirty = true;
        }
        const [a, b] = [...pointers.values()],
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinch = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: p.view.zoom,
          anchor: toWorld(mid),
        };
        drag = null;
        pendingPort = null;
        $("lasso").style.display = "none";
        return;
      }
      if (pointers.size > 2) return;
      if (e.button === 1 || $("toolPan").classList.contains("active")) {
        drag = { type: "pan", start: at, view: { ...p.view }, middleButton: e.button === 1 };
        return;
      }
      const hit = hitPort(at);
      if (hit) {
        if (pendingPort && pendingPort.portId !== hit.portId) {
          connectRefs(pendingPort, hit);
          drag = null;
          return;
        }
        pendingPort = hit;
        drag = { type: "connect", start: at, at };
        requestDraw();
        return;
      }
      if (pendingPort) {
        pendingPort = null;
        hover = null;
      }
      const n = hitNode(at);
      if (n) {
        if (e.shiftKey) {
          select(n.id, true);
          if (!selection.has(n.id)) {
            drag = null;
            return;
          }
        } else if (!selection.has(n.id)) select(n.id);
        const now = Date.now();
        if (
          e.pointerType === "touch" &&
          lastTapNode === n.id &&
          now - lastTap < 350
        ) {
          showPanel("right");
          lastTap = 0;
          return;
        }
        lastTap = now;
        lastTapNode = n.id;
        drag = {
          type: "move",
          start: toWorld(at),
          before: serial(),
          positions: new Map(
            p.nodes
              .filter((v) => selection.has(v.id))
              .map((v) => [v.id, { ...v.pos }]),
          ),
          moved: false,
          clickNodeId: n.id,
          collapseOnClick: !e.shiftKey && selection.size > 1,
        };
      } else {
        if (
          e.pointerType === "touch" &&
          !$("toolSelect").classList.contains("active")
        ) {
          drag = { type: "pan", start: at, view: { ...p.view }, middleButton: e.button === 1 };
          return;
        }
        const base = e.shiftKey ? new Set(selection) : new Set();
        if (!e.shiftKey) select(null);
        drag = { type: "lasso", start: at, at, base, active: false };
        Object.assign($("lasso").style, {
          display: "none",
          left: at.x + "px",
          top: at.y + "px",
          width: "0px",
          height: "0px",
        });
      }
    });
    ws.addEventListener("pointermove", (e) => {
      const at = point(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, at);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()],
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        p.view.zoom = Math.max(
          0.01,
          Math.min(
            2.5,
            (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, pinch.distance),
          ),
        );
        p.view.panX = mid.x - pinch.anchor.x * p.view.zoom;
        p.view.panY = mid.y - pinch.anchor.y * p.view.zoom;
        requestDraw();
        updateStatus();
        scheduleSave();
        return;
      }
      const h = drag?.type === "move" ? hover : hitPort(at);
      if (h?.portId !== hover?.portId) {
        hover = h;
        requestDraw();
      }
      if (!drag) return;
      if (drag.type === "pan") {
        p.view.panX = drag.view.panX + at.x - drag.start.x;
        p.view.panY = drag.view.panY + at.y - drag.start.y;
        requestDraw();
        updateStatus();
        scheduleSave();
      }
      if (drag.type === "connect") {
        drag.at = at;
        requestDraw();
      }
      if (drag.type === "move") {
        const w = toWorld(at),
          dx = w.x - drag.start.x,
          dy = w.y - drag.start.y;
        if (Math.hypot(dx, dy) * p.view.zoom < 3) return;
        drag.target = w;
        requestDraw();
      }
      if (drag.type === "lasso") {
        if (
          !drag.active &&
          Math.hypot(at.x - drag.start.x, at.y - drag.start.y) < 5
        )
          return;
        drag.active = true;
        $("lasso").style.display = "block";
        drag.at = at;
        const l = Math.min(drag.start.x, at.x),
          t = Math.min(drag.start.y, at.y),
          r = Math.max(drag.start.x, at.x),
          b = Math.max(drag.start.y, at.y),
          el = $("lasso");
        Object.assign(el.style, {
          left: l + "px",
          top: t + "px",
          width: r - l + "px",
          height: b - t + "px",
        });
        const a = toWorld({ x: l, y: t }),
          z = toWorld({ x: r, y: b });
        selection = new Set(drag.base);
        for (const n of p.nodes) {
          const nr = E.rect(n);
          if (
            E.overlaps(nr, { left: a.x, right: z.x, top: a.y, bottom: z.y }, 0)
          )
            selection.add(n.id);
        }
        requestDraw();
        updateStatus();
      }
    });
    const finish = (e, cancel = false) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null;
          drag = null;
          pointers.clear();
        }
        scheduleSave();
        return;
      }
      if (drag?.type === "connect") {
        const h = hitPort(point(e));
        if (!cancel && h && h.portId !== pendingPort?.portId)
          connectRefs(pendingPort, h);
        if (cancel) pendingPort = null;
      }
      if (drag?.type === "move") {
        if (!cancel) applyPendingMove();
        if (cancel) {
          p = JSON.parse(drag.before);
          changed();
        } else if (drag.moved) {
          history(drag.before);
          changed({ geometry: false });
        } else if (drag.collapseOnClick) {
          select(drag.clickNodeId);
        }
      }
      if (drag?.type === "lasso") {
        Object.assign($("lasso").style, {
          display: "none",
          width: "0px",
          height: "0px",
        });
        renderProps();
      }
      drag = null;
      requestDraw();
    };
    ws.addEventListener("pointerup", (e) => finish(e));
    ws.addEventListener("pointercancel", (e) => finish(e, true));
    ws.addEventListener("lostpointercapture", (e) => {
      if (pointers.has(e.pointerId)) finish(e, true);
    });
  }
  function keydown(e) {
    if (document.querySelector("dialog[open]")) return;
    const modal = ["nodeModal", "helpModal"]
      .map($)
      .find((el) => el.style.display === "block");
    if (e.key === "Escape") {
      e.preventDefault();
      if (modal) closeModal();
      else if (drag?.type === "move") {
        p = JSON.parse(drag.before);
        drag = null;
        changed();
      } else {
        if (drag?.type === "lasso") selection = new Set(drag.base);
        if (drag?.type === "pan") p.view = drag.view;
        drag = null;
        pointers.clear();
        pinch = null;
        $("lasso").style.display = "none";
        pendingPort = null;
        hover = null;
        renderProps();
        updateStatus();
        showPanel(null);
        requestDraw();
      }
      return;
    }
    if (modal) {
      if (e.key === "Tab") {
        const focusable = [
            ...modal.querySelectorAll(
              'button,input,select,textarea,[tabindex="0"]',
            ),
          ].filter((el) => !el.disabled && el.getClientRects().length),
          first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (e.target.closest?.('input,textarea,select,[contenteditable="true"]'))
      return;
    const code = e.code,
      ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.shiftKey && e.altKey && code === "Delete") {
      e.preventDefault();
      clearProject();
      return;
    }
    if (ctrl && code === "KeyZ") {
      e.preventDefault();
      e.shiftKey ? stepRedo() : stepUndo();
      return;
    }
    if (ctrl && code === "KeyY") {
      e.preventDefault();
      stepRedo();
      return;
    }
    if (ctrl && code === "KeyC") {
      e.preventDefault();
      copy();
      return;
    }
    if (ctrl && code === "KeyX") {
      e.preventDefault();
      copy(true);
      return;
    }
    if (ctrl && code === "KeyV") {
      e.preventDefault();
      paste();
      return;
    }
    if (ctrl && code === "KeyA") {
      e.preventDefault();
      selection = new Set(p.nodes.map((n) => n.id));
      renderProps();
      updateStatus();
      requestDraw();
      return;
    }
    if (ctrl && code === "KeyS") {
      e.preventDefault();
      e.shiftKey ? exportProject() : save();
      return;
    }
    if (ctrl && e.shiftKey && code === "KeyO") {
      e.preventDefault();
      $("fileImport").click();
      return;
    }
    if (code === "Delete" || code === "Backspace") {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (!ctrl && code === "KeyF") {
      e.preventDefault();
      e.shiftKey ? fitAll() : focusOrigin();
      return;
    }
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(code) &&
      selection.size
    ) {
      e.preventDefault();
      const step = p.settings.snapToGrid ? (e.shiftKey ? 120 : 12) : e.shiftKey ? 50 : 10;
      const anchor = node([...selection][0]);
      const dx = code === "ArrowLeft" ? -step : code === "ArrowRight" ? step : 0,
        dy = code === "ArrowUp" ? -step : code === "ArrowDown" ? step : 0;
      transaction(() =>
        E.moveGroup(
          p,
          [...selection],
          p.settings.snapToGrid ? Math.round((anchor.pos.x + dx) / 12) * 12 - anchor.pos.x : dx,
          p.settings.snapToGrid ? Math.round((anchor.pos.y + dy) / 12) * 12 - anchor.pos.y : dy,
        ),
      );
    }
  }
  function clearProject() {
    transaction(() => {
      p.nodes = [];
      p.links = [];
      selection.clear();
      pendingPort = null;
    });
  }
  function exportNotice(location,open) {
    document.querySelector(".exportCompletionToast")?.remove();
    const toast=document.createElement("div");toast.className="exportCompletionToast";toast.setAttribute("role","status");
    toast.append("Схема успешно экспортирована в расположение " + location + " ");
    toast.append(button("Открыть",()=>Promise.resolve(open()).catch(()=>notify("Не удалось открыть экспортированный файл"))));
    document.body.append(toast);setTimeout(()=>toast.remove(),20000);
  }

  function boot() {
    desktop?.onExportCompleted?.(value=>exportNotice(value.path,()=>desktop.openExport(value.token)));
    if (desktop) {
      document.body.classList.add("desktopApp");
      $("desktopData").hidden = false;
      $("btnDataFolder").title = "Открыть папку данных: " + desktop.info.dataDirectory;
      $("desktopDataPath").textContent = desktop.info.dataDirectory;
      $("btnDesktopSettings").onclick = () => desktop.openSettings?.();
      $("btnDataFolder").onclick = () => desktop.openDataFolder().catch(() => notify("Не удалось открыть папку данных"));
      document.querySelector(".hub-back").href = "https://ileech.mywire.org/";
    }
    const actionLog = $("actionLog");
    $("btnActionLog").onclick = () => {
      $("actionLogCopyStatus").textContent = "";
      actionLog.showModal();
      updateActionLog();
    };
    $("btnCloseActionLog").onclick = () => actionLog.close();
    $("btnCopyActionLog").onclick = async () => {
      const status = $("actionLogCopyStatus");
      try {
        await navigator.clipboard.writeText(recentActions.join("\n"));
        status.textContent = "Весь лог скопирован";
      } catch {
        const range = document.createRange();
        range.selectNodeContents($("actionLogEntries"));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = "Лог выделен. Нажмите Ctrl+C, чтобы скопировать.";
      }
    };
    document.addEventListener("click", event => {
      const button = event.target.closest?.("button");
      if (!button || button.id === "btnActionLog" || actionLog.contains(button)) return;
      const label = button.getAttribute("aria-label") || button.title || button.textContent.trim();
      if (label) recordAction(label.replace(/\s+/g, " ").slice(0, 160));
    }, true);
    window.addEventListener("error", event => recordAction("Ошибка: " + (event.message || "ресурс недоступен")));
    window.addEventListener("unhandledrejection", event => recordAction("Ошибка: " + (event.reason?.message || String(event.reason))));
    recordAction("Редактор запущен");
    let fitInitialProject = false;
    try {
      const raw = storage.getItem(SESSION);
      if (raw) {
        try {
          p = E.migrate(JSON.parse(raw));
        } catch (e) {
          const backup = storage.getItem(BACKUP);
          if (!backup) throw e;
          p = E.migrate(JSON.parse(backup));
          skipBackupOnce = true;
          notify("Восстановлена резервная локальная сессия");
        }
      } else {
        p = window.ElectricDefaultProject.create();
        fitInitialProject = true;
      }
    } catch (e) {
      storageError = true;
      notify(
        "Локальная сессия недоступна или повреждена. Исходные данные сохранены в хранилище; открыт пустой проект.",
      );
    }
    try {
      const raw = JSON.parse(storage.getItem(CUSTOM) || "[]");
      if (Array.isArray(raw))
        custom = raw.flatMap(template => {
          try { return [normalizeCustomTemplate(template)]; }
          catch { return []; }
        });
    } catch {}
    calc = E.calculate(p);
    announceOverloads();
    $("projectName").value = p.meta.name;
    $("voltageLN").value = p.settings.voltageLN;
    renderCatalog();
    renderProps();
    renderNavigator();
    updateStatus();
    logProjectChanges();
    initPointers();
    $("btnSave").onclick = () => {
      save();
      exportProject();
    };
    $("btnExport").onclick = exportScheme;
    $("btnImport").onclick = () => $("fileImport").click();
    const importChoice = $("importChoiceDialog");
    $("btnImport").addEventListener("contextmenu", event => {
      event.preventDefault();
      if (!importChoice.open) importChoice.showModal();
    });
    $("btnImportFromDisk").onclick = () => { importChoice.close(); $("fileImport").click(); };
    $("btnCancelImportChoice").onclick = () => importChoice.close();
    $("btnLoadDemoProject").onclick = () => {
      importChoice.close();
      if (transaction(() => { p = window.ElectricDefaultProject.create(); selection.clear(); transient(); })) {
        $("projectName").value = p.meta.name;
        $("voltageLN").value = p.settings.voltageLN;
        fitAll(); notify("Демо-схема загружена. Ctrl+Z — отменить.");
      }
    };
    $("fileImport").onchange = (e) => importFile(e.target.files[0]);
    $("btnClear").onclick = clearProject;
    const cableSettings = $("cableSettingsDialog");
    scene.onRouteDrag = (id, event) => {
      if (drag) return;
      ensureRoutes();
      const link = p.links.find(item => item.id === id);
      const path = routeCache.get(id);
      if (!link || !path?.length) return;
      const viewport = ws.getBoundingClientRect();
      const start = toWorld({x:event.clientX - viewport.left, y:event.clientY - viewport.top});
      const segments = ElectricRouting.segments(path);
      const distance = ({a,b}) => Math.hypot(
        start.x - Math.max(Math.min(a.x,b.x), Math.min(Math.max(a.x,b.x),start.x)),
        start.y - Math.max(Math.min(a.y,b.y), Math.min(Math.max(a.y,b.y),start.y)),
      );
      let index = 0;
      for (let i = 1; i < segments.length; i++)
        if (distance(segments[i]) < distance(segments[index])) index = i;
      const {a,b,h} = segments[index];
      const reserved = [...routeCache].filter(([key]) => key !== id).map(([,route]) => route);
      let preview = path;
      return {
        move(pointer) {
          const screenDelta = h ? pointer.clientY - event.clientY : pointer.clientX - event.clientX;
          if (Math.abs(screenDelta) < 3 && preview === path) return;
          let delta = screenDelta / p.view.zoom;
          if (p.settings.snapToGrid) delta = Math.round(delta / 12) * 12;
          const shifted = point => h ? {x:point.x,y:point.y + delta} : {x:point.x + delta,y:point.y};
          const stub = Math.min(20, Math.abs(b.x-a.x)/3);
          const first = index === 0 ? {x:a.x+stub,y:a.y} : a;
          const last = index === segments.length-1 ? {x:b.x-stub,y:b.y} : b;
          const candidate = ElectricRouting.clean([...path.slice(0,index+1), first,
            shifted(first), shifted(last), last, ...path.slice(index+1)]);
          if (ElectricRouting.valid(p, link, candidate, reserved)) {
            preview = delta ? candidate : path;
            routeCache.set(id, preview);
            requestDraw();
          }
        },
        finish(save) {
          routeCache.set(id, path);
          if (save && preview !== path) {
            if (transaction(() => { link.manualRoute = preview; }, {geometry:false}))
              routeCache.set(id, preview);
          }
          requestDraw();
        },
      };
    };
    scene.onRouteReset = id => {
      const link = p.links.find(item => item.id === id);
      if (link?.manualRoute) transaction(() => { delete link.manualRoute; });
    };
    const rebuildRoutes = button("Перестроить все трассы", () => {
      if (!p.links.length) return;
      transaction(() => {
        for (const link of p.links) delete link.manualRoute;
      });
      $("worldSettingsPopup").open = false;
    });
    rebuildRoutes.title = "Пересчитать маршруты всех кабелей и сбросить ручные изгибы";
    const arrangeNodes = button("Авторасстановка модулей", () => {
      if (!p.nodes.length) return;
      const applied = transaction(() => {
        const gap = 96;
        const placed = [];
        const ordered = [...p.nodes].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
        for (const node of ordered) {
          let bounds = E.rect(node);
          let obstacle;
          while ((obstacle = placed.find(other =>
            bounds.left < other.right + gap && bounds.right > other.left - gap &&
            bounds.top < other.bottom + gap && bounds.bottom > other.top - gap))) {
            const dx = obstacle.right + gap - bounds.left;
            const dy = obstacle.bottom + gap - bounds.top;
            const snapUp = value => p.settings.snapToGrid ? Math.ceil(value / 12) * 12 : value;
            if (dx < dy) node.pos.x = snapUp(node.pos.x + dx);
            else node.pos.y = snapUp(node.pos.y + dy);
            bounds = E.rect(node);
          }
          placed.push(bounds);
        }
      });
      if (applied) $("worldSettingsPopup").open = false;
    });
    arrangeNodes.title = "Раздвинуть модули там, где зазор меньше 96 единиц";
    const toolActions = document.createElement("div");
    toolActions.className = "worldToolActions";
    toolActions.setAttribute("role", "group");
    toolActions.setAttribute("aria-label", "Автоматы и трассировка");
    const disableBreakers = button("Выключить все автоматы", () => {
      let count = 0;
      transaction(() => {
        for (const n of p.nodes) for (const breaker of [n.mainBreaker,...n.inputs.map(v=>v.breaker),...n.outputs.map(v=>v.breaker)]) {
          if (breaker && breaker.state !== "open") {breaker.state="open";count++;}
        }
      }, {geometry:false});
      notify(count ? "Выключено автоматов: " + count : "Все автоматы уже выключены");
    });
    disableBreakers.id = "btnDisableBreakers";
    rebuildRoutes.id = "btnRebuildRoutes";
    arrangeNodes.id = "btnArrangeNodes";
    const toolbarCommands = [
      [$("btnEnableBreakers"),"Включить все автоматы","M12 3v9M6 6a8 8 0 1 0 12 0"],
      [disableBreakers,"Выключить все автоматы","M8 8h8v8H8zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20"],
      [$("btnTrip"),"Проверить автоматы","m12 3 9 17H3ZM12 9v4m0 3v1"],
      [rebuildRoutes,"Перестроить все трассы","M3 5h7v7h11M3 19h7v-7M17 8l4 4-4 4"],
      [arrangeNodes,"Авторасстановка модулей","M3 3h6v6H3zM15 15h6v6h-6zM15 3h6v6h-6zM3 15h6v6H3z"],
    ];
    for (const [command,label,path] of toolbarCommands) {
      command.setAttribute("aria-label",label);
      command.title ||= label;
      command.dataset.tooltip = label;
      command.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg><span class="toolActionLabel"></span>';
      command.querySelector("span").textContent = label;
      toolActions.append(command);
    }
    $("toggleRightSidebar").before(toolActions);
    const modeSettings = document.createElement("section");
    modeSettings.className = "modeSettings";
    const modeTitle = document.createElement("h3");modeTitle.textContent="Режимы работы";
    modeSettings.append(modeTitle);
    for (const id of ["advancedMode","highlightBranch","autoTrip"]) {
      const label = $(id).closest("label"), description = label.nextElementSibling;
      modeSettings.append(label);
      if (description?.tagName === "P") modeSettings.append(description);
    }
    $("appSettingsDialog").append(modeSettings);
    $("worldSettingsPopup").hidden = true;
    // One shared settings entry in the project panel for browser and desktop.
    const projectSettingsRow=document.createElement("div");projectSettingsRow.className="projectSettingsRow";
    $("desktopData").before(projectSettingsRow);
    const projectActions = document.querySelector("#projectBlock .compactActions");
    projectActions.append($("btnAppSettings"));
    if(desktop) projectSettingsRow.append($("btnDataFolder"));
    $("btnAppSettings").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg>';
    for (const command of projectActions.querySelectorAll("button")) {
      const label = command.getAttribute("aria-label") || command.title || command.textContent.trim();
      command.setAttribute("aria-label", label);
      command.title = label;
      const caption = document.createElement("span");
      caption.className = "projectActionLabel";
      for (const child of [...command.childNodes]) if (child.nodeType === Node.TEXT_NODE) caption.append(child);
      if (!caption.textContent.trim()) caption.textContent = label;
      command.append(caption);
    }
    if (desktop) {
      $("btnDesktopSettings").textContent = "Обновления и данные PC";
      $("btnDesktopSettings").hidden=true;
      $("pcSettingsInline").hidden=false;
    }

    scene.onCableSettings = id => {
      if (!p.links.some(link => link.id === id)) return;
      cableSettings.dataset.linkId = id;
      if (!cableSettings.open) cableSettings.showModal();
      refreshCableSettings();
    };
    $("cableSettingsClose").onclick = () => cableSettings.close();
    const toolbarStatus = document.createElement("div");
    toolbarStatus.className="toolbarStatus";
    toolbarStatus.append(document.querySelector(".topBar > .chip"),$("collapsedPowerTotal"));
    $("toggleRightSidebar").before(toolbarStatus);
    toolbarStatus.before($("collapsedPowerTotal"));
    projectActions.append($("sessionStatus"));
    document.querySelector(".topBar").hidden=true;
    const controlsButton=button("Управление",()=>controlsDialog.showModal());
    controlsButton.id="btnControls";
    controlsButton.title="Управление мышью, жесты и сочетания клавиш";
    $("helpTip").before(controlsButton);
    const controlsDialog=document.createElement("dialog");
    controlsDialog.id="controlsDialog";
    controlsDialog.className="controlsDialog";
    controlsDialog.setAttribute("aria-labelledby","controlsDialogTitle");
    const controlsHeader=document.createElement("div");controlsHeader.className="settingsHeader";
    const controlsTitle=document.createElement("h2");controlsTitle.id="controlsDialogTitle";controlsTitle.textContent="Управление";
    const controlsClose=button("×",()=>controlsDialog.close());controlsClose.setAttribute("aria-label","Закрыть управление");
    controlsHeader.append(controlsTitle,controlsClose);
    const controlsContent=globalThis.ElectricI18n?.cloneSource($("helpNavigate")) || $("helpNavigate").cloneNode(true);
    controlsContent.removeAttribute("id");controlsContent.className="controlsContent helpGuide";controlsContent.hidden=false;
    for(const element of controlsContent.querySelectorAll(".helpGifGallery,.helpControlsNav,.helpImageButton,h2,#helpControlDemos"))element.remove();
    for(const element of controlsContent.querySelectorAll("[id]"))element.removeAttribute("id");
    for(const paragraph of controlsContent.querySelectorAll("p"))if(paragraph.textContent.startsWith("Запустите нужную демонстрацию"))paragraph.remove();
    controlsContent.addEventListener("click",event=>{
      const link=event.target.closest('a[href^="#"]');
      if(!link || !controlsContent.contains(link))return;
      event.preventDefault();controlsDialog.close();$("helpTip").click();
      document.querySelector(link.getAttribute("href"))?.scrollIntoView?.();
    });
    controlsDialog.append(controlsHeader,controlsContent);document.body.append(controlsDialog);
    globalThis.ElectricI18n?.refreshHelp();
    controlsDialog.onclick=event=>{if(event.target!==controlsDialog)return;const r=controlsDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)controlsDialog.close();};
    const appSettingsDialog = $("appSettingsDialog");
    $("worldVoltageFields").append($("generalSettings"));
    const worldBindings = [["worldAmbient","ambientC",20],["worldDrop","maxDropPercent",5],["worldThermal","thermalResistance",null],["worldMaterial","material","cu"]];
    $("btnAppSettings").onclick = () => {
      for (const [id,key,fallback] of worldBindings) $(id).value = p.settings.cableDefaults?.[key] ?? fallback ?? "";
      $("worldPowerFactor").value=p.settings.powerFactor;
      appSettingsDialog.showModal();
    };
    $("worldPowerFactor").onchange=()=>{if($("worldPowerFactor").reportValidity())transaction(()=>{p.settings.powerFactor=Number($("worldPowerFactor").value);},{geometry:false});};
    $("powerFactorHelp").onclick=event=>{event.preventDefault();appSettingsDialog.close();$("helpTip").click();$("helpPowerFactor").scrollIntoView?.();};
    $("closeAppSettings").onclick = () => appSettingsDialog.close();
    $("worldAssumptionsHelp").onclick = event => {
      event.preventDefault();
      appSettingsDialog.close();
      $("helpTip").click();
      document.querySelector(".modelAssumptions").open = true;
      $("helpCalculations").scrollIntoView?.();
    };
    for (const [id,key] of worldBindings) $(id).onchange = () => {
      const input=$(id);
      if (!input.reportValidity()) return;
      transaction(() => {
        p.settings.cableDefaults ||= {};
        if (input.value === "") delete p.settings.cableDefaults[key];
        else p.settings.cableDefaults[key] = key === "material" ? input.value : Number(input.value);
      }, {geometry:false});
    };
    const sectionsDialog = $("cableSectionsDialog");
    const sectionsForm = $("cableSectionsForm");
    const sectionFields = new Map();
    for (const [rating, fallback] of Object.entries(E.CABLE_SECTIONS)) {
      const label = document.createElement("label");
      label.className = "field";
      label.textContent = rating + " А";
      const input = document.createElement("input");
      Object.assign(input, {className:"input", type:"number", min:"0.01", max:"1000", step:"any", required:true});
      input.setAttribute("aria-label", "Сечение, мм², для " + rating + " А");
      label.append(input);
      $("cableSectionsFields").append(label);
      sectionFields.set(rating, {input, fallback});
    }
    const sectionTable = document.createElement("table");
    sectionTable.className = "cableSectionsTable";
    sectionTable.setAttribute("aria-label", "Сечения кабелей по номиналу: амперы и мм²");
    const sectionHead = sectionTable.createTHead().insertRow();
    const sectionRow = sectionTable.createTBody().insertRow();
    const unitsHead = document.createElement("th");unitsHead.scope="row";unitsHead.textContent="Номинал, А";sectionHead.append(unitsHead);
    const unitsCell = document.createElement("th");unitsCell.scope="row";unitsCell.textContent="Сечение, мм²";sectionRow.append(unitsCell);
    for (const [rating,{input}] of sectionFields) {
      const heading=document.createElement("th");heading.scope="col";heading.textContent=rating;sectionHead.append(heading);
      sectionRow.insertCell().append(input);
    }
    $("cableSectionsFields").replaceChildren(sectionTable);
    $("cableSectionsResetSlot").append($("cableSectionsReset"));
    function saveCableSections() {
      if (!sectionsForm.reportValidity()) return;
      uiPrefs.cableSections = Object.fromEntries([...sectionFields].map(([rating,{input}])=>[rating,Number(input.value)]));
      saveUI();
      E.setCableSections(uiPrefs.cableSections);
      changed({geometry:false});
    }
    for (const [rating,{input,fallback}] of sectionFields) {
      input.value = uiPrefs.cableSections?.[rating] ?? fallback;
      input.onchange = saveCableSections;
    }
    $("cableSectionsReset").onclick = () => {
      for (const {input,fallback} of sectionFields.values()) input.value=fallback;
      saveCableSections();
    };
    sectionsForm.onsubmit = event => {event.preventDefault();saveCableSections();};
    const cableDialog = $("cableLengthDialog");
    const lengthInput = $("cableLengthInput");
    const lengthWarning = $("cableLengthWarning");
    const lengthLimits = $("cableLengthLimits");
    function refreshLengthWarning() {
      lengthLimits.hidden = true;
      lengthInput.setCustomValidity("");
      const link = p.links.find(item => item.id === cableDialog.dataset.linkId);
      let warnings = [];
      if (link && lengthInput.value && lengthInput.validity.valid) {
        const out = port(link.from);
        const inlet = port(link.to);
        const load = calc.ports.get(link.from.portId);
        if (out && inlet && load) {
          const draft = {...link, cable: {...link.cable, lengthM: Number(lengthInput.value)}};
          const cable = E.cableParameters(draft, out, inlet, p.settings);
          const estimate = E.cableEstimate(cable, out.phases, load.loadA);
          warnings = E.cableWarnings(cable, estimate, out, inlet, p.settings.voltageLN, {includeLength:false});
          const error = cableDropError(estimate);
          lengthInput.setCustomValidity(error);
          if (error) warnings.unshift(error);
          const draftProject = {...p, links: p.links.map(item => item === link ? draft : item)};
          const receivingAt = length => {
            draft.cable.lengthM = length;
            return E.calculate(draftProject).nodes.get(link.to.nodeId);
          };
          const receiving = receivingAt(cable.lengthM);
          if (receiving.upstreamVoltagePowerDeficit)
            warnings.unshift("Нехватка мощности выше по цепи питания. Изменение длины этой трассы не устраняет вышестоящее ограничение.");
          if (receiving.localVoltagePowerDeficit) {
            const required = (E.sum(receiving.loadW) / 1000).toFixed(2);
            const available = (receiving.availableWatts / 1000).toFixed(2);
            warnings.unshift(`Из-за падения напряжения доступно ${available} кВт при нагрузке ${required} кВт.`);
          }
          if (estimate) {
            const voltage = p.settings.voltageLN * (estimate.lineVoltage ? Math.sqrt(3) : 1);
            const zeroVoltageLength = estimate.dropV > 0 ? cable.lengthM * voltage / estimate.dropV : Infinity;
            const dropLength = zeroVoltageLength * cable.maxDropPercent / 100;
            const maxInput = Number(lengthInput.max);
            let low = 0;
            let high = Math.min(maxInput, zeroVoltageLength);
            const atLimit = receivingAt(high);
            if (E.sum(atLimit.loadW) <= atLimit.availableWatts + 1e-8) low = high;
            for (let i = 0; i < 32 && low < high; i++) {
              const middle = (low + high) / 2;
              const node = receivingAt(middle);
              if (E.sum(node.loadW) <= node.availableWatts + 1e-8) low = middle;
              else high = middle;
            }
            const meters = value => !Number.isFinite(value) ? "нет предела при текущем токе"
              : value < .01 ? "нет допустимой длины"
              : (Math.floor(value * 100) / 100).toLocaleString("ru-RU") + " м";
            $("cableDropLimitLabel").textContent = `По нормативу ΔU < ${cable.maxDropPercent}%`;
            $("cableDropLimitValue").textContent = meters(dropLength);
            $("cableLoadLimitValue").textContent = (low >= maxInput ? "≥ " : "") + meters(low);
            $("cableAbsoluteLimitValue").textContent = meters(zeroVoltageLength);
            lengthLimits.hidden = false;
          }
        }
      }
      lengthWarning.hidden = !warnings.length;
      lengthWarning.textContent = warnings.join("\n");
      lengthWarning.style.whiteSpace = "pre-line";
    }
    lengthInput.oninput = refreshLengthWarning;
    scene.onCableEdit = id => {
      const link = p.links.find(item => item.id === id);
      if (!link || !p.settings.advancedMode) return;
      cableDialog.dataset.linkId = id;
      lengthInput.value = link.cable?.lengthM ?? "";
      if (!cableDialog.open) cableDialog.showModal();
      refreshLengthWarning();
      lengthInput.focus();
      lengthInput.select();
    };
    scene.onCableLabelMove = (id, fraction) => {
      const link = p.links.find(item => item.id === id);
      if (!link?.cable?.lengthM || Math.abs((link.cable.labelFraction ?? .5) - fraction) < 1e-6) return;
      transaction(() => { link.cable.labelFraction = fraction; }, {geometry:false});
    };
    $("cableLengthCancel").onclick = () => cableDialog.close();
    $("cableLengthForm").onsubmit = event => {
      event.preventDefault();
      refreshLengthWarning();
      if (!lengthInput.reportValidity()) return;
      const link = p.links.find(item => item.id === cableDialog.dataset.linkId);
      if (link) transaction(() => {
        link.cable ??= {};
        if (lengthInput.value === "") delete link.cable.lengthM;
        else link.cable.lengthM = Number(lengthInput.value);
      }, {geometry:false});
      cableDialog.close();
    };
    $("btnNewNode").onclick = () => openBuilder();
    $("helpTip").onclick = () => openModal("helpModal");
    for (const figure of $("helpModal").querySelectorAll(".helpGif")) {
      const image = figure.querySelector("img"),
        button = figure.querySelector(".helpGifButton"),
        poster = image.getAttribute("src"),
        title = () => figure.querySelector("h4").textContent;
      const stop = () => {
        if (button.getAttribute("aria-pressed") !== "true") return;
        image.setAttribute("src", poster);
        button.setAttribute("aria-pressed", "false");
        button.textContent = "Воспроизвести GIF";
        button.setAttribute("aria-label", "Воспроизвести GIF: " + title());
      };
      helpAnimations.push(stop);
      button.onclick = () => {
        const play = button.getAttribute("aria-pressed") !== "true";
        stopHelpAnimations();
        if (!play) return;
        figure.scrollIntoView?.({block: "start", behavior: "auto"});
        image.setAttribute("src", image.dataset.gif);
        button.setAttribute("aria-pressed", "true");
        button.textContent = "Остановить";
        button.setAttribute("aria-label", "Остановить GIF: " + title());
      };
    }
    const helpImageDialog = document.createElement("dialog");
    helpImageDialog.className = "helpImageDialog";
    helpImageDialog.setAttribute("aria-label", "Изображение из справки");
    const helpImage = document.createElement("img"),
      helpImageCaption = document.createElement("p"),
      helpImageClose = document.createElement("button");
    helpImageCaption.id = "helpImageCaption";
    helpImageDialog.setAttribute("aria-describedby", helpImageCaption.id);
    helpImageClose.type = "button";
    helpImageClose.className = "btn";
    helpImageClose.textContent = "Закрыть изображение";
    let helpImageTrigger = null;
    helpImageClose.onclick = () => helpImageDialog.close();
    helpImageDialog.onclose = () => {
      helpImage.removeAttribute("src");
      helpImageTrigger?.focus();
    };
    helpImageDialog.onkeydown = event => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        helpImageDialog.close();
      }
    };
    helpImageDialog.onclick = event => {
      if (event.target === helpImageDialog) helpImageDialog.close();
    };
    helpImageDialog.append(helpImageClose, helpImage, helpImageCaption);
    document.body.append(helpImageDialog);
    for (const trigger of $("helpModal").querySelectorAll(".helpImageButton")) {
      trigger.onclick = () => {
        const source = trigger.querySelector("img");
        helpImageTrigger = trigger;
        helpImage.src = source.src;
        helpImage.alt = source.alt;
        helpImageCaption.textContent = trigger.closest("figure").querySelector("figcaption")?.textContent || source.alt;
        helpImageDialog.showModal();
        helpImageClose.focus();
      };
    }
    $("helpSearch").oninput = event => {
      stopHelpAnimations();
      const query = event.target.value.trim().toLocaleLowerCase("ru-RU");
      const sections = [...$("helpModal").querySelectorAll(".helpGuide")];
      let visible = 0;
      for (const section of sections) {
        section.hidden = !!query && !section.textContent.toLocaleLowerCase("ru-RU").includes(query);
        if (!section.hidden) visible++;
      }
      $("helpNoResults").hidden = visible > 0;
      for (const link of $("helpModal").querySelectorAll(".helpTopics a")) {
        const target = $(link.getAttribute("href").slice(1));
        link.hidden = !target || target.hidden;
      }
    };
    for (const side of ["Left", "Right"]) {
      const b = $("toggle" + side + "Sidebar");
      $("app").classList.toggle("hide" + side + "Sidebar", !!uiPrefs["hide" + side]);
      b.setAttribute("aria-expanded", !uiPrefs["hide" + side]);
      b.title = (uiPrefs["hide" + side] ? "Показать" : "Скрыть") + (side === "Left" ? " левую панель" : " правую панель");
      b.setAttribute("aria-label", b.title);
      b.onclick = () => {
        if (side === "Right" && window.innerWidth <= 1250 || side === "Left" && window.innerWidth <= 760) {
          const key = side.toLowerCase();
          showPanel(document.body.dataset.panel === key ? null : key);
          return;
        }
        const hidden = $("app").classList.toggle("hide" + side + "Sidebar");
        const label = (hidden ? "Показать" : "Скрыть") + (side === "Left" ? " левую панель" : " правую панель");
        uiPrefs["hide" + side] = hidden; saveUI();
        b.title = label; b.setAttribute("aria-label", label); b.setAttribute("aria-expanded", !hidden);
        positionSidebarToggles();
      };
    }
    positionSidebarToggles();
    window.addEventListener("resize", positionSidebarToggles);
    const blocks = ["projectBlock", "catalogBlock", "powerSummaryBody", "outlinerBlock", "propsScroll"];
    const collapsed = new Set(Array.isArray(uiPrefs.collapsedSidebarBlocks) ? uiPrefs.collapsedSidebarBlocks : []);
    const syncDividers = () => {
      $("leftPanel").classList.toggle("catalogCollapsed", collapsed.has("catalogBlock"));
      $("rightPanel").classList.toggle("propertiesCollapsed", collapsed.has("propsScroll"));
    };
    const blockSync = new Map();
    for (const id of blocks) {
      const body = $(id);
      const title = body.previousElementSibling.querySelector(".title");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sidebarSectionToggle";
      toggle.setAttribute("aria-controls", id);
      toggle.textContent = title.textContent;
      title.replaceChildren(toggle);
      const sync = () => {
        body.hidden = collapsed.has(id);
        toggle.setAttribute("aria-expanded", String(!body.hidden));
      };
      blockSync.set(id, sync);
      toggle.onclick = () => {
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        uiPrefs.collapsedSidebarBlocks = [...collapsed];
        sync();
        syncDividers();
        saveUI();
      };
      sync();
    }
    syncDividers();
    function bindSidebarSplitter(splitter, body, lowerId, panel, preference, minimum, reserve) {
    const expandAdjacent = () => {
      let changed = false;
      for (const id of [body.id, lowerId]) {
        if (collapsed.delete(id)) {
          blockSync.get(id)();
          changed = true;
        }
      }
      if (changed) {
        uiPrefs.collapsedSidebarBlocks = [...collapsed];
        syncDividers();
        saveUI();
      }
    };
    const setTreeHeight = value => {
      const max = Math.max(minimum, panel.getBoundingClientRect().height - reserve);
      const height = Math.max(minimum, Math.min(max, value));
      body.style.height = height + "px";
      uiPrefs[preference] = height;
      saveUI();
      splitter.setAttribute("aria-valuemin", minimum);
      splitter.setAttribute("aria-valuemax", Math.round(max));
      splitter.setAttribute("aria-valuenow", Math.round(height));
    };
    if (Number.isFinite(uiPrefs[preference])) {
      body.style.height = Math.max(minimum, uiPrefs[preference]) + "px";
      splitter.setAttribute("aria-valuenow", Math.round(uiPrefs[preference]));
    }
    let splitDrag = null;
    splitter.onpointerdown = e => {
      e.preventDefault();
      expandAdjacent();
      splitDrag = {y:e.clientY, height:body.getBoundingClientRect().height};
      splitter.setPointerCapture(e.pointerId);
    };
    splitter.onpointermove = e => { if(splitDrag) setTreeHeight(splitDrag.height + e.clientY - splitDrag.y); };
    splitter.onpointerup = splitter.onpointercancel = () => {
      splitDrag = null;
      if (desktop && uiSaveTimer) { writeUI(); updateStatus(); }
    };
    splitter.onkeydown = e => {
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.code)) {
        e.preventDefault();
        expandAdjacent();
        const height = body.getBoundingClientRect().height;
        setTreeHeight(e.code === "Home" ? minimum : e.code === "End" ? 1e5 : height + (e.code === "ArrowDown" ? 24 : -24));
      }
    };
    }
    bindSidebarSplitter($("sidebarSplitter"), $("outlinerBlock"), "propsScroll", $("rightPanel"), "treeHeight", 100, 240);
    $("btnCloseHelp").onclick = closeModal;
    $("btnCloseNodeModal").onclick = closeModal;
    $("overlay").onclick = closeModal;
    $("btnCreateNode").onclick = applyBuilder;
    $("btnSaveTemplate").onclick = saveTemplate;
    $("btnExportModule").onclick = exportBuilderModule;
    $("btnImportModule").onclick = () => $("moduleJsonFile").click();
    $("moduleJsonFile").onchange = e => { void importBuilderModule(e.target.files[0]); };
    $("newNodeOutCount").addEventListener("input", () => syncBuilder());
    $("btnImportTemplates").onclick = () => $("fileImportTemplates").click();
    $("fileImportTemplates").onchange = event => {
      const input = event.target;
      const file = input.files[0];
      input.value = "";
      importTemplates(file);
    };
    $("btnExportTemplates").onclick = () => {
      if (!custom.length) return;
      const blob = new Blob([JSON.stringify(custom, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "electriccad-custom-modules.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    let nameBefore = null;
    $("projectName").onfocus = () => (nameBefore = serial());
    $("projectName").onchange = () => {
      const before = nameBefore || serial();
      transaction(
        () => (p.meta.name = $("projectName").value.trim() || "Новый проект"),
        { geometry: false },
      );
      $("projectName").value = p.meta.name;
      nameBefore = null;
    };
    $("voltageLL").onchange = () =>
      transaction(
        () =>
          (p.settings.voltageLN = Number($("voltageLL").value) / Math.sqrt(3)),
        { geometry: false },
      );
    $("voltageLN").onchange = () =>
      transaction(() => (p.settings.voltageLN = Number($("voltageLN").value)), {
        geometry: false,
      });
    for (const id of [
      "newNodeType",
      "modulePhases",
      "newNodeOutCount",
      "sourceShield",
      "sourceKind",
    ])
      $(id).addEventListener("change", () => syncBuilder(id === "newNodeType" || id === "sourceKind"));
    for (const id of ["newNodeInConn", "newNodeOutConn"])
      $(id).addEventListener("change", () => {
        syncRatings(
          $(id === "newNodeInConn" ? "newNodeInA" : "newNodeOutA"),
          connectorValue(id),
        );
        previewBuilder();
      });
    for (const id of [
      "newNodeName",
      "newNodeInA",
      "newNodeOutA",
      "newNodeW",
      "mainBreakerA",
      "sourceSupplyA",
    ])
      $(id).addEventListener("input", previewBuilder);
    $("mainBreakerEnabled").addEventListener("change", previewBuilder);
    $("btnApplyPorts").onclick = () => syncBuilder(true);
    $("catalogSearch").oninput = (e) => {
      catalogQuery = e.target.value;
      renderCatalog();
    };
    $("btnSnap").onclick = () => transaction(() => { p.settings.snapToGrid = !p.settings.snapToGrid; }, {geometry:false});
    $("advancedMode").onchange = e => transaction(() => { p.settings.advancedMode = e.target.checked; });
    $("highlightBranch").onchange = e => transaction(() => { p.settings.highlightBranch = e.target.checked; }, {geometry:false});
    $("autoTrip").onchange = e => transaction(() => { p.settings.autoTrip = e.target.checked; }, {geometry:false});
    document.addEventListener("click", e => {
      for (const popup of document.querySelectorAll("#worldSettingsPopup, .modelAssumptions")) {
        if (!popup.contains(e.target)) popup.open = false;
      }
      if (e.target.matches?.("dialog.cableLengthDialog")) {
        const bounds = e.target.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right ||
            e.clientY < bounds.top || e.clientY > bounds.bottom) e.target.close();
      }
    });
    document.addEventListener("keydown", e => { if (e.code === "Escape") $("worldSettingsPopup").open = false; });
    $("btnUndo").onclick = stepUndo;
    $("btnRedo").onclick = stepRedo;
    $("btnFit").onclick = fitAll;
    $("btnOrigin").onclick = focusOrigin;
    $("btnZoomIn").onclick = () => {
      const r = ws.getBoundingClientRect();
      zoomAt(1.2, { x: r.width / 2, y: r.height / 2 });
    };
    $("btnZoomOut").onclick = () => {
      const r = ws.getBoundingClientRect();
      zoomAt(1 / 1.2, { x: r.width / 2, y: r.height / 2 });
    };
    $("btnCopy").onclick = () => copy();
    $("btnPaste").onclick = paste;
    $("btnDelete").onclick = deleteSelection;
    $("btnDisconnect").onclick = () => {
      if (pendingPort) {
        disconnect(pendingPort);
        pendingPort = null;
        requestDraw();
      } else notify("Сначала нажмите порт");
    };
    $("btnEnableBreakers").onclick = () => {
      let count = 0;
      transaction(() => {
        for (const n of p.nodes) {
          for (const breaker of [n.mainBreaker, ...n.inputs.map(v => v.breaker), ...n.outputs.map(v => v.breaker)]) {
            if (breaker && breaker.state !== "closed") {
              breaker.state = "closed";
              count++;
            }
          }
        }
      }, { geometry: false });
      if (!(p.settings.autoTrip && $("toastMsg").querySelector(".overloadSourceLink"))) notify(count ? "Включено автоматов: " + count : "Все автоматы уже включены");
    };
    $("btnTrip").onclick = () => {
      let trips = [];
      transaction(
        () => {
          trips = E.tripOverloads(p);
        },
        { geometry: false },
      );
      notify(
        trips.length
          ? "Отключено автоматов: " + trips.length
          : "Перегрузок включённых автоматов нет",
      );
    };
    $("moduleNavigator").onchange = (e) => {
      const n = node(e.target.value);
      if (!n) return;
      select(n.id);
      const r = ws.getBoundingClientRect();
      p.view.panX = r.width / 2 - n.pos.x * p.view.zoom;
      p.view.panY = r.height / 2 - n.pos.y * p.view.zoom;
      showPanel("right");
      requestDraw();
    };
    $("mobileCatalog").onclick = () => showPanel("left");
    $("mobileProps").onclick = () => showPanel("right");
    $("mobileShade").onclick = () => showPanel(null);
    for (const id of ["toolPan", "toolSelect"])
      $(id).onclick = () => {
        for (const key of ["toolPan", "toolSelect"])
          $(key).classList.toggle("active", key === id);
      };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pagehide", () => {
      if (!storageError) save();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !storageError) save();
    });
    window.addEventListener("beforeunload", (e) => {
      // Flush debounced changes before Electron can close the renderer.
      if (desktop) {
        if (!storageError || dirty) save();
        if (uiSaveTimer || uiStorageError) writeUI();
      }
      if ((storageError && dirty) || (desktop && uiStorageError)) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    window.addEventListener("storage", (e) => {
      if (e.key === SESSION)
        notify(
          "Проект изменён в другой вкладке. Экспортируйте свою версию перед перезагрузкой.",
        );
    });
    new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (resizeRect && r.width && r.height) {
        p.view.panX += (r.width - resizeRect.width) / 2;
        p.view.panY += (r.height - resizeRect.height) / 2;
      }
      resizeRect = { width: r.width, height: r.height };
      updateStatus();
      requestDraw();
    }).observe(ws);
    if (!localStorageAvailable()) storageError = true;
    if (fitInitialProject) requestAnimationFrame(fitAll);
    else requestDraw();
    updateStatus();
  }
  function localStorageAvailable() {
    try {
      storage.getItem(SESSION);
      return true;
    } catch {
      return false;
    }
  }
  // Called by the desktop host before an update may close the editor.
  window.electricPrepareToExit = () => {
    document.activeElement?.blur();
    // A corrupt initial session is deliberately left untouched; changed projects must save.
    const projectSaved = (!storageError || dirty) ? save() : !dirty;
    const preferencesSaved = writeUI();
    return projectSaved && preferencesSaved;
  };
  window.addEventListener("electric-language-changed", () => {
    staticKey = "";
    overloadMessageKey = ""; announceOverloads();
    renderCatalog(); renderProps(); renderNavigator(); updateStatus();
    requestDraw();
    window.ElectricI18n?.scan();
    $("helpSearch").dispatchEvent(new Event("input"));
  });
  // Public read-only diagnostic snapshot for manual regression checks, without mutable state access.
  window.electricDiagnostics = () => ({
    version: E.VERSION,
    rendering: { ...scene.stats },
    project: E.clone(p),
    selection: [...selection],
    undo: undo.length,
    redo: redo.length,
    computed: [...calc.nodes].map(([id, c]) => ({ id, ...E.clone(c) })),
    routes: p.links.map((l) => ({ id: l.id, points: wirePath(l) })),
  });
  document.addEventListener("DOMContentLoaded", boot);
})();

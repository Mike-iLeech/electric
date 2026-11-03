(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectricEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 32,
    APP = "ElectricCAD_Easy",
    PHASES = ["L1", "L2", "L3"];
  const CONNECTORS = {
    euro: {
      name: "Schuko / EURO",
      phases: 1,
      pins: "P+N+PE",
      voltage: "1ф",
      ratings: [6, 10, 16],
      exact: false,
    },
    cee1: {
      name: "CEE P+N+PE",
      phases: 1,
      pins: "P+N+PE",
      voltage: "1ф",
      ratings: [16, 32, 63, 125],
      exact: true,
    },
    cee3: {
      name: "CEE 3P+N+PE",
      phases: 3,
      pins: "3P+N+PE",
      voltage: "3ф",
      ratings: [16, 32, 63, 125, 250],
      exact: true,
    },
    powercon: {
      name: "powerCON TRUE1",
      phases: 1,
      pins: "P+N+PE",
      voltage: "1ф",
      ratings: [16],
      exact: true,
    },
    terminal1: {
      name: "Клеммный ввод 1ф",
      phases: 1,
      pins: "P+N+PE",
      voltage: "1ф",
      ratings: [16, 32, 63, 125, 250],
      exact: false,
    },
    terminal3: {
      name: "Клеммный ввод 3ф",
      phases: 3,
      pins: "3P+N+PE",
      voltage: "3ф",
      ratings: [16, 32, 63, 125, 250],
      exact: false,
    },
  };
  let seq = 0;
  const catalogAliases = new Map();
  const cleanLabel = (s) =>
    String(s || "")
      .replace(/(^|\s)(синий|красный)(?=\s|$)/giu, "$1")
      .replaceAll("2P+PE", "P+N+PE")
      .replaceAll("→", " -> ")
      .replace(/\s+/g, " ")
      .trim();
  function catalogTemplate(name) {
    if (!catalogAliases.size) catalog();
    return catalogAliases.get(cleanLabel(name));
  }
  function connectorLabel(key) {
    return (
      {
        cee1: "CEE P+N+PE",
        cee3: "CEE 3P+N+PE",
        euro: "Schuko",
        powercon: "powerCON",
        terminal1: "Клеммы P+N+PE",
        terminal3: "Клеммы 3P+N+PE",
      }[key] || "Ввод"
    );
  }
  function nomenclature(n, { connectors = false, compactConnectors = false } = {}) {
    if (!catalogAliases.size) catalog();
    const template = catalogAliases.get(cleanLabel(n.templateName || n.name));
    const ordinary = template && (!n.templateName || n.name === n.templateName);
    const sourceTerminal = (
      n.inConnType ||
      n.supplyConnType ||
      template?.inConnType
    )?.startsWith("terminal");
    const base = ordinary
      ? n.category === "input"
        ? n.shield
          ? sourceTerminal
            ? "Щит с клеммным вводом"
            : "Щит"
          : "Ввод"
        : n.category === "consumer"
          ? "Потребитель"
          : n.category === "distributor"
            ? "Дистрибьютор"
            : n.transition
              ? "Переход"
              : "Удлинитель"
      : cleanLabel(n.name).split("|")[0].trim();
    const phase = n.phases === 3 ? "Трёхфазный" : "Однофазный";
    const input = n.inputs?.[0];
    const connection = (key, amps) => compactConnectors
      ? ({cee1:`CEE ${amps}А 1P`,cee3:`CEE ${amps}А 3P`,euro:`SHUKO ${amps}А`,powercon:`powerCON ${amps}А`,terminal1:`Клеммы ${amps}А 1P`,terminal3:`Клеммы ${amps}А 3P`}[key] || `${connectorLabel(key)} ${amps}А`)
      :
      (connectors ? ({cee1:"CEE 1ф", cee3:"CEE 3ф", euro:"Schuko", powercon:"powerCON", terminal1:"Клеммы 1ф", terminal3:"Клеммы 3ф"}[key] || connectorLabel(key)) + " " : "") + amps + "А";
    const from = n.category === "input" ? "Сеть" : connection(input?.connType || n.inConnType, input?.nominalA || n.inA || n.supplyA);
    const groups = new Map();
    for (const o of n.outputs || []) {
      const key = (connectors || compactConnectors ? o.connType + "|" : "") + o.nominalA;
      const v = groups.get(key) || { ...o, count: 0 };
      v.count++;
      groups.set(key, v);
    }
    const to =
      n.category === "consumer"
        ? `Нагрузка ${Number(((n.consumerWatts ?? n.watts ?? 0) / 1000).toFixed(2)).toString()} кВт`
        : [...groups.values()]
            .map(
              (o) =>
                `${o.count > 1 ? o.count + (compactConnectors ? " × " : "x ") : ""}${connection(o.connType, o.nominalA)}`,
            )
            .join(" + ") || "Нет выходов";
    return `${base} | ${phase} | ${from} → ${to}`;
  }
  function obsoleteCable(n) {
    const name = cleanLabel(n.name || n.templateName).split("|")[0].trim();
    const input = n.inputs?.[0] || {connType:n.inConnType, nominalA:n.inA};
    return name === "Кабель с голыми концами" && n.category === "extender" &&
      input.connType === "cee3" && input.nominalA === 250 &&
      n.outputs?.length === 1 && n.outputs[0].connType === "cee3" && n.outputs[0].nominalA === 250;
  }
  function terminalShields(p) {
    const removed = new Set(p.nodes.filter(obsoleteCable).map(n => n.id));
    if (removed.size) {
      p.nodes = p.nodes.filter(n => !removed.has(n.id));
      p.links = p.links.filter(l => !removed.has(l.from.nodeId) && !removed.has(l.to.nodeId));
    }
    for (const n of p.nodes) {
      const key = n.supplyConnType || n.outputs?.[0]?.connType;
      if (
        n.category === "input" &&
        (key?.startsWith("terminal") ||
          n.outputs?.some((o) => o.connType.startsWith("terminal")))
      ) {
        n.shield = true;
        n.supplyConnType = key;

      }
      if (n.category === "input") {
        for (const out of n.outputs) {
          out.breaker ??= n.mainBreaker ? clone(n.mainBreaker) : breaker(out.nominalA, out.phases);
          out.breaker.ratingA = Math.min(out.breaker.ratingA, out.nominalA);
          if (n.mainBreaker && n.mainBreaker.state !== "closed") out.breaker.state = n.mainBreaker.state;
        }
        n.mainBreaker = null;
      }
    }
    return p;
  }
  const uid = (p) =>
    p +
    "_" +
    Date.now().toString(36) +
    "_" +
    (++seq).toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const zero = () => ({ L1: 0, L2: 0, L3: 0 });
  function finite(v, min, max, label) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw Error(label + ": неверное число");
    return v;
  }
  function text(v, label, max = 160) {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      throw Error(label + ": неверная строка");
    return v;
  }
  function breaker(ratingA, poles = 1) {
    return { ratingA, poles, curve: "C", state: "closed" };
  }
  function port(kind, connType, nominalA, phase = null, protect = false) {
    const c = CONNECTORS[connType];
    if (!c) throw Error("Неизвестный разъём");
    return {
      id: uid(kind),
      kind,
      connType,
      phases: c.phases,
      nominalA,
      phase: c.phases === 1 ? phase : null,
      label: kind === "in" ? "IN" : "OUT",
      breaker: protect ? breaker(nominalA, c.phases) : null,
    };
  }
  function makeNode(
    {
      name,
      category = "distributor",
      phases = 3,
      inConnType = phases === 3 ? "cee3" : "euro",
      inA = 32,
      outputs = [],
      watts = 0,
      shield = false,
      transition = false,
      catalogPath = null,
      mainA = inA,
    },
    pos = { x: 0, y: 0 },
  ) {
    if (
      category === "input" &&
      (inConnType.startsWith("terminal") ||
        outputs.some((o) => o.connType.startsWith("terminal")))
    )
      shield = true;
    const n = {
      id: uid("node"),
      name,
      templateName: name,
      category,
      phases,
      shield,
      transition:
        transition ||
        (category === "extender" && inConnType.startsWith("terminal")),
      catalogPath,
      supplyA: inA,
      ...(category === "input" ? { supplyConnType: inConnType } : {}),
      pos: clone(pos),
      inputs: category === "input" ? [] : [port("in", inConnType, inA)],
      outputs:
        category === "consumer"
          ? []
          : outputs.map((p, i) => ({
              ...port(
                "out",
                p.connType,
                p.nominalA,
                p.phase ??
                  (CONNECTORS[p.connType].phases === 1 && phases === 3
                    ? PHASES[i % 3]
                    : null),
                category === "distributor" || category === "input",
              ),
              ...(p.breaker !== undefined ? { breaker: clone(p.breaker) } : {}),
              label: p.label || "OUT" + (i + 1),
            })),
      consumerWatts: watts,
      mainBreaker:
        category === "distributor" ? breaker(mainA, phases) : null,
    };
    return n;
  }
  function project() {
    return {
      meta: { app: APP, version: VERSION, name: "Новый проект" },
      settings: { voltageLN: 230, frequency: 50, powerFactor: 1 },
      view: { panX: 0, panY: 0, zoom: 1 },
      nodes: [],
      links: [],
    };
  }
  function compatible(a, b) {
    if (!a || !b) return { ok: false, reason: "Порт не найден" };
    if (a.kind !== "out" || b.kind !== "in")
      return { ok: false, reason: "Соединение только выход → вход" };
    if (a.hardware?.mechanicalKey && b.hardware?.mechanicalKey && a.hardware.mechanicalKey !== b.hardware.mechanicalKey)
      return { ok: false, reason: "Разные механические ключи" };
    if (a.phases !== b.phases) return { ok: false, reason: "Разная фазность" };
    if (a.connType !== b.connType)
      return { ok: false, reason: "Разные разъёмы: нужен переходник" };
    if (CONNECTORS[a.connType].exact && a.nominalA !== b.nominalA)
      return { ok: false, reason: "Разные типоразмеры разъёма по току" };
    return { ok: true, reason: "Совместимо" };
  }
  function indexes(p) {
    const nodes = new Map(p.nodes.map((n) => [n.id, n])),
      ports = new Map(),
      incoming = new Map(),
      outgoing = new Map();
    for (const n of p.nodes) {
      for (const v of [...n.inputs, ...n.outputs])
        ports.set(v.id, { node: n, port: v });
      outgoing.set(n.id, []);
    }
    for (const l of p.links) {
      incoming.set(l.to.nodeId, l);
      outgoing.get(l.from.nodeId)?.push(l);
    }
    return { nodes, ports, incoming, outgoing };
  }
  function canConnect(p, a, b) {
    if (a?.kind === "in" && b?.kind === "out") [a, b] = [b, a];
    const ix = indexes(p),
      from = ix.ports.get(a?.portId),
      to = ix.ports.get(b?.portId);
    if (!from || !to || from.node.id !== a.nodeId || to.node.id !== b.nodeId)
      return { ok: false, reason: "Порт не найден" };
    if (from.node === to.node)
      return { ok: false, reason: "Узел нельзя соединить с собой" };
    const comp = compatible(from.port, to.port);
    if (!comp.ok) return comp;
    if (
      p.links.some(
        (l) => l.from.portId === a.portId || l.to.portId === b.portId,
      )
    )
      return { ok: false, reason: "Порт уже занят" };
    const seen = new Set(),
      q = [b.nodeId];
    while (q.length) {
      const v = q.pop();
      if (v === a.nodeId) return { ok: false, reason: "Циклы запрещены" };
      if (seen.has(v)) continue;
      seen.add(v);
      for (const l of ix.outgoing.get(v) || []) q.push(l.to.nodeId);
    }
    return {
      ok: true,
      reason: "Можно соединить",
      from: { nodeId: a.nodeId, portId: a.portId },
      to: { nodeId: b.nodeId, portId: b.portId },
    };
  }
  function connect(p, a, b) {
    const r = canConnect(p, a, b);
    if (!r.ok) throw Error(r.reason);
    const l = { id: uid("link"), from: r.from, to: r.to };
    p.links.push(l);
    return l;
  }
  function validateBreaker(b, phases) {
    if (b === null || b === undefined) return;
    finite(b.ratingA, 1, 1000, "Автомат");
    if (![1, 3].includes(b.poles) || b.poles !== phases)
      throw Error("Число полюсов автомата не соответствует фазности");
    if (
      !["B", "C", "D"].includes(b.curve) ||
      !["closed", "open", "tripped"].includes(b.state)
    )
      throw Error("Некорректный автомат");
  }
  function validate(p) {
    if (!p || p.meta?.app !== APP || p.meta.version !== VERSION)
      throw Error("Неподдерживаемый формат проекта");
    text(p.meta.name, "Название");
    finite(p.settings?.voltageLN, 100, 300, "Фазное напряжение");
    if (p.settings.powerFactor !== 1 || p.settings.frequency !== 50)
      throw Error("Модель поддерживает PF=1 и 50 Гц");
    finite(p.view?.panX, -1e7, 1e7, "Pan X");
    finite(p.view?.panY, -1e7, 1e7, "Pan Y");
    finite(p.view?.zoom, 0.01, 2.5, "Масштаб");
    if (
      !Array.isArray(p.nodes) ||
      p.nodes.length > 1500 ||
      !Array.isArray(p.links) ||
      p.links.length > 5000
    )
      throw Error("Слишком большой или неверный проект");
    const ids = new Set();
    const unique = (id) => {
      text(id, "ID", 200);
      if (ids.has(id)) throw Error("Повторяющийся ID");
      ids.add(id);
    };
    for (const n of p.nodes) {
      unique(n.id);
      text(n.name, "Имя узла");
      text(n.templateName, "Шаблон");
      if (
        !["input", "distributor", "extender", "consumer"].includes(
          n.category,
        ) ||
        ![1, 3].includes(n.phases)
      )
        throw Error("Неверный тип узла");
      finite(n.pos?.x, -1e6, 1e6, "X");
      finite(n.pos?.y, -1e6, 1e6, "Y");
      finite(n.consumerWatts, 0, 1e7, "Мощность");
      if (
        !Array.isArray(n.inputs) ||
        !Array.isArray(n.outputs) ||
        n.inputs.length !== (n.category === "input" ? 0 : n.category === "distributor" && n.transfer ? 2 : 1) ||
        n.outputs.length > 32 ||
        (n.category === "consumer" && n.outputs.length) ||
        (n.category !== "consumer" && !n.outputs.length)
      )
        throw Error("Неверное число портов");
      if (n.inputs.some(input => input.phases !== n.phases))
        throw Error("Фазность входа отличается от модуля");
      for (const [kind, ports] of [
        ["in", n.inputs],
        ["out", n.outputs],
      ])
        for (const v of ports) {
          unique(v.id);
          if (v.hardware !== undefined) {
            if (!v.hardware || typeof v.hardware !== "object" || Array.isArray(v.hardware))
              throw Error("Неверные данные разъёма");
            for (const key of ["manufacturer", "partNumber", "ip", "mechanicalKey"]) {
              const value = v.hardware[key];
              if (value !== undefined && (typeof value !== "string" || value.length > 120))
                throw Error("Неверное поле разъёма: " + key);
            }
          }
          const c = CONNECTORS[v.connType];
          if (!c || c.phases !== v.phases || v.kind !== kind)
            throw Error("Неверный разъём");
          finite(v.nominalA, 1, 1000, "Номинал порта");
          if (!c.ratings.includes(v.nominalA))
            throw Error("Такого номинала нет в каталоге разъёмов");
          if (n.phases === 1 && v.phases === 3)
            throw Error("Пассивный переход 1ф → 3ф невозможен");
          if (
            kind === "out" &&
            v.phases === 1 &&
            n.phases === 3 &&
            !PHASES.includes(v.phase)
          )
            throw Error("Выберите фазу выхода");
          if (v.phase != null && !PHASES.includes(v.phase))
            throw Error("Неверная фаза");
          validateBreaker(v.breaker, v.phases);
          if (v.breaker && v.breaker.ratingA > v.nominalA)
            throw Error("Автомат выше номинала порта");
        }
      if (n.category === "input")
        finite(n.supplyA, 1, 1000, "Номинал источника");
      validateBreaker(n.mainBreaker, n.phases);
      const capacity = n.inputs[0]?.nominalA ?? n.supplyA;
      if (n.mainBreaker && n.mainBreaker.ratingA > capacity)
        throw Error("Вводной автомат выше номинала ввода");
    }
    const ix = indexes({ ...p, links: [] }),
      usedIn = new Set(),
      usedOut = new Set(),
      degrees = new Map(p.nodes.map((n) => [n.id, 0])),
      edges = new Map(p.nodes.map((n) => [n.id, []]));
    for (const l of p.links) {
      unique(l.id);
      if (l.protection !== undefined && (!l.protection || typeof l.protection !== "object" || Array.isArray(l.protection)))
        throw Error("Неверные параметры защиты");
      if (l.protection) {
        const settings = l.protection;
        if (settings.earthing !== undefined && !["TN","TT","IT"].includes(settings.earthing)) throw Error("Неверная система заземления");
        for (const key of ["loopOhm","earthOhm","rcdMa","residualMa","measuredTripSeconds","targetSeconds","startA","startSeconds","starts","pauseSeconds","coolingSeconds"])
          if (settings[key] !== undefined) finite(settings[key], 0, 1000000, "Параметр защиты: " + key);
      }
      if (l.cable !== undefined) {
        if (!l.cable || typeof l.cable !== "object" || Array.isArray(l.cable)) throw Error("Неверные параметры кабеля");
        const {lengthM, sectionMm2, ampacityA, material} = l.cable;
        if (lengthM !== undefined) finite(lengthM, 0.01, 100000, "Длина кабеля");
        if (sectionMm2 !== undefined) finite(sectionMm2, 0.1, 500, "Сечение кабеля");
        if (ampacityA !== undefined) finite(ampacityA, 0.1, 10000, "Допустимый ток кабеля");
        if (l.cable.maxDropPercent !== undefined) finite(l.cable.maxDropPercent, 0.1, 100, "Предел падения напряжения");
        if (l.cable.labelFraction !== undefined) finite(l.cable.labelFraction, 0, 1, "Положение подписи кабеля");
        if (l.cable.ambientC !== undefined) finite(l.cable.ambientC, -50, 100, "Температура среды");
        if (l.cable.thermalResistance !== undefined) finite(l.cable.thermalResistance, 0.0001, 1000, "Тепловое сопротивление");
        if (material !== undefined && !["cu", "al"].includes(material)) throw Error("Неверный материал жил");
      }
      const from = ix.ports.get(l.from?.portId),
        to = ix.ports.get(l.to?.portId);
      if (
        !from ||
        !to ||
        from.node.id !== l.from.nodeId ||
        to.node.id !== l.to.nodeId
      )
        throw Error("Связь: порт не найден");
      const r = compatible(from.port, to.port);
      if (!r.ok) throw Error("Связь: " + r.reason);
      if (from.node === to.node) throw Error("Связь: узел соединён с собой");
      if (usedOut.has(from.port.id) || usedIn.has(to.port.id))
        throw Error("Связь: порт уже занят");
      usedOut.add(from.port.id);
      usedIn.add(to.port.id);
      degrees.set(to.node.id, degrees.get(to.node.id) + 1);
      edges.get(from.node.id).push(to.node.id);
    }
    const queue = [...degrees].filter(([, v]) => !v).map(([id]) => id);
    for (let i = 0; i < queue.length; i++)
      for (const id of edges.get(queue[i])) {
        degrees.set(id, degrees.get(id) - 1);
        if (!degrees.get(id)) queue.push(id);
      }
    if (queue.length !== p.nodes.length) throw Error("Связь: циклы запрещены");
    return p;
  }
  function migrate(raw) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray(raw.nodes) ||
      !Array.isArray(raw.links)
    )
      throw Error("Неверный JSON проекта");
    const p = clone(raw);
    if (p.meta?.app && p.meta.app !== APP)
      throw Error("Файл другого приложения");
    const version = p.meta?.version ?? 31;
    if (![31, VERSION].includes(version))
      throw Error("Версия " + version + " не поддерживается");
    if (version === VERSION) return validate(terminalShields(p));
    p.meta = { app: APP, version: VERSION, name: p.meta?.name || "Импорт v31" };
    p.settings = { voltageLN: 220, frequency: 50, powerFactor: 1 };
    p.view = p.view ?? { panX: 0, panY: 0, zoom: 1 };
    p.view.zoom = Math.min(2.5, Math.max(0.01, p.view.zoom));
    for (const n of p.nodes) {
      delete n.computed;
      n.phases = n.inputs?.[0]?.phases ?? n.outputs?.[0]?.phases;
      n.shield =
        n.category === "input" && /щит/i.test(n.templateName || n.name);
      n.mainBreaker =
        n.category === "distributor" || n.shield
          ? breaker(
              n.inputs?.[0]?.nominalA ?? n.outputs?.[0]?.nominalA,
              n.phases,
            )
          : null;
      n.consumerWatts = n.consumerWatts ?? 0;
      for (const v of [...(n.inputs || []), ...(n.outputs || [])]) {
        v.phase =
          v.phases === 1 && v.kind === "out" && n.phases === 3
            ? (v.label?.match(/L[123]/i)?.[0].toUpperCase() ??
              PHASES[n.outputs.indexOf(v) % 3])
            : null;
        v.breaker =
          v.kind === "out" && (n.category === "distributor" || n.shield)
            ? breaker(v.nominalA, v.phases)
            : null;
      }
    }
    for (const n of p.nodes)
      n.supplyA =
        n.inputs?.[0]?.nominalA ??
        Math.max(...(n.outputs || []).map((v) => v.nominalA));
    for (const l of p.links) delete l.phase;
    return validate(terminalShields(p));
  }
  const sum = (v) => PHASES.reduce((s, k) => s + v[k], 0),
    add = (a, b) => {
      for (const k of PHASES) a[k] += b[k];
    },
    closed = (b) => !b || b.state === "closed";
  function calculate(p) {
    const ix = indexes(p),
      computed = new Map(),
      portLoads = new Map(),
      indeg = new Map(p.nodes.map((n) => [n.id, 0])),
      q = [],
      order = [];
    for (const l of p.links)
      indeg.set(l.to.nodeId, (indeg.get(l.to.nodeId) || 0) + 1);
    for (const [id, v] of indeg) if (!v) q.push(id);
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      order.push(id);
      for (const l of ix.outgoing.get(id) || []) {
        indeg.set(l.to.nodeId, indeg.get(l.to.nodeId) - 1);
        if (!indeg.get(l.to.nodeId)) q.push(l.to.nodeId);
      }
    }
    if (order.length !== p.nodes.length)
      throw Error("Расчёт остановлен: цикл в схеме");
    const activeInputs = new Map();
    const feeds = new Map();
    for (const link of p.links) feeds.set(link.to.portId, link);
    for (const id of order) {
      const n = ix.nodes.get(id),
        candidates = n.inputs.map(input => feeds.get(input.id)).filter(Boolean),
        l = candidates.find(link => computed.get(link.from.nodeId).powered &&
          closed(ix.ports.get(link.from.portId).port.breaker) &&
          closed(ix.ports.get(link.to.portId).port.breaker)) || candidates[0];
      if (l) activeInputs.set(id, l);
      let phase = n.phases === 1 ? "L1" : null,
        connected = n.category === "input",
        powered = connected && closed(n.mainBreaker),
        pathOpen = false;
      if (l) {
        const parent = ix.nodes.get(l.from.nodeId),
          pc = computed.get(parent.id),
          o = parent.outputs.find((v) => v.id === l.from.portId);
        phase =
          n.phases === 1 ? (parent.phases === 3 ? o.phase : pc.inPhase) : null;
        connected = pc.connected;
        pathOpen =
          pc.pathOpen || !closed(parent.mainBreaker) || !closed(o.breaker);
        powered = pc.powered && closed(o.breaker) && closed(ix.ports.get(l.to.portId).port.breaker) && closed(n.mainBreaker);
      }
      if (!l && n.category !== "input") powered = false;
      computed.set(id, {
        inPhase: phase,
        connected,
        powered,
        pathOpen: pathOpen || !closed(n.mainBreaker),
        loadW: zero(),
        loadA: zero(),
        demandW: zero(),
        demandA: zero(),
        overload: false,
        phaseImbalance: false,
        breakers: [],
        status: powered
          ? "Под питанием"
          : connected
            ? "Отключено автоматом"
            : "Нет источника",
      });
    }
    for (const id of order.slice().reverse()) {
      const n = ix.nodes.get(id),
        c = computed.get(id);
      if (n.category === "consumer") {
        if (n.phases === 3)
          for (const k of PHASES) c.demandW[k] = n.consumerWatts / 3;
        else c.demandW[c.inPhase || "L1"] = n.consumerWatts;
      }
      for (const l of (ix.outgoing.get(id) || []).filter(link => activeInputs.get(link.to.nodeId) === link))
        add(c.demandW, computed.get(l.to.nodeId).demandW);
      if (n.category === "consumer" && c.powered) add(c.loadW, c.demandW);
      for (const l of (ix.outgoing.get(id) || []).filter(link => activeInputs.get(link.to.nodeId) === link))
        add(c.loadW, computed.get(l.to.nodeId).loadW);
      for (const k of PHASES) {
        c.loadA[k] = c.loadW[k] / p.settings.voltageLN;
        c.demandA[k] = c.demandW[k] / p.settings.voltageLN;
      }
      {
        const mx =
          n.phases === 3
            ? Math.max(...Object.values(c.loadA))
            : c.loadA[c.inPhase || "L1"];
        const active = activeInputs.get(id);
        const inlet = active ? ix.ports.get(active.to.portId).port : n.inputs[0];
        c.overload = mx > (inlet?.nominalA ?? n.supplyA) + 1e-8;
      }
      for (const o of n.outputs) {
        const l = (ix.outgoing.get(id) || []).find(
            (l) => l.from.portId === o.id,
          ),
          cc = l && activeInputs.get(l.to.nodeId) === l ? computed.get(l.to.nodeId) : null;
        const demandW = cc ? clone(cc.demandW) : zero(),
          loadW = cc ? clone(cc.loadW) : zero();
        const v = {
          demandW,
          loadW,
          demandA: zero(),
          loadA: zero(),
          overload: false,
        };
        for (const k of PHASES) {
          v.demandA[k] = demandW[k] / p.settings.voltageLN;
          v.loadA[k] = loadW[k] / p.settings.voltageLN;
        }
        const mx = Math.max(...Object.values(v.loadA));
        v.overload = mx > o.nominalA + 1e-8;
        c.overload ||= v.overload;
        portLoads.set(o.id, v);
        if (o.breaker)
          c.breakers.push({
            portId: o.id,
            breaker: o.breaker,
            overload: mx > o.breaker.ratingA + 1e-8,
            demandOverload:
              Math.max(...Object.values(v.demandA)) > o.breaker.ratingA + 1e-8,
          });
      }
      if (n.mainBreaker)
        c.breakers.unshift({
          portId: null,
          breaker: n.mainBreaker,
          overload:
            Math.max(...Object.values(c.loadA)) > n.mainBreaker.ratingA + 1e-8,
          demandOverload:
            Math.max(...Object.values(c.demandA)) >
            n.mainBreaker.ratingA + 1e-8,
        });
      c.overload ||= c.breakers.some((b) => b.overload);
      const vals = Object.values(c.demandA),
        mx = Math.max(...vals),
        avg = vals.reduce((a, b) => a + b, 0) / 3;
      c.phaseImbalance =
        n.phases === 3 &&
        mx > 0.05 &&
        (Math.min(...vals) < 1e-8 || mx / Math.min(...vals) >= 1.5);
      c.imbalancePercent = avg
        ? (Math.max(...vals.map((v) => Math.abs(v - avg))) / avg) * 100
        : 0;
    }
    for (const id of order) {
      const c = computed.get(id);
      const n = ix.nodes.get(id);
      const link = activeInputs.get(id);
      const upstream = link && computed.get(link.from.nodeId);
      const inlet = link && ix.ports.get(link.to.portId).port;
      const out = link && ix.ports.get(link.from.portId).port;
      let currentLimit = Math.min(upstream?.currentLimit ?? Infinity,
        inlet?.nominalA ?? n.supplyA, out?.nominalA ?? Infinity,
        inlet?.breaker?.ratingA ?? Infinity, out?.breaker?.ratingA ?? Infinity,
        n.mainBreaker?.ratingA ?? Infinity);
      const voltages = upstream ? {...upstream.phaseVoltage} :
        Object.fromEntries(PHASES.map(phase => [phase, p.settings.voltageLN]));
      if (p.settings.advancedMode && c.powered && link?.cable?.lengthM > 0) {
        const cable = cableParameters(link, out, inlet);
        const estimate = cableEstimate(cable, out.phases, portLoads.get(out.id).loadA);
        if (estimate) {
          const sendingVoltage = upstream.voltageLN * (estimate.lineVoltage ? Math.sqrt(3) : 1);
          const dropLimitA = estimate.dropV > 0
            ? estimate.current * sendingVoltage * cable.maxDropPercent / (100 * estimate.dropV)
            : Infinity;
          currentLimit = Math.min(currentLimit, cable.ampacityA, dropLimitA);
          for (const phase of out.phases === 3 ? PHASES : [c.inPhase || "L1"]) {
            const drop = out.phases === 3 ? estimate.phaseDropV[phase] : estimate.dropV;
            voltages[phase] = Math.max(0, voltages[phase] - drop);
          }
        }
      }
      c.phaseVoltage = voltages;
      c.voltageLN = n.phases === 3 ? Math.min(...Object.values(voltages)) : voltages[c.inPhase || "L1"];
      c.currentLimit = currentLimit;
      c.availableWatts = c.powered ? currentLimit * c.voltageLN * n.phases : 0;
      c.voltagePowerDeficit = !!p.settings.advancedMode && c.powered &&
        c.voltageLN < p.settings.voltageLN - 1e-8 && sum(c.loadW) > c.availableWatts + 1e-8;
    }
    return {
      nodes: computed,
      ports: portLoads,
      activeInputs,
      voltageLN: p.settings.voltageLN,
      voltageLL: p.settings.voltageLN * Math.sqrt(3),
    };
  }
  function tripTimeRange(curve, currentA) {
    if (!Number.isFinite(currentA) || currentA <= 0 || !Array.isArray(curve) || curve.length < 2 || curve.length > 100) return null;
    if (curve.some((point, index) => !Array.isArray(point) || point.length !== 3 ||
      point.some(value => !Number.isFinite(value) || value <= 0) || point[1] > point[2] ||
      (index && point[0] <= curve[index - 1][0]))) return null;
    for (let i = 1; i < curve.length; i++) {
      const [low, high] = [curve[i - 1], curve[i]];
      if (currentA < low[0] || currentA > high[0]) continue;
      const ratio = Math.log(currentA / low[0]) / Math.log(high[0] / low[0]);
      return [1, 2].map(index => low[index] * (high[index] / low[index]) ** ratio);
    }
    return null;
  }

  function protectionScenario(config, voltageLN) {
    const faultA = config.earthing !== "IT" && Number.isFinite(config.loopOhm) && config.loopOhm > 0
      ? voltageLN / config.loopOhm : null;
    const currentA = config.startA || faultA;
    const downstream = tripTimeRange(config.curve, currentA);
    const upstream = tripTimeRange(config.upstreamCurve, currentA);
    const thermal = downstream && config.startSeconds > 0 && config.coolingSeconds > 0
      ? downstream.map(time => {
          let dose = 0;
          const retention = Math.exp(-(config.pauseSeconds || 0) / config.coolingSeconds);
          for (let i = 0; i < Math.min(1000, Math.max(1, Math.trunc(config.starts) || 1)); i++) {
            dose = dose * retention + config.startSeconds / time;
          }
          return dose;
        })
      : null;
    return {
      faultA, downstream, upstream, thermal,
      separatedBands: downstream && upstream ? downstream[1] < upstream[0] : null,
      rcdThresholdReached: config.residualMa >= 0 && config.rcdMa > 0 ? config.residualMa >= config.rcdMa : null,
      ttTouchV: config.earthing === "TT" && config.earthOhm > 0 && config.rcdMa > 0
        ? config.earthOhm * config.rcdMa / 1000 : null,
      disconnectionWithinTarget: config.measuredTripSeconds > 0 && config.targetSeconds > 0
        ? config.measuredTripSeconds <= config.targetSeconds : null,
    };
  }

  const CABLE_SECTIONS = Object.freeze({6:2.5, 10:2.5, 16:4, 32:10, 63:25, 125:50, 250:120});
  let cableSections = CABLE_SECTIONS;
  function setCableSections(values) {
    cableSections = Object.fromEntries(Object.entries(CABLE_SECTIONS).map(([rating, fallback]) => {
      const section = values?.[rating];
      return [rating, Number.isFinite(section) && section > 0 && section <= 1000 ? section : fallback];
    }));
  }
  function cableParameters(link, output, input) {
    const ampacityA = Math.min(output.nominalA, input.nominalA);
    return {material:"cu", sectionMm2:cableSections[ampacityA], ampacityA, ambientC:20, maxDropPercent:5, ...link.cable};
  }

  function cableEstimate(cable, phaseCount, currents) {
    const { lengthM, sectionMm2, material, ampacityA } = cable;
    if (!(lengthM > 0 && sectionMm2 > 0 && ampacityA > 0)) return null;
    const resistance = (material === "al" ? 37.6 : 23.7) * lengthM / (1000 * sectionMm2);
    const values = PHASES.map(phase => currents[phase] || 0);
    const current = Math.max(...values);
    const balanced = current - Math.min(...values) < 1e-6;
    const total = values.reduce((sum, value) => sum + value, 0);
    const squares = values.reduce((sum, value) => sum + value ** 2, 0);
    const neutralSquared = Math.max(0, (3 * squares - total ** 2) / 2);
    const phaseDropV = Object.fromEntries(PHASES.map((phase, i) => [
      phase, resistance * (2 * values[i] - (total - values[i]) / 2),
    ]));
    const dropV = phaseCount === 1 ? 2 * current * resistance
      : balanced ? Math.sqrt(3) * current * resistance : Math.max(...Object.values(phaseDropV));
    const lossW = resistance * (squares + neutralSquared);
    return { dropV, lossW, phaseDropV, lineVoltage: phaseCount === 3 && balanced,
      resistance, current, exceedsAmpacity: current > ampacityA };
  }
  function cableWarnings(cable, estimate, output, input, voltageLN) {
    if (!estimate) return [];
    const warnings = [];
    const voltage = voltageLN * (estimate.lineVoltage ? Math.sqrt(3) : 1);
    const dropLimit = voltage * cable.maxDropPercent / 100;
    if (estimate.dropV > dropLimit) {
      const maxLength = cable.lengthM * dropLimit / estimate.dropV;
      warnings.push("Падение напряжения " + (100 * estimate.dropV / voltage).toFixed(2) +
        "% выше предела " + cable.maxDropPercent + "%. При текущей нагрузке допустимая длина участка около " +
        maxLength.toFixed(1) + " м.");
    }
    const nominalA = Math.min(output.nominalA,input.nominalA);
    const currentLimit = Math.min(cable.ampacityA, nominalA);
    if (estimate.current > currentLimit)
      warnings.push("Ток " + estimate.current.toFixed(1) + " А выше допустимых " + currentLimit + " А для линии.");
    const nominalW = nominalA * output.phases * voltageLN;
    if (estimate.lossW > nominalW)
      warnings.push("Потери " + estimate.lossW.toFixed(0) + " Вт выше номинальной мощности линии " + nominalW.toFixed(0) + " Вт.");
    if (warnings.length) warnings.push("Увеличьте сечение, снизьте нагрузку или сократите длину линии. При превышении номинала разъёмов снизьте нагрузку или замените разъёмы.");
    return warnings;
  }
  function selectedBranch(p, selected) {
    const ids = [...selected];
    if (!p.settings.highlightBranch || ids.length !== 2) return {nodes:new Set(),links:new Set()};
    const outgoing = new Map();
    for (const l of p.links) { if(!outgoing.has(l.from.nodeId)) outgoing.set(l.from.nodeId,[]); outgoing.get(l.from.nodeId).push(l); }
    const find = (start,end) => {
      const parents=new Map([[start,null]]), queue=[start];
      for(let i=0;i<queue.length;i++) {
        const id=queue[i];
        if(id===end) {
          const nodes=new Set([end]),links=new Set();let at=end;
          while(parents.get(at)) { const edge=parents.get(at); links.add(edge.id);at=edge.from.nodeId;nodes.add(at); }
          return {nodes,links};
        }
        for(const l of outgoing.get(id)||[]) if(!parents.has(l.to.nodeId)) { parents.set(l.to.nodeId,l);queue.push(l.to.nodeId); }
      }
      return null;
    };
    return find(ids[0],ids[1]) || find(ids[1],ids[0]) || {nodes:new Set(),links:new Set()};
  }
  function overloadOrigins(p, calc = calculate(p)) {
    const children = new Map();
    for (const l of p.links) { if (!children.has(l.from.nodeId)) children.set(l.from.nodeId, []); children.get(l.from.nodeId).push(l.to.nodeId); }
    const bad = new Set(p.nodes.filter(n => calc.nodes.get(n.id)?.overload && calc.nodes.get(n.id)?.powered).map(n => n.id));
    const downstream = (id, seen = new Set()) => { if(seen.has(id)) return false; seen.add(id); return (children.get(id) || []).some(child => bad.has(child) || downstream(child, seen)); };
    return p.nodes.filter(n => bad.has(n.id) && !downstream(n.id)).map(n => {
      const c = calc.nodes.get(n.id), phases = new Set();
      const check = (values, limit) => { for (const phase of PHASES) if ((values?.[phase] || 0) > limit + 1e-8) phases.add(phase); };
      const active = calc.activeInputs.get(n.id);
      const inlet = active ? n.inputs.find(port => port.id === active.to.portId) : n.inputs[0];
      if (inlet) check(c.loadA, inlet.nominalA);
      if(n.mainBreaker) check(c.loadA, n.mainBreaker.ratingA);
      for (const out of n.outputs) check(calc.ports.get(out.id)?.loadA, Math.min(out.nominalA, out.breaker?.ratingA ?? Infinity));
      return {nodeId:n.id, phases:[...phases]};
    });
  }
  function tripOverloads(p) {
    const r = calculate(p),
      trips = [];
    for (const n of p.nodes)
      for (const b of r.nodes.get(n.id).breakers)
        if (b.breaker.state === "closed" && b.overload) {
          b.breaker.state = "tripped";
          trips.push({ nodeId: n.id, portId: b.portId });
        }
    return trips;
  }
  function rect(n) {
    return {
      left: n.pos.x - nodeWidth(n)/2,
      right: n.pos.x + nodeWidth(n)/2,
      top: n.pos.y - nodeHeight(n) / 2,
      bottom: n.pos.y + nodeHeight(n) / 2,
    };
  }
  function portBodyWidth(n,v){
    if(v.connType.startsWith("terminal"))return v.phases===3?148:128;
    const label=({powercon:"TRUE1"}[v.connType]||v.connType.toUpperCase())+" "+v.nominalA+"A";
    const phase=v.kind==="out"&&n.phases===3&&v.phases===1;
    return 43+(label.length*5.5+16)+(phase?6+23:0);
  }
  function nodeWidth(n){
    if(!n.inputs.length||!n.outputs.length)return 354;
    const input=Math.max(...n.inputs.map(v=>portBodyWidth(n,v)+38*(Number(!!v.breaker)+Number(!!n.mainBreaker))));
    const output=Math.max(...n.outputs.map(v=>portBodyWidth(n,v)+(v.breaker?38:0)));
    return Math.max(354,Math.ceil((input+output+60)/20)*20);
  }
  function nodeHeight(n) {
    return (
      (n.category === "consumer" ? 180 : 132) +
      Math.max(1, n.inputs.length, n.outputs.length) * 44 +
      80
    );
  }
  function overlaps(a, b, gap = 16) {
    return (
      a.left < b.right + gap &&
      a.right > b.left - gap &&
      a.top < b.bottom + gap &&
      a.bottom > b.top - gap
    );
  }
  function placeNode(p, n) {
    const original = { ...n.pos };
    for (let ring = 0; ring < 100; ring++) {
      for (let col = 0; col <= ring; col++) {
        n.pos = {
          x: original.x + col * 440,
          y: original.y + (ring - col) * (nodeHeight(n) + 64),
        };
        if (
          !p.nodes.some(
            (other) => other.id !== n.id && overlaps(rect(n), rect(other)),
          )
        )
          return n.pos;
      }
    }
    throw Error("Не удалось найти свободное место");
  }
  function moveGroup(p, ids, dx, dy) {
    const selected = new Set(ids),
      moving = p.nodes.filter((n) => selected.has(n.id)),
      other = p.nodes.filter((n) => !selected.has(n.id));
    const positions = moving.map((n) => ({
      ...n,
      pos: { x: n.pos.x + dx, y: n.pos.y + dy },
    }));
    if (
      positions.some((n) => other.some((o) => overlaps(rect(n), rect(o), 16)))
    )
      return false;
    moving.forEach((n, i) => (n.pos = positions[i].pos));
    return true;
  }
  function slideGroup(p, ids, dx, dy, gap = 16, barriers = []) {
    const selected = new Set(ids),
      moving = p.nodes.filter((n) => selected.has(n.id)),
      fixed = [
        ...p.nodes.filter((n) => !selected.has(n.id)).map(rect),
        ...barriers,
      ];
    const attempt = (order) => {
      let tx = 0,
        ty = 0;
      for (const axis of order) {
        let delta = axis === "x" ? dx : dy;
        for (const n of moving) {
          const r = rect({ ...n, pos: { x: n.pos.x + tx, y: n.pos.y + ty } });
          for (const o of fixed) {
            const b = o;
            if (axis === "x") {
              if (r.bottom <= b.top - gap || r.top >= b.bottom + gap) continue;
              if (delta > 0 && r.right <= b.left - gap + 1e-6)
                delta = Math.min(delta, Math.max(0, b.left - gap - r.right));
              if (delta < 0 && r.left >= b.right + gap - 1e-6)
                delta = Math.max(delta, Math.min(0, b.right + gap - r.left));
            } else {
              if (r.right <= b.left - gap || r.left >= b.right + gap) continue;
              if (delta > 0 && r.bottom <= b.top - gap + 1e-6)
                delta = Math.min(delta, Math.max(0, b.top - gap - r.bottom));
              if (delta < 0 && r.top >= b.bottom + gap - 1e-6)
                delta = Math.max(delta, Math.min(0, b.bottom + gap - r.top));
            }
          }
        }
        if (axis === "x") tx = delta;
        else ty = delta;
      }
      return { x: tx, y: ty };
    };
    const a = attempt(["x", "y"]),
      b = attempt(["y", "x"]),
      best =
        Math.hypot(dx - a.x, dy - a.y) <= Math.hypot(dx - b.x, dy - b.y)
          ? a
          : b;
    for (const n of moving) {
      n.pos.x += best.x;
      n.pos.y += best.y;
    }
    return best;
  }
  function portPosition(n, v) {
    const r = rect(n),
      ports = v.kind === "in" ? n.inputs : n.outputs,
      i = ports.findIndex((p) => p.id === v.id);
    return {
      x:
        v.kind === "in"
          ? r.left + (v.connType.startsWith("terminal") ? 20 : 38)
          : r.right - (v.connType.startsWith("terminal") ? 20 : 38),
      y: r.top + (n.category === "consumer" ? 180 : 132) + i * 44,
    };
  }
  function routeWire(p, l, reserved = []) {
    const router =
      typeof module === "object" && module.exports
        ? require("./routing.js")
        : globalThis.ElectricRouting;
    return router.routeOne(p, l, reserved);
  }
  function catalog() {
    const rows = [];
    const add = (
      name,
      category,
      phases,
      inConnType,
      inA,
      outputs,
      watts = 0,
      shield = false,
    ) =>
      rows.push({
        id: "tpl" + rows.length,
        name,
        category,
        phases,
        inConnType,
        inA,
        outputs,
        watts,
        shield,
        mainA: inA,
      });
    for (const a of [250, 125, 63, 32, 16]) {
      const conn = "cee3";
      add(
        "Щит 3ф " + a + " А",
        "input",
        3,
        conn,
        a,
        [{ connType: conn, nominalA: a }],
        0,
        true,
      );
    }
    for (const [conn, c] of Object.entries(CONNECTORS))
      for (const a of c.ratings)
        add(c.name + " " + a + " А", "input", c.phases, conn, a, [
          { connType: conn, nominalA: a },
        ]);
    for (const a of [16, 32, 63])
      add(
        "Щит 1ф " + a + " А",
        "input",
        1,
        "cee1",
        a,
        [{ connType: "cee1", nominalA: a }],
        0,
        true,
      );
    add(
      "Щит 3ф 63 А → 6×Schuko 16 А",
      "input",
      3,
      "cee3",
      63,
      Array.from({ length: 6 }, (_, i) => ({
        connType: "euro",
        nominalA: 16,
        phase: PHASES[Math.floor(i / 2)],
      })),
      0,
      true,
    );
    for (const [a, b] of [
      [250, 125],
      [125, 63],
      [63, 32],
      [32, 16],
    ])
      add(
        "Дистро " + a + " → 2×" + b + " А",
        "distributor",
        3,
        "cee3",
        a,
        Array.from({ length: 2 }, () => ({ connType: "cee3", nominalA: b })),
      );
    for (const [a, count, conn] of [
      [32, 6, "euro"],
      [32, 6, "cee1"],
      [16, 3, "euro"],
    ])
      add(
        "Дистро " + a + " А → " + count + "×" + CONNECTORS[conn].name,
        "distributor",
        3,
        "cee3",
        a,
        Array.from({ length: count }, (_, i) => ({
          connType: conn,
          nominalA: 16,
          phase: PHASES[Math.floor(i / (count / 3))],
        })),
      );
    for (const conn of ["euro", "cee1", "powercon"])
      add(
        "Удлинитель " + CONNECTORS[conn].name + " → 5×Schuko",
        "extender",
        1,
        conn,
        16,
        Array.from({ length: 5 }, () => ({ connType: "euro", nominalA: 16 })),
      );
    for (const conn of ["euro", "cee1", "powercon"])
      for (const w of [1000, 2000, 3000, 3500])
        add(
          CONNECTORS[conn].name + " " + w + " Вт",
          "consumer",
          1,
          conn,
          16,
          [],
          w,
        );
    for (const a of [16, 32, 63])
      add(
        "Потребитель CEE 3ф " + a + " А · 3500 Вт",
        "consumer",
        3,
        "cee3",
        a,
        [],
        3500,
      );
    // Add missing nominal variants without removing existing catalogue templates.
    for (const [key, c] of Object.entries(CONNECTORS)) {
      if (["euro", "cee1", "cee3", "terminal1", "terminal3"].includes(key))
        for (const rating of c.ratings) {
          if (
            !rows.some(
              (t) =>
                t.category === "input" &&
                t.shield &&
                t.outputs.length === 1 &&
                t.outputs[0].connType === key &&
                t.inA === rating,
            )
          )
            add(
              `Щит ${c.phases}ф ${rating} А · ${c.name}`,
              "input",
              c.phases,
              key,
              rating,
              [{ connType: key, nominalA: rating }],
              0,
              true,
            );
        }
      for (const rating of c.ratings)
        for (const watts of c.phases === 3
          ? [3500, 10000]
          : [1000, 2000, 3000, 3500])
          if (
            !rows.some(
              (t) =>
                t.category === "consumer" &&
                t.inConnType === key &&
                t.inA === rating &&
                t.watts === watts,
            )
          )
            add(
              `${c.name} ${rating} А · ${watts} Вт`,
              "consumer",
              c.phases,
              key,
              rating,
              [],
              watts,
            );
    }
    for (const phases of [1, 3])
      for (const rating of CONNECTORS[phases === 3 ? "terminal3" : "terminal1"]
        .ratings) {
        const input = phases === 3 ? "terminal3" : "terminal1",
          cee = phases === 3 ? "cee3" : "cee1";
        const outs = [
          ...(CONNECTORS[cee].ratings.includes(rating) ? [cee] : []),
          ...(phases === 1 && rating <= 16 ? ["euro"] : []),
          ...(phases === 1 && rating === 16 ? ["powercon"] : []),
        ];
        for (const conn of outs) {
          add(
            `Голые концы ${phases}ф ${rating} А → ${CONNECTORS[conn].name}`,
            "extender",
            phases,
            input,
            rating,
            [{ connType: conn, nominalA: conn === "euro" ? 16 : rating }],
          );
          rows.at(-1).transition = true;
        }
        if (phases === 3 && rating === 16)
          for (const phase of PHASES) {
            add(
              `Голые концы 3ф 16 А → Schuko · ${phase}`,
              "extender",
              3,
              input,
              16,
              [{ connType: "euro", nominalA: 16, phase }],
            );
            rows.at(-1).transition = true;
          }
      }
    add("Дистро 125 А → CEE 63 А, 2 × CEE 32 А, 15 × CEE 16 А, 9 × SHUKO 16 А",
      "distributor", 3, "cee3", 125, [
        ...[63, 32, 32].map(nominalA => ({connType:"cee3", nominalA})),
        ...Array.from({length:15}, (_, i) => ({
          connType:"cee1", nominalA:16, phase:PHASES[i % 3],
          breaker:breaker(i === 5 ? 15 : i === 14 ? 13 : 16),
        })),
        ...Array.from({length:9}, (_, i) => ({
          connType:"euro", nominalA:16, phase:PHASES[i % 3],
        })),
      ]);
    for (const row of rows) {
      row.catalogPath = catalogPath(row);
      catalogAliases.set(cleanLabel(row.name), row);
    }
    return rows.filter(
      (row) =>
        !(
          row.category === "input" &&
          !row.shield &&
          row.inConnType.startsWith("terminal")
        ) && !(row.category === "consumer" && row.inConnType === "powercon"),
    );
  }
  function catalogPath(t) {
    const phases =
      t.phases ?? t.inputs?.[0]?.phases ?? t.outputs?.[0]?.phases ?? 1;
    const conn =
      t.category === "input"
        ? (t.inConnType ??
          t.supplyConnType ??
          catalogAliases.get(cleanLabel(t.templateName))?.inConnType ??
          t.outputs?.[0]?.connType)
        : (t.inConnType ?? t.inputs?.[0]?.connType);
    const nominal =
      t.inA ?? t.supplyA ?? t.inputs?.[0]?.nominalA ?? t.outputs?.[0]?.nominalA;
    const phase = phases === 3 ? "Трёхфазные" : "Однофазные",
      family =
        conn === "euro"
          ? "Shuko"
          : conn?.startsWith("cee")
            ? "CEE"
            : conn === "powercon"
              ? "Powercon"
              : conn?.startsWith("terminal")
                ? "Клеммные"
                : "Другие";
    let path;
    if (t.category === "input") {
      if (t.shield || conn?.startsWith("terminal"))
        path = [
          "Вводы",
          "Щиты",
          conn?.startsWith("terminal")
            ? "С автоматом (клеммный ввод)"
            : "С розеткой",
          phase,
          ...(phases === 1 && !conn?.startsWith("terminal") ? [family] : []),
        ];
      else
        path = ["Вводы", "Розетки", phase, ...(phases === 1 ? [family] : [])];
    } else if (t.category === "distributor") path = ["Дистрибьюторы", phase];
    else if (t.category === "consumer") path = ["Потребители", phase, family];
    else if (t.transition || conn?.startsWith("terminal"))
      path = ["Переходные коробки и кабели", phase, family];
    else
      path = [
        "Удлинители",
        conn === "cee1"
          ? "CEE → SHUKO ×5"
          : conn === "euro"
            ? "SHUKO → SHUKO ×5"
            : conn === "powercon"
              ? "Powercon → SHUKO ×5"
              : family,
      ];
    return [...path, `${nominal} А`];
  }
  return {
    VERSION,
    APP,
    PHASES,
    CONNECTORS,
    connectorLabel,
    nomenclature,
    obsoleteCable,
    catalogTemplate,
    uid,
    clone,
    zero,
    sum,
    breaker,
    port,
    project,
    makeNode,
    validate,
    migrate,
    compatible,
    canConnect,
    connect,
    calculate,
    tripOverloads,
    overloadOrigins,
    selectedBranch,
    cableEstimate,
    cableParameters,
    CABLE_SECTIONS,
    setCableSections,
    cableWarnings,
    protectionScenario,
    indexes,
    nodeHeight,
    nodeWidth,
    portBodyWidth,
    rect,
    overlaps,
    placeNode,
    moveGroup,
    slideGroup,
    portPosition,
    routeWire,
    catalog,
    catalogPath,
  };
});

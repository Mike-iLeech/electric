(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./engine.js")
      : root.ElectricEngine,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectricRouting = api;
})(globalThis, function (E) {
  "use strict";
  const STEP = 12,
    CLEAR = 10,
    LEAD = 24,
    EPS = 1e-6;
  function clean(points) {
    const out = [];
    for (const v of points) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return [];
      const b = out.at(-1);
      if (b && b.x === v.x && b.y === v.y) continue;
      while (out.length >= 2) {
        const a = out.at(-2),
          b = out.at(-1);
        if ((a.x === b.x && b.x === v.x) || (a.y === b.y && b.y === v.y))
          out.pop();
        else break;
      }
      if (!out.length || out.at(-1).x !== v.x || out.at(-1).y !== v.y)
        out.push({ x: v.x, y: v.y });
    }
    return out;
  }
  const segments = (path) =>
    path.slice(1).map((b, i) => ({ a: path[i], b, h: path[i].y === b.y }));
  function shared(a, b) {
    if (a.h !== b.h) return false;
    const distance = a.h ? Math.abs(a.a.y - b.a.y) : Math.abs(a.a.x - b.a.x),
      lo = a.h ? "x" : "y";
    return (
      distance < STEP - EPS &&
      Math.min(Math.max(a.a[lo], a.b[lo]), Math.max(b.a[lo], b.b[lo])) -
        Math.max(Math.min(a.a[lo], a.b[lo]), Math.min(b.a[lo], b.b[lo])) >
        EPS
    );
  }
  function pierces(a, b, r) {
    return a.y === b.y
      ? a.y > r.top + EPS &&
          a.y < r.bottom - EPS &&
          Math.max(a.x, b.x) > r.left + EPS &&
          Math.min(a.x, b.x) < r.right - EPS
      : a.x > r.left + EPS &&
          a.x < r.right - EPS &&
          Math.max(a.y, b.y) > r.top + EPS &&
          Math.min(a.y, b.y) < r.bottom - EPS;
  }
  function info(p, l) {
    const a = p.nodes.find((n) => n.id === l.from.nodeId),
      b = p.nodes.find((n) => n.id === l.to.nodeId),
      op = a?.outputs.find((v) => v.id === l.from.portId),
      ip = b?.inputs.find((v) => v.id === l.to.portId);
    if (!op || !ip) return null;
    const start = E.portPosition(a, op),
      end = E.portPosition(b, ip),
      ar = E.rect(a),
      br = E.rect(b);
    return {
      a,
      b,
      op,
      ip,
      start,
      end,
      ar,
      br,
      side: end.x > start.x ? "right" : "left",
      direction:
        end.y < start.y - STEP * 2
          ? "up"
          : end.y > start.y + STEP * 2
            ? "down"
            : "level",
    };
  }
  function valid(p, l, path, reserved = []) {
    if (path.length < 2) return false;
    const i = info(p, l);
    if (!i) return false;
    const ss = segments(path),
      old = reserved.flatMap(segments);
    if (
      path[0].x !== i.start.x ||
      path[0].y !== i.start.y ||
      path.at(-1).x !== i.end.x ||
      path.at(-1).y !== i.end.y ||
      !ss[0].h ||
      ss[0].b.x <= ss[0].a.x ||
      !ss.at(-1).h ||
      ss.at(-1).b.x <= ss.at(-1).a.x
    )
      return false;
    for (let k = 0; k < ss.length; k++) {
      const s = ss[k];
      if (s.a.x !== s.b.x && s.a.y !== s.b.y) return false;
      if (old.some((o) => shared(s, o))) return false;
      for (const n of p.nodes) {
        if (
          (k === 0 && n.id === i.a.id) ||
          (k === ss.length - 1 && n.id === i.b.id)
        )
          continue;
        const r = E.rect(n);
        if (
          pierces(s.a, s.b, {
            left: r.left - CLEAR,
            right: r.right + CLEAR,
            top: r.top - CLEAR,
            bottom: r.bottom + CLEAR,
          })
        )
          return false;
      }
    }
    // No self crossings, reversals, or doubled-back stubs.
    for (let a = 0; a < ss.length; a++)
      for (let b = a + 2; b < ss.length; b++) {
        if (ss[a].h === ss[b].h) {
          if (shared(ss[a], ss[b])) return false;
        } else {
          const h = ss[a].h ? ss[a] : ss[b],
            v = ss[a].h ? ss[b] : ss[a];
          if (
            v.a.x > Math.min(h.a.x, h.b.x) + EPS &&
            v.a.x < Math.max(h.a.x, h.b.x) - EPS &&
            h.a.y > Math.min(v.a.y, v.b.y) + EPS &&
            h.a.y < Math.max(v.a.y, v.b.y) - EPS
          )
            return false;
        }
      }
    return true;
  }
  function groupPlans(p) {
    const groups = new Map(),
      meta = new Map();
    for (const l of p.links) {
      const i = info(p, l);
      if (!i) continue;
      const key = [i.a.id, i.side, i.direction].join("/");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ l, i });
    }
    for (const rows of [...groups.values()]) {
      if (!rows.length || rows[0].i.direction === "level") continue;
      const dir = rows[0].i.direction;
      while (rows.length > 1) {
        const gap =
          dir === "up"
            ? Math.min(...rows.map((v) => v.i.start.y)) -
              Math.max(...rows.map((v) => v.i.end.y))
            : Math.min(...rows.map((v) => v.i.end.y)) -
              Math.max(...rows.map((v) => v.i.start.y));
        if (gap >= (rows.length - 1) * STEP + STEP * 2) break;
        const sorted = [...rows].sort((a, b) =>
            dir === "up" ? b.i.end.y - a.i.end.y : a.i.end.y - b.i.end.y,
          ),
          row = sorted[0];
        rows.splice(rows.indexOf(row), 1);
        row.i.direction = "level";
        const key = [row.i.a.id, row.i.side, "level"].join("/");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
    }
    for (const rows of groups.values()) {
      rows.sort(
        (a, b) =>
          a.i.a.outputs.indexOf(a.i.op) - b.i.a.outputs.indexOf(b.i.op) ||
          a.l.id.localeCompare(b.l.id),
      );
      const targets = [...rows].sort(
        (a, b) => a.i.end.y - b.i.end.y || a.i.b.id.localeCompare(b.i.b.id),
      );
      const minLeft = Math.min(...rows.map((v) => v.i.br.left)),
        maxRight = Math.max(...rows.map((v) => v.i.br.right));
      for (let rank = 0; rank < rows.length; rank++) {
        const { l, i } = rows[rank],
          targetRank = targets.findIndex((v) => v.l.id === l.id),
          n = rows.length;
        let y = i.start.y;
        if (n > 1) {
          if (i.direction === "up")
            y =
              Math.max(
                i.ar.top - LEAD - (n - 1) * STEP,
                Math.max(...rows.map((v) => v.i.end.y)) + STEP,
              ) +
              rank * STEP;
          else if (i.direction === "down")
            y =
              Math.max(
                Math.max(...rows.map((v) => v.i.start.y)) + STEP,
                Math.min(
                  i.ar.bottom + LEAD,
                  Math.min(...rows.map((v) => v.i.end.y)) -
                    STEP -
                    (n - 1) * STEP,
                ),
              ) +
              rank * STEP;
        }
        const exit =
          i.ar.right +
          LEAD +
          (i.direction === "down" ? n - 1 - rank : rank) * STEP;
        const trunk =
          i.side === "right"
            ? minLeft -
              LEAD -
              (i.direction === "down" ? targetRank : n - 1 - targetRank) * STEP
            : maxRight + LEAD + targetRank * STEP;
        const guide =
          i.side === "right"
            ? clean([
                i.start,
                { x: exit, y: i.start.y },
                { x: exit, y },
                { x: trunk, y },
                { x: trunk, y: i.end.y },
                i.end,
              ])
            : clean([
                i.start,
                { x: exit, y: i.start.y },
                {
                  x: exit,
                  y: Math.min(i.ar.top, i.br.top) - LEAD - rank * STEP,
                },
                {
                  x: i.br.left - LEAD - targetRank * STEP,
                  y: Math.min(i.ar.top, i.br.top) - LEAD - rank * STEP,
                },
                { x: i.br.left - LEAD - targetRank * STEP, y: i.end.y },
                i.end,
              ]);
        meta.set(l.id, {
          ...i,
          guide,
          rank,
          key: l.from.nodeId + "/" + i.side + "/" + i.direction,
        });
      }
    }
    return meta;
  }
  class Heap {
    constructor() {
      this.a = [];
    }
    push(v) {
      const a = this.a;
      a.push(v);
      let i = a.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (compare(a[p], v) <= 0) break;
        a[i] = a[p];
        i = p;
      }
      a[i] = v;
    }
    pop() {
      const a = this.a,
        first = a[0],
        v = a.pop();
      if (a.length) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
          let c = i * 2 + 1;
          if (c + 1 < a.length && compare(a[c + 1], a[c]) < 0) c++;
          if (compare(v, a[c]) <= 0) break;
          a[i] = a[c];
          i = c;
        }
        a[i] = v;
      }
      return first;
    }
    get length() {
      return this.a.length;
    }
  }
  function compare(a, b) {
    return a.f - b.f || a.turns - b.turns || a.h - b.h || a.serial - b.serial;
  }
  function fallback(p, l, reserved, guide, wideSearch = false) {
    const i = info(p, l);
    if (!i) return [];
    const old = reserved.flatMap(segments),
      obstacles = p.nodes.map((n) => {
        const r = E.rect(n);
        return {
          left: r.left - CLEAR,
          right: r.right + CLEAR,
          top: r.top - CLEAR,
          bottom: r.bottom + CLEAR,
        };
      });
    const s = { x: i.ar.right + CLEAR + 2, y: i.start.y },
      t = { x: i.br.left - CLEAR - 2, y: i.end.y };
    const margin = wideSearch ? 640 : 200;
    const corridor = {
      left: Math.min(s.x, t.x) - margin,
      right: Math.max(s.x, t.x) + margin,
      top: Math.min(s.y, t.y) - margin,
      bottom: Math.max(s.y, t.y) + margin,
    };
    const relevant = obstacles
      .filter(
        (r) =>
          r.right >= corridor.left &&
          r.left <= corridor.right &&
          r.bottom >= corridor.top &&
          r.top <= corridor.bottom,
      )
      .slice(0, wideSearch ? 112 : 64);
    const xs = new Set([
        s.x,
        t.x,
        ...guide.map((v) => v.x),
        ...relevant.flatMap((r) => [r.left - 2, r.right + 2]),
      ]),
      ys = new Set([
        s.y,
        t.y,
        ...guide.map((v) => v.y),
        ...relevant.flatMap((r) => [r.top - 2, r.bottom + 2]),
      ]);
    for (const o of old) {
      if (o.h && o.a.y >= corridor.top && o.a.y <= corridor.bottom) {
        ys.add(o.a.y - STEP);
        ys.add(o.a.y + STEP);
      }
      if (!o.h && o.a.x >= corridor.left && o.a.x <= corridor.right) {
        xs.add(o.a.x - STEP);
        xs.add(o.a.x + STEP);
      }
    }
    const xx = [...xs].sort((a, b) => a - b),
      yy = [...ys].sort((a, b) => a - b);
    if (xx.length * yy.length > (wideSearch ? 80000 : 40000)) return [];
    const key = (x, y) => x + "," + y;
    const vertices = new Map();
    for (let xi = 0; xi < xx.length; xi++)
      for (let yi = 0; yi < yy.length; yi++) {
        const v = { x: xx[xi], y: yy[yi], xi, yi };
        if (
          !obstacles.some(
            (r) =>
              v.x > r.left && v.x < r.right && v.y > r.top && v.y < r.bottom,
          )
        )
          vertices.set(key(v.x, v.y), v);
      }
    const sk = key(s.x, s.y),
      tk = key(t.x, t.y);
    if (!vertices.has(sk) || !vertices.has(tk)) return [];
    const q = new Heap(),
      costs = new Map(),
      prev = new Map();
    let serial = 0;
    const startKey = sk + "|h";
    costs.set(startKey, 0);
    q.push({
      key: startKey,
      v: sk,
      dir: "h",
      g: 0,
      f: Math.abs(s.x - t.x) + Math.abs(s.y - t.y),
      turns: 0,
      h: 0,
      serial: serial++,
    });
    let visits = 0;
    while (q.length && visits++ < (wideSearch ? 120000 : 60000)) {
      const cur = q.pop();
      if (cur.g !== costs.get(cur.key)) continue;
      if (cur.v === tk) {
        let path = [],
          k = cur.key;
        while (k) {
          const vertex = k.slice(0, k.lastIndexOf("|"));
          path.unshift(vertices.get(vertex));
          k = prev.get(k);
        }
        const result = clean([i.start, ...path, i.end]);
        if (valid(p, l, result, reserved)) return result;
        continue;
      }
      const v = vertices.get(cur.v);
      for (const [xi, yi, dir] of [
        [v.xi + 1, v.yi, "h"],
        [v.xi - 1, v.yi, "h"],
        [v.xi, v.yi + 1, "v"],
        [v.xi, v.yi - 1, "v"],
      ]) {
        if (xi < 0 || yi < 0 || xi >= xx.length || yi >= yy.length) continue;
        const nk = key(xx[xi], yy[yi]),
          nv = vertices.get(nk);
        if (!nv) continue;
        const seg = { a: v, b: nv, h: dir === "h" };
        if (
          obstacles.some((r) => pierces(v, nv, r)) ||
          old.some((o) => shared(seg, o))
        )
          continue;
        const length = Math.abs(v.x - nv.x) + Math.abs(v.y - nv.y),
          turn = cur.dir !== dir;
        let cross = 0,
          near = 0;
        for (const o of old) {
          if (o.h !== seg.h) {
            const h = o.h ? o : seg,
              vert = o.h ? seg : o;
            if (
              vert.a.x > Math.min(h.a.x, h.b.x) &&
              vert.a.x < Math.max(h.a.x, h.b.x) &&
              h.a.y > Math.min(vert.a.y, vert.b.y) &&
              h.a.y < Math.max(vert.a.y, vert.b.y)
            )
              cross++;
          } else if (
            seg.h
              ? Math.abs(seg.a.y - o.a.y) === STEP
              : Math.abs(seg.a.x - o.a.x) === STEP
          )
            near = 1;
        }
        // Length + explicit bend/crossing costs. A small reward keeps neighbouring lanes together.
        const g =
            cur.g + length * (near ? 0.94 : 1) + (turn ? 60 : 0) + cross * 80,
          k = nk + "|" + dir;
        if (g >= (costs.get(k) ?? Infinity)) continue;
        costs.set(k, g);
        prev.set(k, cur.key);
        const h = 0.9 * (Math.abs(nv.x - t.x) + Math.abs(nv.y - t.y));
        q.push({
          key: k,
          v: nk,
          dir,
          g,
          f: g + h,
          turns: cur.turns + Number(turn),
          h,
          serial: serial++,
        });
      }
    }
    return [];
  }
  function routeOne(p, l, reserved = [], guide = null) {
    if (l.manualRoute && valid(p, l, l.manualRoute, reserved)) return l.manualRoute;
    const plan = guide || groupPlans(p).get(l.id)?.guide;
    if (!plan) return [];
    const i = info(p, l),
      monotone = (path) =>
        segments(path).every((s) =>
          s.h ? s.b.x >= s.a.x : (i.end.y - i.start.y) * (s.b.y - s.a.y) >= 0,
        );
    if (valid(p, l, plan, reserved) && monotone(plan)) return clean(plan);
    const direct = [
      clean([
        i.start,
        { x: i.br.left - LEAD, y: i.start.y },
        { x: i.br.left - LEAD, y: i.end.y },
        i.end,
      ]),
      clean([
        i.start,
        { x: i.ar.right + LEAD, y: i.start.y },
        { x: i.ar.right + LEAD, y: i.end.y },
        i.end,
      ]),
    ].filter((path) => valid(p, l, path, reserved));
    if (direct.length) return direct.sort((a, b) => a.length - b.length)[0];
    if (valid(p, l, plan, reserved)) return clean(plan);
    const path = fallback(p, l, reserved, plan);
    if (path.length || !p.settings?.advancedMode) return path;
    return fallback(p, l, reserved, plan, true);
  }
  function routeConnections(p, previous = new Map(), affected = null) {
    const plans = groupPlans(p),
      result = new Map(),
      links = [...p.links].sort((a, b) => {
        const x = plans.get(a.id),
          y = plans.get(b.id);
        return (
          Number(Boolean(b.manualRoute)) - Number(Boolean(a.manualRoute)) ||
          (x?.a.pos.x ?? 0) - (y?.a.pos.x ?? 0) ||
          (x?.a.pos.y ?? 0) - (y?.a.pos.y ?? 0) ||
          (x?.a.id ?? "").localeCompare(y?.a.id ?? "") ||
          (x?.rank ?? 0) - (y?.rank ?? 0) ||
          a.id.localeCompare(b.id)
        );
      });
    if (affected)
      for (const l of links)
        if (!affected.has(l.id) && previous.has(l.id))
          result.set(l.id, previous.get(l.id));
    for (const l of links) {
      if (result.has(l.id)) continue;
      const plan = plans.get(l.id);
      if (!plan) continue;
      let guide = plan.guide;
      // A dragged endpoint joins the existing bundle rather than reorganising stationary peers.
      const peer = links.find(
        (other) =>
          result.has(other.id) &&
          !affected?.has(other.id) &&
          plans.get(other.id)?.key === plan.key &&
          result.get(other.id).length >= 4,
      );
      if (affected && peer) {
        const horizontal = segments(result.get(peer.id))
          .filter((s) => s.h)
          .sort((a, b) => Math.abs(b.b.x - b.a.x) - Math.abs(a.b.x - a.a.x))[0];
        if (horizontal && plan.direction !== "level") {
          const y =
            horizontal.a.y + (plan.rank - plans.get(peer.id).rank) * STEP;
          const exit = plan.ar.right + LEAD + plan.rank * STEP,
            trunk = plan.br.left - LEAD;
          guide = clean([
            plan.start,
            { x: exit, y: plan.start.y },
            { x: exit, y },
            { x: trunk, y },
            { x: trunk, y: plan.end.y },
            plan.end,
          ]);
        }
      }
      const reserved = [...result.values()];
      let path = routeOne(p, l, reserved, guide);
      if (path !== l.manualRoute) {
        const snapped = clean(path.map(({x,y}) => ({
          x: Math.round(x / STEP) * STEP,
          y: Math.round(y / STEP) * STEP,
        })));
        if (snapped.length >= 2 && valid(p, l, snapped, reserved)) path = snapped;
        // Fold a short step at either port into the main vertical run.
        if (path.length === 6) {
          const [start, firstBend, firstCorner, secondCorner, lastBend, end] = path;
          const firstRise = Math.abs(firstBend.y - firstCorner.y);
          const lastRise = Math.abs(secondCorner.y - lastBend.y);
          if (Math.min(firstRise, lastRise) <= 2 * STEP) {
            const lanes = firstRise <= lastRise
              ? [secondCorner.x, firstBend.x]
              : [firstBend.x, secondCorner.x];
            for (const x of lanes) {
              const candidate = clean([start, {x, y:start.y}, {x, y:end.y}, end]);
              if (candidate.length >= 2 && valid(p, l, candidate, reserved)) {
                path = candidate;
                break;
              }
            }
          }
        }
        for (let i = 1; i + 4 < path.length; i++) {
          const [a, b, c, d] = path.slice(i, i + 4);
          const vertical = a.x === b.x && c.x === d.x;
          const along = vertical ? "y" : "x";
          const across = vertical ? "x" : "y";
          if (a[across] !== b[across] || c[across] !== d[across] ||
              Math.abs(b[across] - c[across]) > 2 * STEP ||
              (b[along] - a[along]) * (d[along] - c[along]) <= 0) continue;
          for (const lane of [a[across], d[across]]) {
            const candidate = clean([...path.slice(0, i), {...a, [across]:lane},
              {...d, [across]:lane}, ...path.slice(i + 4)]);
            if (!valid(p, l, candidate, reserved)) continue;
            path = candidate;
            i = 0;
            break;
          }
        }
      }
      result.set(l.id, path);
    }
    return result;
  }
  function affectedByMove(p, ids, previous) {
    const moved = new Set(ids),
      out = new Set();
    for (const l of p.links) {
      if (moved.has(l.from.nodeId) || moved.has(l.to.nodeId)) {
        out.add(l.id);
        continue;
      }
      const path = previous.get(l.id) || [];
      if (
        p.nodes.some(
          (n) =>
            moved.has(n.id) &&
            segments(path).some((s) => {
              const r = E.rect(n);
              return pierces(s.a, s.b, {
                left: r.left - CLEAR,
                right: r.right + CLEAR,
                top: r.top - CLEAR,
                bottom: r.bottom + CLEAR,
              });
            }),
        )
      )
        out.add(l.id);
    }
    return out;
  }
  return {
    STEP,
    CLEAR,
    clean,
    segments,
    valid,
    groupPlans,
    routeOne,
    routeConnections,
    affectedByMove,
  };
});

(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./engine.js")
      : root.ElectricEngine,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectricRender = api;
})(globalThis, function (E) {
  "use strict";
  const tr = value => globalThis.ElectricI18n?.t(value) ?? value;
  let catalogNames;
  const W = 354,
    PAD = 26;
  const phaseColor = (k) =>
    ({ L1: "#ffcc00", L2: "#44ff44", L3: "#ff6666" })[k] || "#cbd5e1";
  function pinColor(v) {
    return v.phases === 3
      ? "#ef4444"
      : v.connType === "cee1" || v.connType === "terminal1"
        ? "#3b82f6"
        : v.connType === "powercon"
          ? "#f0c0a0"
          : "#cbd5e1";
  }
  function fill(n) {
    if (n.shield) return "#ffffff";
    if (n.category === "input" && n.outputs[0]?.connType === "euro")
      return "#FFFACD";
    if (n.category === "consumer") return "#0b2a63";
    if (n.category === "input") return n.phases === 3 ? "#ef4444" : "#1e40af";
    if (n.category === "distributor") return "#a3a11e";
    if (n.category === "extender") return "#14532d";
    return "#111827";
  }
  function portGeometry(n, v) {
    if (v.connType.startsWith("terminal")) {
      const at = E.portPosition(n, v),
        w = v.phases === 3 ? 148 : 128;
      return {
        at,
        nominal: `${v.nominalA} А`,
        nominalW: 42,
        phase: null,
        phaseW: 0,
        w,
        left: v.kind === "in" ? at.x : at.x - w,
        right: v.kind === "in" ? at.x + w : at.x,
        top: at.y - 13,
        bottom: at.y + 13,
      };
    }
    const at = E.portPosition(n, v),
      nominal = `${{ terminal1: "КЛ1", terminal3: "КЛ3", powercon: "TRUE1" }[v.connType] || v.connType.toUpperCase()} ${v.nominalA}A`,
      nominalW = nominal.length * 5.5 + 16,
      phase =
        v.kind === "out" && n.phases === 3 && v.phases === 1 ? v.phase : null,
      phaseW = phase ? 23 : 0,
      w = E.portBodyWidth(n,v);
    return {
      at,
      nominal,
      nominalW,
      phase,
      phaseW,
      w,
      left: v.kind === "in" ? at.x - 18 : at.x - w + 18,
      right: v.kind === "in" ? at.x - 18 + w : at.x + 18,
      top: at.y - 13,
      bottom: at.y + 13,
    };
  }
  function breakerButtons(n) {
    const result=[];
    for(const v of [...n.inputs,...n.outputs]){
      const g=portGeometry(n,v),items=[];
      if(v.breaker)items.push({breaker:v.breaker,portId:v.id,main:false});
      if(n.mainBreaker && (v===n.inputs[0] || (!n.inputs.length && v===n.outputs[0])))items.push({breaker:n.mainBreaker,portId:v.id,main:true});
      items.forEach((item,i)=>result.push({...item,left:v.kind==="in"?g.right+6+38*i:g.left-38*(i+1),top:g.top,w:32,h:g.bottom-g.top}));
    }
    return result;
  }
  function simplify(points) {
    const out = [];
    for (const v of points) {
      if (out.length && out.at(-1).x === v.x && out.at(-1).y === v.y) continue;
      while (out.length >= 2) {
        const a = out.at(-2),
          b = out.at(-1);
        if ((a.x === b.x && b.x === v.x) || (a.y === b.y && b.y === v.y))
          out.pop();
        else break;
      }
      if (!out.length || out.at(-1).x !== v.x || out.at(-1).y !== v.y)
        out.push(v);
    }
    return out;
  }
  function overloadAlerts(project, calc) {
    const links = new Set(),
      ports = new Map();
    for (const l of project.links) {
      const source = project.nodes.find((n) => n.id === l.from.nodeId),
        target = project.nodes.find((n) => n.id === l.to.nodeId),
        out = source.outputs.find((v) => v.id === l.from.portId),
        input = target.inputs.find((v) => v.id === l.to.portId),
        child = calc.nodes.get(target.id),
        load = calc.ports.get(out.id);
      const limit = Math.min(
        out.nominalA,
        input.nominalA,
        out.breaker?.ratingA ?? Infinity,
      );
      if (
        !child.powered ||
        Math.max(...Object.values(load?.loadA || { L1: 0 })) <= limit + 1e-8
      )
        continue;
      links.add(l.id);
      for (const [nodeId, portId] of [
        [source.id, out.id],
        [target.id, input.id],
      ]) {
        const ownLimit =
          nodeId === source.id
            ? Math.min(out.nominalA, out.breaker?.ratingA ?? Infinity)
            : input.nominalA;
        if (
          Math.max(...Object.values(load?.loadA || { L1: 0 })) <=
          ownLimit + 1e-8
        )
          continue;
        if (!ports.has(nodeId)) ports.set(nodeId, new Set());
        ports.get(nodeId).add(portId);
      }
    }
    const depths = new Map();
    const queue = E.overloadOrigins(project, calc).map(o => o.nodeId);
    for (const id of queue) depths.set(id, 0);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const l of project.links.filter(
        (l) => l.to.nodeId === id && links.has(l.id),
      )) {
        if (!depths.has(l.from.nodeId)) {
          depths.set(l.from.nodeId, depths.get(id) + 1);
          queue.push(l.from.nodeId);
        }
      }
    }
    return { links, ports, depths };
  }
  function overloadAnimation(el, enabled, depth, maxDepth, mode, epoch) {
    if (!el || typeof el.animate !== "function") return;
    const seconds = maxDepth + 1.8, duration = seconds * 1000;
    const key = enabled + ":" + depth + ":" + maxDepth + ":" + mode + ":" + epoch;
    if (el._overloadAnimationKey === key) return;
    el._overloadAnimation?.cancel(); el._overloadAnimationKey = key;
    if (!enabled) { el.style.animation = ""; return; }
    el.style.animation = "none";
    if (mode === "dim") { el.style.opacity = "1"; el.style.strokeDasharray = "none"; el.style.stroke = "#ff0000"; el.style.strokeWidth = "var(--chain-outline-width)"; el.style.filter = "drop-shadow(0 0 1px #ff0000)"; return; }
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frames;
    if (mode === "origin") {
      el.style.opacity = "1"; el.style.strokeDasharray = "none"; return;
    }
    if (mode === "center") {
      el.style.opacity = "0";
      frames = [
        {offset:0,opacity:0,transform:"scale(0)"},
        {offset:.08/seconds,opacity:1,transform:"scale(.45)"},
        {offset:.25/seconds,opacity:1,transform:"scale(1)"},
        {offset:.6/seconds,opacity:.75,transform:"scale(1.25)"},
        {offset:1.6/seconds,opacity:0,transform:"scale(1.9)"},
        {offset:1,opacity:0,transform:"scale(1.9)"}
      ];
    }
    else if (mode === "contour" || mode === "wire") {
      const start = (mode === "wire" ? depth + .4 : depth - .1) / seconds;
      const end = (mode === "wire" ? depth + .9 : depth + .4) / seconds;
      const finish = mode === "wire" ? 200 : 0;
      frames = mode === "wire" ? [
        {offset:0,opacity:0,strokeDasharray:"24 176",strokeDashoffset:100},
        {offset:start,opacity:0,strokeDasharray:"24 176",strokeDashoffset:100},
        {offset:start+.001,opacity:1,strokeDasharray:"24 176",strokeDashoffset:100},
        {offset:end,opacity:1,strokeDasharray:"24 176",strokeDashoffset:200},
        {offset:end+.05/seconds,opacity:0,strokeDasharray:"24 176",strokeDashoffset:200},
        {offset:(maxDepth+1)/seconds-.001,opacity:0,strokeDasharray:"100 100",strokeDashoffset:200},
        {offset:(maxDepth+1)/seconds,opacity:1,strokeDasharray:"100 100",strokeDashoffset:200},
        {offset:(maxDepth+1.2)/seconds,opacity:1,strokeDasharray:"100 100",strokeDashoffset:200},
        {offset:1,opacity:0,strokeDasharray:"100 100",strokeDashoffset:200}
      ] : [
        {offset:0,opacity:0,strokeDasharray:"100 100",strokeDashoffset:100},
        {offset:Math.max(0,start),opacity:0,strokeDasharray:"100 100",strokeDashoffset:100},
        {offset:Math.max(0,start)+.001,opacity:1,strokeDasharray:"100 100",strokeDashoffset:100},
        {offset:end,opacity:1,strokeDasharray:"100 100",strokeDashoffset:finish},
        {offset:(maxDepth+1.2)/seconds,opacity:1,strokeDasharray:"100 100",strokeDashoffset:finish},
        {offset:1,opacity:.1,strokeDasharray:"100 100",strokeDashoffset:finish}
      ];
    } else if (mode === "port") {
      const start=Math.max(0,depth-.1)/seconds;
      frames=[{offset:0,opacity:.15},{offset:start,opacity:.15},{offset:(depth+.4)/seconds,opacity:1},{offset:(maxDepth+1.2)/seconds,opacity:1},{offset:1,opacity:.15}];
    } else frames = [{offset:0,opacity:.2},{offset:.88,opacity:1},{offset:.94,opacity:1},{offset:1,opacity:.2}];
    el._overloadAnimation = el.animate(frames,{duration,iterations:Infinity,easing:"linear"});
    el._overloadAnimation.startTime = epoch + (mode === "center" ? Number(el.dataset.pulseIndex || 0) * duration / 8 : 0);
  }
  function nearestFreeCableLabel(x, y, obstacles, halfWidth, halfHeight, gap) {
    const dx = halfWidth + gap + .01, dy = halfHeight + gap + .01;
    const blocks = obstacles.map(rect => ({
      left:rect.left-dx, right:rect.right+dx, top:rect.top-dy, bottom:rect.bottom+dy,
    })).sort((a,b) => a.top-b.top);
    const columns = [...new Set([x, ...blocks.flatMap(rect => [rect.left,rect.right])])]
      .sort((a,b) => Math.abs(a-x)-Math.abs(b-x));
    let best = Infinity, position;
    for (const cx of columns) {
      const horizontalCost = (cx-x)**2;
      if (horizontalCost >= best) break;
      let top = Infinity, bottom = -Infinity, choices = [y];
      for (const rect of blocks) {
        if (cx <= rect.left || cx >= rect.right) continue;
        if (rect.top >= bottom) {
          if (top < y && y < bottom) { choices = [top,bottom]; break; }
          if (rect.top >= y) break;
          top = rect.top;
          bottom = rect.bottom;
        } else bottom = Math.max(bottom,rect.bottom);
      }
      if (top < y && y < bottom) choices = [top,bottom];
      for (const cy of choices) {
        const cost = horizontalCost+(cy-y)**2;
        if (cost < best) { best = cost; position = [cx,cy]; }
      }
    }
    return position;
  }

  function syncCableLabel(record, points, estimate, length, view, viewport, fraction, savePosition, wires, modules, occupied, openSettings, openLength, warnings, powerDeficit, criticalDrop) {
    if (!estimate || points.length < 2) {
      record.cableLabel?.group.remove();
      record.cableLabel = null;
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    if (!record.cableLabel) {
      const group = document.createElementNS(ns, "g");
      group.classList.add("cableMetricLabel");
      const leader = document.createElementNS(ns, "path");
      leader.classList.add("cableLabelLeader");
      const capsule = document.createElementNS(ns, "rect");
      const text = document.createElementNS(ns, "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("y", "4");
      group.append(leader, capsule, text);
      record.el.append(group);
      const label = {group, leader, capsule, text};
      group.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        label.drag = event.pointerId;
        label.startX = event.clientX;
        label.startY = event.clientY;
        label.moved = false;
        group.setPointerCapture(event.pointerId);
      });
      group.addEventListener("pointermove", event => {
        if (label.drag !== event.pointerId) return;
        event.stopPropagation();
        if (!label.moved && Math.hypot(event.clientX-label.startX, event.clientY-label.startY) < 4) return;
        label.moved = true;
        label.move(event);
      });
      group.addEventListener("pointerup", event => {
        if (label.drag !== event.pointerId) return;
        event.stopPropagation();
        label.drag = null;
        if (label.moved) label.save();
        else openLength();
      });
      group.addEventListener("pointercancel", () => { label.drag = null; label.reset(); });
      group.addEventListener("dblclick", event => event.stopPropagation());
      group.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
      });
      record.cableLabel = label;
    }
    const label = record.cableLabel;
    label.group.classList.toggle("cableMetricWarning", warnings.length > 0);
    label.group.classList.toggle("cableMetricCritical", criticalDrop);
    label.group.classList.toggle("cableMetricDeficit", powerDeficit);
    let tooltip = label.group.querySelector("title");
    if (warnings.length) {
      if (!tooltip) {
        tooltip = document.createElementNS(ns,"title");
        label.group.prepend(tooltip);
      }
      tooltip.textContent = warnings.join(" ");
    } else tooltip?.remove();
    const format = value => value.toLocaleString("ru-RU", {maximumFractionDigits:2});
    const caption = (warnings.length ? "⚠ " : "") + format(length) + " м · ΔU" + (estimate.lineVoltage ? "л" : "ф") + " " +
      format(estimate.dropV) + " В · ΔP " + format(estimate.lossW) + " Вт";
    if (label.text.textContent !== caption) {
      label.text.textContent = caption;
      const width = (label.text.getComputedTextLength?.() || caption.length * 6.6) + 16;
      label.capsule.setAttribute("width", width);
      label.capsule.setAttribute("height", "26");
      label.capsule.setAttribute("x", -width/2);
      label.capsule.setAttribute("y", "-13");
      label.capsule.setAttribute("rx", "13");
      label.width = width;
    }
    const segments = points.slice(1).map((b,i) => {
      const a = points[i];
      return {a,b,length:Math.hypot(b.x-a.x,b.y-a.y)};
    });
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    const position = value => {
      label.fraction = value;
      let distance = total * value;
      for (const {a,b,length} of segments) {
        if (distance > length && b !== points.at(-1)) { distance -= length; continue; }
        const f = length ? Math.min(1,distance/length) : 0;
        const x = a.x+(b.x-a.x)*f, y = a.y+(b.y-a.y)*f;
        const scale = Math.min(1, view.zoom) / view.zoom;
        const halfWidth = label.width * scale / 2, halfHeight = 13 * scale;
        const gap = 8 * scale;
        const intersects = (cx, cy) => wires.some(([p,q]) =>
          Math.max(p.x,q.x) >= cx-halfWidth-gap && Math.min(p.x,q.x) <= cx+halfWidth+gap &&
          Math.max(p.y,q.y) >= cy-halfHeight-gap && Math.min(p.y,q.y) <= cy+halfHeight+gap);
        const overlapsLabel = (cx, cy) => [...occupied].some(([other, bounds]) =>
          other !== record && Math.abs(cx-bounds.x) < halfWidth+bounds.halfWidth+gap &&
          Math.abs(cy-bounds.y) < halfHeight+bounds.halfHeight+gap);
        const overlapsModule = (cx, cy) => modules.some(rect =>
          cx+halfWidth+gap > rect.left && cx-halfWidth-gap < rect.right &&
          cy+halfHeight+gap > rect.top && cy-halfHeight-gap < rect.bottom);
        const vertical = a.x === b.x;
        const candidates = [];
        for (let step = 1; step <= 12; step++) {
          const dx = halfWidth + (step + 1) * gap;
          const dy = halfHeight + (step + 1) * gap;
          if (vertical) candidates.push([x+dx,y],[x-dx,y],[x,y-dy],[x,y+dy]);
          else candidates.push([x,y-dy],[x,y+dy],[x+dx,y],[x-dx,y]);
        }
        for (const rect of modules) {
          if (x+halfWidth+gap < rect.left || x-halfWidth-gap > rect.right) continue;
          for (const cy of [rect.top-halfHeight-2*gap,rect.bottom+halfHeight+2*gap]) {
            if (Math.abs(cy-y) <= 220*scale) candidates.push([x,cy]);
          }
        }
        const placement = candidates.find(([px,py]) => !intersects(px,py) && !overlapsLabel(px,py) && !overlapsModule(px,py));
        const [cx,cy] = placement || nearestFreeCableLabel(x,y,[
          ...modules,
          ...wires.map(([p,q]) => ({
            left:Math.min(p.x,q.x),right:Math.max(p.x,q.x),
            top:Math.min(p.y,q.y),bottom:Math.max(p.y,q.y),
          })),
          ...[...occupied].filter(([other]) => other !== record).map(([,b]) => ({
            left:b.x-b.halfWidth,right:b.x+b.halfWidth,
            top:b.y-b.halfHeight,bottom:b.y+b.halfHeight,
          })),
        ],halfWidth,halfHeight,gap);
        occupied.set(record, {x:cx,y:cy,halfWidth,halfHeight});
        label.group.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + scale + ")");
        const sx = (x-cx)/scale, sy = (y-cy)/scale;
        const edgeX = Math.max(-label.width/2,Math.min(label.width/2,sx));
        const edgeY = Math.max(-13,Math.min(13,sy));
        const leader = Math.abs(sx) > label.width/2
          ? "M " + sx + " " + sy + " V " + edgeY + " H " + edgeX
          : "M " + sx + " " + sy + " H " + edgeX + " V " + edgeY;
        label.leader.setAttribute("d",leader);
        break;
      }
    };
    label.move = event => {
      const x=(event.clientX-viewport.left-view.panX)/view.zoom;
      const y=(event.clientY-viewport.top-view.panY)/view.zoom;
      let best=Infinity, bestDistance=0, travelled=0;
      for (const {a,b,length} of segments) {
        const f=length ? Math.max(0,Math.min(1,((x-a.x)*(b.x-a.x)+(y-a.y)*(b.y-a.y))/length**2)) : 0;
        const distance=Math.hypot(x-a.x-(b.x-a.x)*f,y-a.y-(b.y-a.y)*f);
        if (distance<best) { best=distance; bestDistance=travelled+length*f; }
        travelled+=length;
      }
      position(total ? bestDistance/total : .5);
    };
    label.save = () => savePosition(label.fraction);
    label.reset = () => position(fraction);
    position(label.drag == null ? fraction : label.fraction);
  }

  function portAlarms(record, n, ids, overloaded, selected, origin, branch) {
    const W = E.nodeWidth(n);
    const key =
      [...(ids || [])].join("/") + "|" + W + "|" + E.nodeHeight(n) + "|" + overloaded + "|" + selected + "|" + origin + "|" + branch;
    if (record.alarmKey === key && record.alarm?.isConnected) return;
    record.alarm?.remove();
    for (const canvas of record.portCanvases || []) canvas.remove();
    record.portCanvases = [];
    const layer = document.createElement("div");
    layer.classList.add("portAlarmLayer");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.append(svg);
    svg.setAttribute("width", W + PAD * 2);
    svg.setAttribute("height", E.nodeHeight(n) + PAD * 2);
    svg.setAttribute(
      "viewBox",
      `0 0 ${W + PAD * 2} ${E.nodeHeight(n) + PAD * 2}`,
    );
    const nr = E.rect(n);
    if (overloaded || selected || branch) {
      const outline = document.createElementNS(
        "http://www.w3.org/2000/svg",
        overloaded ? "path" : "rect",
      );
      for (const [k, value] of Object.entries({
        x: PAD,
        y: PAD,
        width: W,
        height: E.nodeHeight(n),
        rx: 16,
      }))
        outline.setAttribute(k, value);
      if (overloaded) {
        const x = PAD, y = PAD, right = x + W, bottom = y + E.nodeHeight(n), radius = 16;
        const entry = n.inputs[0] || n.outputs[0];
        const startY = entry ? E.portPosition(n, entry).y - nr.top + PAD : y + E.nodeHeight(n)/2;
        outline.setAttribute("d", `M ${x} ${startY} V ${y+radius} Q ${x} ${y} ${x+radius} ${y} H ${right-radius} Q ${right} ${y} ${right} ${y+radius} V ${bottom-radius} Q ${right} ${bottom} ${right-radius} ${bottom} H ${x+radius} Q ${x} ${bottom} ${x} ${bottom-radius} Z`);
      }
      outline.setAttribute("pathLength", "100");
      outline.classList.add(overloaded ? "overload-node-outline" : selected ? "selected-node-outline" : "branch-node-outline");
      svg.append(outline);
      if (overloaded && origin) {
        const ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        for (const [k,value] of Object.entries({x:PAD,y:PAD,width:W,height:E.nodeHeight(n),rx:16})) ring.setAttribute(k,value);
        ring.classList.add("overload-origin-pulse");
        for (let i=0;i<8;i++) { const pulse=ring.cloneNode(true);pulse.dataset.pulseIndex=String(i);svg.append(pulse); }
      } else if (overloaded) {
        outline.style.opacity = ".12"; outline.style.animation = "none";
        const x=PAD, y=PAD, right=x+W, bottom=y+E.nodeHeight(n), radius=16;
        const exit=n.inputs[0];
        const endY=exit ? E.portPosition(n,exit).y-nr.top+PAD : y+E.nodeHeight(n)/2;
        const entries=n.outputs.filter(v=>ids?.has(v.id));
        for (const entry of entries.length ? entries : [n.outputs[0]]) {
          const startY=entry ? E.portPosition(n,entry).y-nr.top+PAD : y+E.nodeHeight(n)/2;
          const paths=[
            `M ${right} ${startY} V ${y+radius} Q ${right} ${y} ${right-radius} ${y} H ${x+radius} Q ${x} ${y} ${x} ${y+radius} V ${endY}`,
            `M ${right} ${startY} V ${bottom-radius} Q ${right} ${bottom} ${right-radius} ${bottom} H ${x+radius} Q ${x} ${bottom} ${x} ${bottom-radius} V ${endY}`
          ];
          for (const d of paths) {
            const half=document.createElementNS("http://www.w3.org/2000/svg","path"); half.setAttribute("d",d);half.setAttribute("pathLength","100");half.classList.add("overload-contour-wave");svg.append(half);
          }
        }
      }
    }
    for (const v of [...n.inputs, ...n.outputs]) {
      if (!ids?.has(v.id)) continue;
      const g = portGeometry(n, v),
        group = document.createElement("canvas");
      group.classList.add("overload-port");
      group.dataset.portId = v.id;
      group.width = (g.w + 12) * 2;
      group.height = 76;
      Object.assign(group.style, {
        position: "absolute",
        left: `${g.left - nr.left + PAD - 6}px`,
        top: `${g.top - nr.top + PAD - 6}px`,
        width: `${g.w + 12}px`,
        height: "38px",
      });
      const ctx = group.getContext("2d");
      ctx.scale(2, 2);
      ctx.lineWidth = 5;
      round(ctx, 6, 6, g.w, 26, 13, null, "#ff1515");
      group.style.zIndex = "6";
      record.el.append(group);
      record.portCanvases.push(group);
    }
    record.el.append(layer);
    record.alarm = layer;
    record.alarmKey = key;
  }
  function crossings(paths, nodes = []) {
    const all = [],
      result = new Map();
    for (const [id, raw] of paths) {
      const points = simplify(raw),
        hits = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          horizontal = a.y === b.y;
        for (const s of all) {
          if (s.id === id || horizontal === s.horizontal) continue;
          const x = horizontal ? s.a.x : a.x,
            y = horizontal ? a.y : s.a.y;
          const between = (v, a, b) =>
            v > Math.min(a, b) + 1e-6 && v < Math.max(a, b) - 1e-6;
          if (
            !between(x, horizontal ? a.x : s.a.x, horizontal ? b.x : s.b.x) ||
            !between(y, horizontal ? s.a.y : a.y, horizontal ? s.b.y : b.y)
          )
            continue;
          if (
            nodes.some((n) => {
              const r = E.rect(n);
              return (
                x > r.left - 8 &&
                x < r.right + 8 &&
                y > r.top - 8 &&
                y < r.bottom + 8
              );
            })
          )
            continue;
          const available = Math.min(
            Math.abs((horizontal ? x : y) - (horizontal ? a.x : a.y)),
            Math.abs((horizontal ? b.x : b.y) - (horizontal ? x : y)),
          );
          const radius = Math.min(5, available / 2);
          if (
            radius >= 2 &&
            !hits.some(
              (h) =>
                h.segment === i &&
                Math.abs(h.x - x) < 0.01 &&
                Math.abs(h.y - y) < 0.01,
            )
          )
            hits.push({ segment: i, x, y, radius });
        }
        all.push({ a, b, horizontal, id });
      }
      result.set(id, { points, hits });
    }
    return result;
  }
  function trace(ctx, points, hits = []) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        horizontal = a.y === b.y,
        sign = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
      const jumps = hits
        .filter((h) => h.segment === i)
        .sort(
          (a, b) =>
            sign * ((horizontal ? a.x : a.y) - (horizontal ? b.x : b.y)),
        );
      let last = -Infinity;
      for (const h of jumps) {
        const value = horizontal ? h.x : h.y;
        if (Math.abs(value - last) < h.radius * 2 + 2) continue;
        last = value;
        const r = h.radius;
        if (horizontal) {
          ctx.lineTo(h.x - sign * r, h.y);
          ctx.bezierCurveTo(
            h.x - sign * r,
            h.y - r * 1.333,
            h.x + sign * r,
            h.y - r * 1.333,
            h.x + sign * r,
            h.y,
          );
        } else {
          ctx.lineTo(h.x, h.y - sign * r);
          ctx.bezierCurveTo(
            h.x + r * 1.333,
            h.y - sign * r,
            h.x + r * 1.333,
            h.y + sign * r,
            h.x,
            h.y + sign * r,
          );
        }
      }
      ctx.lineTo(b.x, b.y);
    }
  }
  function svgPath(points, hits = []) {
    const commands = [],
      f = (v) => Number(v.toFixed(3));
    trace(
      {
        beginPath() {},
        moveTo(x, y) {
          commands.push(`M${f(x)} ${f(y)}`);
        },
        lineTo(x, y) {
          commands.push(`L${f(x)} ${f(y)}`);
        },
        bezierCurveTo(...v) {
          commands.push("C" + v.map(f).join(" "));
        },
      },
      points,
      hits,
    );
    return commands.join(" ");
  }
  function round(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function text(
    ctx,
    s,
    x,
    y,
    color = "#ffffff",
    size = 10,
    align = "center",
    weight = "normal",
    family = "monospace",
    translate = true,
  ) {
    if (translate) s = tr(s);
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  }
  function capsule(
    ctx,
    s,
    cx,
    top,
    {
      size = 10,
      height = 20,
      fill = "#0a0e16cc",
      color = "#fff",
      max = W - 16,
      family = "monospace",
    } = {},
  ) {
    s = tr(s);
    ctx.font = `bold ${size}px ${family}`;
    while (ctx.measureText(s).width > max - 16 && s.length > 1)
      s = s.slice(0, -2) + "…";
    const w = Math.min(max, ctx.measureText(s).width + 16);
    round(ctx, cx - w / 2, top, w, height, height / 2, fill);
    text(ctx, s, cx, top + height / 2, color, size, "center", "bold", family);
  }
  function portCapsule(ctx, n, v, ui) {
    if (v.connType.startsWith("terminal")) {
      const g = portGeometry(n, v),
        alarm = ui.alarmPorts?.has(v.id);
      ctx.lineWidth = alarm ? 3 : 2;
      round(
        ctx,
        g.left,
        g.top,
        g.w,
        26,
        13,
        "#0a0e16",
        alarm ? "#a82020" : v.phases === 3 ? "#ef4444" : "#3b82f6",
      );
      text(
        ctx,
        `${v.nominalA} А`,
        g.left + 26,
        g.at.y,
        "#fff",
        10,
        "center",
        "bold",
      );
      const keys =
          v.phases === 3
            ? ["L1", "L2", "L3", "N", "PE"]
            : [v.phase || ui.inPhase || "L", "N", "PE"],
        cw = 13,
        gap = 2,
        total = keys.length * cw + (keys.length - 1) * gap,
        x = g.right - 8 - total;
      const colors = {
        L: "#fff",
        L1: "#fff",
        L2: "#111",
        L3: "#80502c",
        N: "#70c4ee",
        PE: "#f5df00",
      };
      keys.forEach((key, i) => {
        const bx = x + i * (cw + gap),
          by = g.top + 3;
        round(ctx, bx, by, cw, 20, 2, colors[key], "#a6b0bd");
        if (key === "PE") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx, by, cw, 20);
          ctx.clip();
          ctx.strokeStyle = "#269c4b";
          ctx.lineWidth = 4;
          for (let k = -20; k < 30; k += 8) {
            ctx.beginPath();
            ctx.moveTo(bx + k, by + 20);
            ctx.lineTo(bx + k + 20, by);
            ctx.stroke();
          }
          ctx.restore();
        }
        text(
          ctx,
          key,
          bx + cw / 2,
          by + 10,
          ["L2", "L3"].includes(key) ? "#fff" : "#111",
          8.5,
          "center",
          "bold",
        );
      });
      return;
    }
    const g = portGeometry(n, v),
      color = pinColor(v),
      target = ui.hover?.portId === v.id && ui.pendingPort,
      ref = { nodeId: n.id, portId: v.id, kind: v.kind },
      stroke = target
        ? E.canConnect(ui.project, ui.pendingPort, ref).ok
          ? "#4ade80"
          : "#fb7185"
        : ui.pendingPort?.portId === v.id || ui.hover?.portId === v.id
          ? "#fbbf24"
          : color;
    const alarm = ui.alarmPorts?.has(v.id);
    ctx.lineWidth = alarm ? 3 : target ? 2.5 : 1.2;
    round(
      ctx,
      g.left,
      g.top,
      g.w,
      26,
      13,
      "#0a0e16cc",
      alarm ? "#a82020" : stroke,
    );
    let x = v.kind === "in" ? g.at.x + 13 : g.left + 12;
    const bodyColor =
      v.phases === 3
        ? "#ef4444"
        : v.connType === "cee1"
          ? "#3b82f6"
          : v.connType === "euro"
            ? "#6b7280"
            : "#38495e";
    round(ctx, x, g.top + 4, g.nominalW, 18, 6, bodyColor);
    text(
      ctx,
      g.nominal,
      x + g.nominalW / 2,
      g.at.y,
      "#fff",
      9,
      "center",
      "bold",
    );
    if (g.phase) {
      x += g.nominalW + 6;
      round(ctx, x, g.top + 4, g.phaseW, 18, 6, phaseColor(g.phase));
      text(ctx, g.phase, x + g.phaseW / 2, g.at.y, "#000", 9, "center", "bold");
    }
  }
  function pin(ctx, n, v, ui) {
    if (v.connType.startsWith("terminal")) return;
    const at = E.portPosition(n, v),
      r = E.rect(n);
    ctx.beginPath();
    ctx.arc(at.x, at.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = pinColor(v);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  function paintNode(ctx, n, c, ui) {
    const r = E.rect(n),
      W = E.nodeWidth(n),
      h = E.nodeHeight(n);
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(0,0,0,.5)";
    round(ctx, r.left, r.top, W, h, 16, fill(n));
    ctx.shadowBlur = 0;
    ctx.lineWidth = ui.selected ? 3 : 1;
    round(
      ctx,
      r.left,
      r.top,
      W,
      h,
      16,
      null,
      ui.selected ? "#ffaa44" : "#3a5a7a",
    );
    // Layer 1: body. Layer 2: all capsules and text. Layer 3: terminal pins.
    catalogNames ??= new Set(E.catalog().map(template => template.name));
    const predefined = catalogNames.has(n.templateName || n.name) && (!n.templateName || n.name === n.templateName);
    const titleParts = E.nomenclature(n, {connectors:true,compactConnectors:true})
      .split(" | ")
      .map((value, i) => {
        value = value.replaceAll(" -> ", " → ");
        if (i > 0 || predefined) value = tr(value);
        let size = i === 0 ? 13 : 10.5;
        ctx.font = `bold ${size}px system-ui`;
        while (ctx.measureText(value).width > W - 40 && size > 7) {
          size -= 0.5;
          ctx.font = `bold ${size}px system-ui`;
        }
        while (ctx.measureText(value).width > W - 40 && value.length > 2)
          value = value.slice(0, -2) + "…";
        return { value, size, width: ctx.measureText(value).width };
      });
    const titleW = Math.min(
      W - 16,
      Math.max(...titleParts.map((t) => t.width)) + 24,
    );
    round(ctx, n.pos.x - titleW / 2, r.top + 8, titleW, 60, 14, "#0a0e16dd");
    titleParts.forEach((t, i) =>
      text(
        ctx,
        t.value,
        n.pos.x,
        r.top + 21 + i * 18,
        "#fff",
        t.size,
        "center",
        "bold",
        "system-ui",
        false,
      ),
    );
    if (c.overload)
      capsule(ctx, "⚠ ПЕРЕГРУЗКА", n.pos.x, r.top + 82, {
        fill: "#ff0000cc",
        height: 20,
      });
    else if (c.phaseImbalance)
      capsule(ctx, "⚠ ДИСБАЛАНС ФАЗ", n.pos.x, r.top + 82, {
        fill: "#fbbf24cc",
        color: "#000",
      });
    else if (c.voltagePowerDeficit)
      capsule(ctx, "⚠ НЕ ХВАТАЕТ МОЩНОСТИ (ΔU)", n.pos.x, r.top + 82, {
        size: 9, height: 18, fill: "#b91c1c", color: "#fff",
      });
    else capsule(ctx, c.status, n.pos.x, r.top + 82, { size: 9, height: 18 });
    if (n.category === "consumer") {
      const a =
        n.consumerWatts /
        (ui.project.settings.voltageLN * (n.phases === 3 ? 3 : 1));
      capsule(
        ctx,
        `${(n.consumerWatts / 1000).toFixed(1)}кВт / ${a.toFixed(1)}А${n.phases === 3 ? "/ф" : ""}`,
        n.pos.x,
        r.top + 114,
        { size: 12, height: 24 },
      );
    }
    for (const v of [...n.inputs, ...n.outputs])
      portCapsule(ctx, n, v, { ...ui, inPhase: c.inPhase });
    const phases = n.phases === 3 ? E.PHASES : [c.inPhase || "L1"],
      start = n.pos.x - (phases.length * 85 + (phases.length - 1) * 8) / 2;
    phases.forEach((k, i) => {
      const x = start + i * 93,
        a = c.loadA[k],
        limit = n.inputs[0]?.nominalA ?? n.supplyA,
        color = a > limit ? "#fb7185" : a > limit * 0.8 ? "#fbbf24" : "#4ade80";
      round(ctx, x, r.bottom - 52, 85, 22, 11, "#0a0e16cc");
      text(ctx, `${k} ${a.toFixed(1)}A`, x + 42.5, r.bottom - 41, color, 9);
    });
    const voltage = n.phases === 3 ? c.voltageLN * Math.sqrt(3) : c.voltageLN;
    const capacity = ui.project.settings.advancedMode && Number.isFinite(c.availableWatts)
      ? ` / ${(c.availableWatts / 1000).toFixed(2)}` : "";
    const foot = `${(E.sum(c.loadW) / 1000).toFixed(2)}${capacity} кВт · ${Number(voltage.toFixed(1))} В`;
    capsule(ctx, foot, n.pos.x, r.bottom - 23, { size: 9, height: 16 });
    for (const v of [...n.inputs, ...n.outputs]) pin(ctx, n, v, ui);
  }
  class Scene {
    constructor(ws) {
      this.ws = ws;
      this.records = new Map();
      this.stats = {
        modulePaints: 0,
        staticPaints: 0,
        overlayPaints: 0,
        transforms: 0,
      };
      this.layer = document.createElement("div");
      this.wires = new Map();
      this.wireLayer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      this.wireLayer.id = "wireLayer";
      this.wireLayer.setAttribute("aria-hidden", "true");
      this.wireWorld = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      this.wireLayer.append(this.wireWorld);
      ws.append(this.wireLayer);
      this.stats.wireUpdates = 0;
      this.layer.id = "moduleLayer";

      ws.append(this.layer);
      this.overlay = document.createElement("canvas");
      this.overlay.id = "connectionOverlay";
      this.overlay.setAttribute("aria-hidden", "true");
      ws.append(this.overlay);
    }
    sync(project, calc, selection, hover, pending) {
      const branch = E.selectedBranch(project, selection);
      const alerts = overloadAlerts(project, calc);
      const originsKey = E.overloadOrigins(project, calc).map(o=>o.nodeId).sort().join("|");
      if (this.originsKey !== originsKey) { this.originsKey = originsKey; this.alarmEpoch = document.timeline?.currentTime ?? 0; }
      this.alarmEpoch ??= document.timeline?.currentTime ?? 0;
      const maxDepth = Math.max(0, ...alerts.depths.values());
      const view = project.view;
      this.layer.style.setProperty("--chain-outline-width", (Math.max(1.15,2.5*view.zoom)*1.25/view.zoom) + "px");
      this.layer.style.setProperty("--zoom-node-outline", Math.max(12, 8 / view.zoom) + "px");
      this.layer.style.setProperty("--alarm-glow", (5 / view.zoom) + "px");
      this.layer.style.setProperty("--zoom-selection-outline", Math.max(3, 3 / view.zoom) + "px");
      const transform = `translate(${view.panX}px,${view.panY}px) scale(${view.zoom})`;
      if (this.viewTransform !== transform) {
        this.layer.style.transform = transform;
        this.viewTransform = transform;
      }
      const bound = this.ws.getBoundingClientRect(),
        visible = {
          left: -view.panX / view.zoom,
          top: -view.panY / view.zoom,
          right: (bound.width - view.panX) / view.zoom,
          bottom: (bound.height - view.panY) / view.zoom,
        };
      const ids = new Set(project.nodes.map((n) => n.id));
      for (const [id, r] of this.records)
        if (!ids.has(id)) {
          r.el.remove();
          this.records.delete(id);
        }
      for (const n of project.nodes) {
        let r = this.records.get(n.id);
        if (!r) {
          r = {
            el: document.createElement("div"),
            signature: null,
            canvas: null,
          };
          r.el.className = "moduleSprite";
          r.el.dataset.nodeId = n.id;
          this.layer.append(r.el);
          this.records.set(n.id, r);
        }
        const nr = E.rect(n);
        const buttons=breakerButtons(n),buttonKey=JSON.stringify([globalThis.ElectricI18n?.language,buttons]);
        if(r.buttonKey!==buttonKey || r.el.querySelectorAll(".portBreakerButton").length!==buttons.length){
          r.el.querySelectorAll(".portBreakerButton").forEach(b=>b.remove());
          for(const item of buttons){
            const button=document.createElement("button"),b=item.breaker;
            button.type="button";button.className="portBreakerButton";
            button.dataset.state=b.state;button.dataset.nodeId=n.id;button.dataset.portId=item.portId;button.dataset.main=String(item.main);
            const state=b.state==="closed"?"ВКЛ":b.state==="open"?"ВЫКЛ":"ВЫБИТ";
            const nominal=b.curve+b.ratingA;
            button.innerHTML="<span>"+nominal+"</span><small>"+state+"</small>";
            button.setAttribute("aria-label",(item.main?"Вводной автомат ":"Автомат порта ")+nominal+": "+state);
            button.setAttribute("aria-pressed",String(b.state==="closed"));
            Object.assign(button.style,{left:(item.left-nr.left+PAD)+"px",top:(item.top-nr.top+PAD)+"px"});
            for(const event of ["pointerdown","pointerup","dblclick"])button.addEventListener(event,e=>e.stopPropagation());
            button.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")e.stopPropagation();});
            button.onclick=e=>{e.stopPropagation();this.onToggleBreaker?.(n.id,item.portId,item.main);};
            r.el.append(button);
          }
          r.buttonKey=buttonKey;
        }
        r.el.style.setProperty(
          "--alarm-delay",
          `${(alerts.depths.get(n.id) || 0) * 0.18}s`,
        );
        if (
          r.el.classList.contains("overloaded") !==
          calc.nodes.get(n.id).overload
        )
          r.el.classList.toggle("overloaded", calc.nodes.get(n.id).overload);
        const pose = `translate(${nr.left - PAD}px,${nr.top - PAD}px)`;
        if (r.pose !== pose) {
          r.el.style.transform = pose;
          r.pose = pose;
        }
        const z = selection.has(n.id) || branch.nodes.has(n.id) ? "2" : "1";
        if (r.z !== z) {
          r.el.style.zIndex = z;
          r.z = z;
        }
        const show = E.overlaps(nr, visible, 120);
        if (r.el.hidden === show) r.el.hidden = !show;
        if (!show) {
          if (r.canvas) {
            r.el.replaceChildren();
            r.canvas = null;
            r.signature = null;
          }
          continue;
        }
        const signature = JSON.stringify({
          language: globalThis.ElectricI18n?.language,
          ...n,
          pos: null,
          computed: calc.nodes.get(n.id),
          selected: selection.has(n.id),
          branch: branch.nodes.has(n.id),
          hover: hover?.nodeId === n.id ? hover.portId : null,
          pending:
            pending && (pending.nodeId === n.id || hover?.nodeId === n.id)
              ? pending
              : null,
          voltage: project.settings.voltageLN,
          connected: project.links
            .filter((l) => l.from.nodeId === n.id || l.to.nodeId === n.id)
            .map((l) => l.id),
          alarmPorts: [...(alerts.ports.get(n.id) || [])],
          rasterScale:
            (window.devicePixelRatio || 1) *
            Math.max(0.25, Math.ceil(view.zoom * 4) / 4),
        });
        if (r.signature === signature) continue;
        if (!r.canvas) {
          r.canvas = document.createElement("canvas");
          r.canvas.setAttribute("aria-hidden", "true");
          r.el.append(r.canvas);
        }
        const dpr =
            (window.devicePixelRatio || 1) *
            Math.max(0.25, Math.ceil(view.zoom * 4) / 4),
          w = E.nodeWidth(n) + PAD * 2,
          h = E.nodeHeight(n) + PAD * 2;
        r.canvas.width = Math.ceil(w * dpr);
        r.canvas.height = Math.ceil(h * dpr);
        r.canvas.style.width = w + "px";
        r.canvas.style.height = h + "px";
        const ctx = r.canvas.getContext("2d");
        ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          (PAD - nr.left) * dpr,
          (PAD - nr.top) * dpr,
        );
        const power = calc.nodes.get(n.id);
        r.canvas.style.filter = power.connected && !power.powered ? "brightness(0.55)" : "";
        paintNode(ctx, n, power, {
          project,
          selected: selection.has(n.id),
          hover,
          pendingPort: pending,
          alarmPorts: alerts.ports.get(n.id),
        });
        r.signature = signature;
        portAlarms(r, n, alerts.ports.get(n.id), calc.nodes.get(n.id).overload, selection.has(n.id), alerts.depths.get(n.id) === 0, branch.nodes.has(n.id));
        const isOrigin = alerts.depths.get(n.id) === 0;
        overloadAnimation(r.alarm?.querySelector(".overload-node-outline"), true, 0, maxDepth, isOrigin ? "origin" : "dim", this.alarmEpoch);
        for(const pulse of r.alarm?.querySelectorAll(".overload-origin-pulse") || []) overloadAnimation(pulse,true,0,maxDepth,"center",this.alarmEpoch);
        for(const half of r.alarm?.querySelectorAll(".overload-contour-wave") || []) { overloadAnimation(half,false,0,maxDepth,"dim",this.alarmEpoch); half.style.display = "none"; }
        for(const el of r.portCanvases || []) overloadAnimation(el,true,alerts.depths.get(n.id)||0,maxDepth,isOrigin ? "origin" : "dim",this.alarmEpoch);
        this.stats.modulePaints++;
      }
    }
    move(project, ids) {
      for (const id of ids) {
        const n = project.nodes.find((n) => n.id === id),
          r = this.records.get(id);
        if (!n || !r) continue;
        const nr = E.rect(n);
        r.el.style.transform = `translate(${nr.left - PAD}px,${nr.top - PAD}px)`;
        this.stats.transforms++;
      }
    }
    syncWires(project, calc, routes, selection = new Set()) {
      const branch = E.selectedBranch(project, selection);
      const alerts = overloadAlerts(project, calc);
      this.alarmEpoch ??= document.timeline?.currentTime ?? 0;
      const maxDepth = Math.max(0, ...alerts.depths.values());
      const r = this.ws.getBoundingClientRect(),
        v = project.view;
      const viewKey = [r.width, r.height, v.panX, v.panY, v.zoom].join("/");
      if (this.wireViewKey !== viewKey) {
        this.wireLayer.setAttribute("width", r.width);
        this.wireLayer.setAttribute("height", r.height);
        this.wireWorld.setAttribute(
          "transform",
          `translate(${v.panX} ${v.panY}) scale(${v.zoom})`,
        );
        this.wireViewKey = viewKey;
      }
      const known = new Map(
          project.links.map((l) => [l.id, routes.get(l.id) || []]),
        ),
        jumps = crossings(known, project.nodes),
        occupiedCableLabels = new Map(),
        moduleBounds = project.nodes.map(E.rect),
        wireSegments = [...known.values()].flatMap(points => points.slice(1).map((point,i) => [points[i],point])),
        ids = new Set(project.links.map((l) => l.id));
      for (const [id, record] of this.wires)
        if (!ids.has(id)) {
          record.el.remove();
          this.wires.delete(id);
        }
      for (const l of project.links) {
        const route = jumps.get(l.id);
        let record = this.wires.get(l.id);
        if (!record) {
          const el = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g",
            ),
            halo = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            ),
            line = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
          el.dataset.linkId = l.id;
          for (const path of [halo, line]) {
            path.setAttribute("vector-effect", "non-scaling-stroke");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
          }
          halo.setAttribute("stroke", "#000000");
          halo.setAttribute("stroke-width", "4");
          line.setAttribute("stroke-width", "2.5");
          const wave = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          wave.classList.add("overload-wave");
          wave.setAttribute("vector-effect", "non-scaling-stroke");
          wave.setAttribute("fill", "none");
          wave.setAttribute("pathLength", "100");
          el.append(halo, line, wave);
          const ends = [0, 1].map(() => {
            const dot = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle",
            );
            dot.classList.add("wire-end");
            dot.setAttribute("r", "3.5");
            dot.setAttribute("stroke", "#000");
            dot.setAttribute("stroke-width", "1");
            el.insertBefore(dot, halo);
            return dot;
          });
          this.wireWorld.append(el);
          record = { el, halo, line, wave, ends, key: null };
          this.wires.set(l.id, record);
        }
        const overloaded = alerts.links.has(l.id);
        for (const dot of record.ends) dot.style.opacity = "1";
        this.wireWorld.style.setProperty("--alarm-glow", (3.6 / project.view.zoom) + "px");
        const screenWidth = overloaded
          ? Math.max(1.15, 2.5 * project.view.zoom) * 1.25
          : Math.max(1.15, 2.5 * project.view.zoom) + (branch.links.has(l.id) ? 2 : 0);
        record.line.style.strokeWidth = String(screenWidth);
        record.halo.style.strokeWidth = String(screenWidth + 0.9);
        record.wave.style.strokeWidth = String(screenWidth);
        const d = svgPath(route.points, route.hits),
          node = project.nodes.find((n) => n.id === l.from.nodeId),
          port = node.outputs.find((o) => o.id === l.from.portId),
          powered = calc.nodes.get(l.to.nodeId).powered && (!calc.activeInputs || calc.activeInputs.get(l.to.nodeId)?.id === l.id),
          color = alerts.links.has(l.id)
            ? "#ff0000"
            : branch.links.has(l.id) ? "#4ce4ff" : powered
              ? pinColor(port)
              : "#627289",
          key = d + "|" + color + "|" + powered;
        record.el.style.setProperty(
          "--alarm-delay",
          `${(alerts.depths.get(l.to.nodeId) || 0) * 0.18}s`,
        );
        record.line.setAttribute("pathLength", "100");
        overloadAnimation(record.wave,false,0,maxDepth,"wire",this.alarmEpoch);
        record.wave.style.display = "none";
        record.line.style.filter = overloaded ? "drop-shadow(0 0 1px #ff0000)" : "";
        overloadAnimation(record.line,false,0,maxDepth,"fade",this.alarmEpoch);
        record.line.style.animation = "none";
        record.line.style.opacity = "1";
        if (
          record.el.classList.contains("overload-wire") !==
          alerts.links.has(l.id)
        )
          record.el.classList.toggle("overload-wire", alerts.links.has(l.id));
        const length = l.cable?.lengthM;
        const load = calc.ports.get(l.from.portId);
        const inlet = project.nodes.find(n => n.id === l.to.nodeId)?.inputs.find(v => v.id === l.to.portId);
        const cable = project.settings.advancedMode && length > 0 && load && inlet
          ? E.cableParameters(l, port, inlet, project.settings) : null;
        const estimate = cable ? E.cableEstimate(cable, port.phases, load.loadA) : null;
        const warnings = cable ? E.cableWarnings(cable, estimate, port, inlet, project.settings.voltageLN) : [];
        const receiving = calc.nodes.get(l.to.nodeId);
        const powerDeficit = !!estimate && powered && receiving.voltagePowerDeficit;
        if (powerDeficit) warnings.unshift("Недостаточно мощности из-за падения напряжения.");
        const criticalDrop = !!estimate && estimate.dropV > project.settings.voltageLN * (estimate.lineVoltage ? Math.sqrt(3) : 1);
        syncCableLabel(record, route.points, estimate, length, v, r, l.cable?.labelFraction ?? .5,
          fraction => this.onCableLabelMove?.(l.id, fraction), wireSegments, moduleBounds, occupiedCableLabels,
          () => this.onCableSettings?.(l.id), () => this.onCableEdit?.(l.id), warnings, powerDeficit, criticalDrop);
        if (!record.hit) {
          const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
          hit.classList.add("cableHitArea");
          hit.style.touchAction = "none";
          hit.setAttribute("vector-effect", "non-scaling-stroke");
          hit.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.stopPropagation();
            hit.routeDrag = this.onRouteDrag?.(l.id, event);
            if (hit.routeDrag) hit.setPointerCapture?.(event.pointerId);
          });
          hit.addEventListener("pointermove", event => hit.routeDrag?.move(event));
          hit.addEventListener("pointerup", event => {
            if (event.button !== 0) return;
            event.stopPropagation();
            hit.routeDrag?.finish(true);
            hit.routeDrag = null;
          });
          hit.addEventListener("lostpointercapture", () => {
            hit.routeDrag?.finish(false);
            hit.routeDrag = null;
          });
          hit.addEventListener("contextmenu", event => {
            event.preventDefault();
            event.stopPropagation();
            this.onRouteReset?.(l.id);
          });
          hit.addEventListener("dblclick", event => {
            event.stopPropagation();
            this.onCableEdit?.(l.id);
          });
          record.el.append(hit);
          record.hit = hit;
        }
        if (key === record.key) continue;
        record.hit.setAttribute("d", d);
        record.halo.setAttribute("d", d);
        record.line.setAttribute("d", d);
        record.wave.setAttribute("d", d);
        for (const [i, point] of [
          route.points[0],
          route.points.at(-1),
        ].entries()) {
          record.ends[i].setAttribute("cx", point?.x || 0);
          record.ends[i].setAttribute("cy", point?.y || 0);
          record.ends[i].setAttribute("fill", color);
          record.ends[i].style.display = point ? "" : "none";
        }
        record.line.setAttribute("stroke", color);
        record.line.setAttribute("stroke-dasharray", powered ? "" : "6 5");
        record.key = key;
        this.stats.wireUpdates++;
      }
    }
    drawOverlay(project, pending, hover, at) {
      const r = this.ws.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1,
        c = this.overlay;
      if (
        c.width !== Math.round(r.width * dpr) ||
        c.height !== Math.round(r.height * dpr)
      ) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const ctx = c.getContext("2d");
      if (!pending && !this.overlayActive) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      this.overlayActive = !!pending;
      if (!pending) return;
      const n = project.nodes.find((n) => n.id === pending.nodeId),
        v = [...(n?.inputs || []), ...(n?.outputs || [])].find(
          (v) => v.id === pending.portId,
        );
      if (!v) return;
      ctx.translate(project.view.panX, project.view.panY);
      ctx.scale(project.view.zoom, project.view.zoom);
      const start = E.portPosition(n, v);
      let end = at || start;
      if (hover) {
        const hn = project.nodes.find((n) => n.id === hover.nodeId),
          hp = [...hn.inputs, ...hn.outputs].find((v) => v.id === hover.portId);
        end = E.portPosition(hn, hp);
      }
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = hover
        ? E.canConnect(project, pending, hover).ok
          ? "#4ade80"
          : "#fb7185"
        : "#fbbf24";
      ctx.lineWidth = 2 / project.view.zoom;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      this.stats.overlayPaints++;
    }
  }
  return {
    Scene,
    paintNode,
    portGeometry,
    breakerButtons,
    pinColor,
    fill,
    simplify,
    crossings,
    trace,
    svgPath,
    overloadAlerts,
  };
});

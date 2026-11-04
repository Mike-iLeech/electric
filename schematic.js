(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./engine")
      : root.ElectricEngine,
    typeof module === "object" && module.exports ? require("./renderer") : root.ElectricRender,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectricSchematic = api;
})(globalThis, function (E, R) {
  "use strict";
  const number = (n) => Number(n.toFixed(2)).toLocaleString("ru-RU");
  function designations(p) {
    const counts = {},
      result = {};
    for (const n of p.nodes) {
      const prefix =
        n.category === "input"
          ? "X"
          : n.category === "distributor"
            ? "QD"
            : n.category === "consumer"
              ? "EL"
              : "XP";
      counts[prefix] = (counts[prefix] || 0) + 1;
      result[n.id] = prefix + counts[prefix];
    }
    return result;
  }
  function branches(p) {
    let supplyNumber = 0;
    const incoming = new Set(p.links.map((l) => l.to.nodeId)),
      visited = new Set(),
      result = [];
    for (const root of [
      ...p.nodes.filter((n) => !incoming.has(n.id)),
      ...p.nodes,
    ]) {
      if (visited.has(root.id)) continue;
      const ids = new Set(),
        queue = [root.id];
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        if (ids.has(id)) continue;
        ids.add(id);
        visited.add(id);
        for (const l of p.links)
          if (l.from.nodeId === id) queue.push(l.to.nodeId);
      }
      const nodes = p.nodes.filter((n) => ids.has(n.id));
      result.push({
        number: nodes.some((n) => n.category === "input") ? ++supplyNumber : null,
        project: {
          ...p,
          nodes,
          links: p.links.filter(
            (l) => ids.has(l.from.nodeId) && ids.has(l.to.nodeId),
          ),
        },
      });
    }
    return result;
  }
  function summary(p) {
    const calc = E.calculate(p),
      incoming = new Set(p.links.map((l) => l.to.nodeId)),
      groups = new Map(),
      catalog = E.catalog();
    for (const n of p.nodes.filter(
      (n) => n.category === "input" || !incoming.has(n.id),
    )) {
      const template = E.catalogTemplate(n.templateName),
        input = n.inputs[0],
        conn = input?.connType || n.supplyConnType || template?.inConnType;
      const nominal = input?.nominalA || n.supplyA,
        type = E.CONNECTORS[conn]?.name || "Тип ввода не задан",
        key = [type, nominal, n.phases].join("|");
      const row = groups.get(key) || {
        type,
        nominal,
        phases: n.phases,
        count: 0,
        watts: 0,
        capacity: nominal * p.settings.voltageLN * n.phases,
      };
      row.count++;
      row.watts += E.sum(calc.nodes.get(n.id).demandW);
      groups.set(key, row);
    }
    return {
      watts: p.nodes.reduce(
        (v, n) => v + (n.category === "consumer" ? n.consumerWatts : 0),
        0,
      ),
      consumers: p.nodes.filter((n) => n.category === "consumer").length,
      distros: p.nodes.filter((n) => n.category === "distributor").length,
      modules: p.nodes.length,
      extenders: p.nodes.filter((n) => n.category === "extender").length,
      points: [...groups.values()],
    };
  }
  function layout(p, rowsPerColumn = 2, splitFirst = true) {
    const children = new Map(p.nodes.map((n) => [n.id, []])),
      incoming = new Set();
    for (const l of p.links) {
      children.get(l.from.nodeId)?.push(l.to.nodeId);
      incoming.add(l.to.nodeId);
    }
    for (const n of p.nodes) {
      const ordered = p.links
        .filter((l) => l.from.nodeId === n.id)
        .sort(
          (a, b) =>
            n.outputs.findIndex((o) => o.id === a.from.portId) -
            n.outputs.findIndex((o) => o.id === b.from.portId),
        );
      children.set(
        n.id,
        ordered.map((l) => l.to.nodeId),
      );
    }
    const firstFork=p.nodes.find(n=>(children.get(n.id)||[]).length>1)?.id;
    const byId=new Map(p.nodes.map(n=>[n.id,n])),sizes=new Map(),poses=new Map(),seen=new Set();
    const ownHeight=n=>Math.max(160,95+Math.max(n.inputs.length,n.outputs.length)*28);
    function size(id){
      if(sizes.has(id))return sizes.get(id);
      const n=byId.get(id),kids=children.get(id)||[];
      sizes.set(id,{w:280,h:ownHeight(n),columns:[]});
      const columns=[];
      const rowCount=splitFirst && id===firstFork?1:rowsPerColumn;
      for(let i=0;i<kids.length;i+=rowCount){
        const ids=kids.slice(i,i+rowCount),rects=ids.map(size);
        columns.push({ids,w:Math.max(...rects.map(r=>r.w)),h:rects.reduce((sum,r)=>sum+r.h+100,0)-100});
      }
      const result={w:280+(columns.length?220+columns.reduce((sum,r)=>sum+r.w+120,0)-120:0),h:Math.max(ownHeight(n),...columns.map(r=>r.h)),columns};
      sizes.set(id,result);return result;
    }
    function place(id,left,top,depth){
      if(seen.has(id))return;seen.add(id);
      const n=byId.get(id),r=size(id),h=ownHeight(n);
      poses.set(id,{x:left,y:top+(r.h-h)/2,w:280,h,depth});
      let x=left+500;
      for(const column of r.columns){let y=top;for(const child of column.ids){place(child,x,y,depth+1);poses.get(child).routeTop=y; y+=size(child).h+100;}x+=column.w+120;}
    }
    let y=150;
    for(const n of p.nodes.filter(n=>!incoming.has(n.id))){place(n.id,60,y,0);y+=size(n.id).h+140;}
    for(const n of p.nodes)if(!seen.has(n.id)){place(n.id,60,y,0);y+=size(n.id).h+140;}
    if (p.nodes.some(n => n.transfer)) {
      const degrees = new Map(p.nodes.map(n => [n.id, 0]));
      for (const l of p.links) degrees.set(l.to.nodeId, degrees.get(l.to.nodeId) + 1);
      const queue = [...degrees].filter(([, degree]) => !degree).map(([id]) => id);
      const levels = new Map(queue.map(id => [id, 0]));
      const rows = new Map();
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i], depth = levels.get(id), rect = poses.get(id);
        rect.x = 60 + depth * 500;
        rect.y = rows.get(depth) || 150;
        rect.routeTop = rect.y;
        rect.depth = depth;
        rows.set(depth, rect.y + rect.h + 100);
        for (const child of children.get(id)) {
          levels.set(child, Math.max(levels.get(child) || 0, depth + 1));
          degrees.set(child, degrees.get(child) - 1);
          if (!degrees.get(child)) queue.push(child);
        }
      }
    }
    return poses;
  }
  function layoutForSheet(p,width,height,balance=100) {
    const factor=Math.min(2,Math.max(0.25,Number(balance)||100)/100); width*=factor; height/=factor;
    const candidates=[];
    let best=null,score=-Infinity;
    for(const split of [false,true])for(const rows of [1,2,3,4,6]){
      const poses=layout(p,rows,split),rects=[...poses.values()];
      const w=Math.max(600,...rects.map(r=>r.x+r.w+40))-40;
      const h=Math.max(350,...rects.map(r=>r.y+r.h+60))-60;
      const fit=Math.min(width/w,height/h);
      candidates.push({poses,fit,w});
      if(fit>score){best=poses;score=fit;}
    }
    return candidates.filter(c=>c.fit>=score*0.9).sort((a,b)=>a.w-b.w||b.fit-a.fit)[0]?.poses || best;
  }
  function connectionPaths(p, poses=layout(p)) {
    const nodes=new Map(p.nodes.map(n=>[n.id,n])),rects=[...poses.values()];
    const lanes = new Map();
    function runs(points) {
      return points.slice(1).flatMap((b,i) => {
        const a = points[i];
        if (a.x === b.x && a.y === b.y) return [];
        const horizontal = a.y === b.y;
        const axis = horizontal ? [a.x,b.x] : [a.y,b.y];
        return [{axis:horizontal ? "y" : "x", coordinate:horizontal ? a.y : a.x,
          low:Math.min(...axis), high:Math.max(...axis)}];
      });
    }
    function overlap(route) {
      return route.reduce((total, run) => total + (lanes.get(run.axis) || []).reduce((sum, other) =>
        sum + Math.max(0, 24 - Math.abs(run.coordinate - other.coordinate)) *
          Math.max(0, Math.min(run.high,other.high) - Math.max(run.low,other.low)), 0), 0);
    }
    // Keep passing conductors away from module borders; only endpoint leads
    // may enter the clearance around their own connected module.
    const moduleClearance = 24;
    function clear(points, source, target) {
      return points.slice(1).every((b, i) => {
        const a = points[i];
        if (a.x === b.x && a.y === b.y) return true;
        return rects.every(r => {
          if ((r === source && i === 0) ||
              (r === target && i === points.length - 2)) return true;
          const left = r.x - moduleClearance, right = r.x + r.w + moduleClearance;
          const top = r.y - moduleClearance, bottom = r.y + r.h + moduleClearance;
          return a.y === b.y
            ? !(a.y > top && a.y < bottom && Math.max(a.x,b.x) > left && Math.min(a.x,b.x) < right)
            : !(a.x > left && a.x < right && Math.max(a.y,b.y) > top && Math.min(a.y,b.y) < bottom);
        });
      });
    }
    function detour(start, end, source, target) {
      const first = {x:start.x + moduleClearance, y:start.y};
      const last = {x:end.x - moduleClearance, y:end.y};
      if (!clear([start, first], source, null) || !clear([last, end], null, target)) return null;
      const xs = [...new Set([first.x,last.x,...rects.flatMap(r => [r.x-moduleClearance,r.x+r.w+moduleClearance])])].sort((a,b)=>a-b);
      const ys = [...new Set([first.y,last.y,...rects.flatMap(r => [r.y-moduleClearance,r.y+r.h+moduleClearance])])].sort((a,b)=>a-b);
      const width=xs.length, begin=ys.indexOf(first.y)*width+xs.indexOf(first.x), finish=ys.indexOf(last.y)*width+xs.indexOf(last.x);
      const distances=new Map([[begin,0]]), previous=new Map(), pending=new Set([begin]);
      const point=id=>({x:xs[id%width],y:ys[Math.floor(id/width)]});
      while(pending.size){
        let id, score=Infinity;
        for(const candidate of pending){const p=point(candidate), value=distances.get(candidate)+Math.abs(p.x-last.x)+Math.abs(p.y-last.y);if(value<score){score=value;id=candidate;}}
        pending.delete(id);
        if(id===finish){const path=[];for(let key=id;key!==undefined;key=previous.get(key))path.push(point(key));return [start,...path.reverse(),end];}
        const x=id%width,y=Math.floor(id/width),a=point(id);
        for(const next of [x>0?id-1:-1,x+1<width?id+1:-1,y>0?id-width:-1,y+1<ys.length?id+width:-1]){
          if(next<0)continue;const b=point(next);
          if(!clear([a,b],null,null))continue;
          const cost=distances.get(id)+Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
          if(cost<(distances.get(next)??Infinity)){distances.set(next,cost);previous.set(next,id);pending.add(next);}
        }
      }
      return null;
    }
    return new Map(p.links.map(l=>{
      const n=nodes.get(l.from.nodeId),a=poses.get(n.id),b=poses.get(l.to.nodeId),i=n.outputs.findIndex(o=>o.id===l.from.portId);
      const start={x:a.x+a.w,y:a.y+85+i*28},end={x:b.x,y:b.y+85+28*nodes.get(l.to.nodeId).inputs.findIndex(input=>input.id===l.to.portId)};
      const lead=start.x+30+i*12,entry=end.x-30;
      const candidates=[];
      if(start.y===end.y)candidates.push([start,end]);
      const offsets = [0,-24,24,-48,48,-72,72];
      for(const mid of offsets.flatMap(offset => [lead+offset,entry+offset]).filter(x=>x>start.x && x<end.x))
        candidates.push([start,{x:mid,y:start.y},{x:mid,y:end.y},end]);
      const laneYs = new Set();
      for(const y of [b.routeTop-35-i*10,...rects.flatMap(r=>[r.y-20-i*8,r.y+r.h+20+i*8])]) {
        for (const offset of offsets)
          if (Number.isFinite(y)) laneYs.add(Math.round(y / 24) * 24 + offset);
      }
      for (const laneY of laneYs)
        candidates.push([start,{x:lead,y:start.y},{x:lead,y:laneY},{x:entry,y:laneY},{x:entry,y:end.y},end]);
      const length=points=>points.slice(1).reduce((sum,b,i)=>sum+Math.abs(b.x-points[i].x)+Math.abs(b.y-points[i].y)+15,0);
      let best;
      for (const points of candidates.sort((a,b)=>length(a)-length(b))) {
        if (!clear(points, a, b)) continue;
        const route = runs(points);
        const penalty = overlap(route);
        if (!best || penalty < best.penalty) best = {points, route, penalty};
        if (penalty === 0) break;
      }
      if (!best) {
        const points = detour(start, end, a, b);
        if (points) best = {points, route:runs(points), penalty:0};
      }
      const points = best?.points;
      if(!points)throw Error('Не найден маршрут печатной схемы: '+l.id);
      for (const run of best.route) {
        if (!lanes.has(run.axis)) lanes.set(run.axis, []);
        lanes.get(run.axis).push(run);
      }
      return [l.id,points];
    }));
  }
  function cableRows(p, labels = designations(p)) {
    const calc = E.calculate({...p, settings:{...p.settings, advancedMode:true}});
    const ix = E.indexes(p);
    const rows = new Map();
    const format = new Intl.NumberFormat("ru-RU", {maximumFractionDigits:2});
    const types = {input:"Ввод", distributor:"Дистрибьютор", consumer:"Потребитель"};
    const deviceType = node => types[node.category] || (node.transition ? "Переход" : "Удлинитель");
    const connectors = {cee1:"CEE", cee3:"CEE", euro:"Schuko", powercon:"TRUE1", terminal1:"Клеммы", terminal3:"Клеммы"};
    const portLabel = (port, index) =>
      `${connectors[port.connType] || port.connType} ${port.nominalA}А ${port.phases}P · №${index + 1}`;
    const orderedLinks = new Map();
    for (const branch of branches(p)) {
      const outgoing = new Map();
      const incoming = new Set();
      for (const link of branch.project.links) {
        if (!outgoing.has(link.from.nodeId)) outgoing.set(link.from.nodeId, []);
        outgoing.get(link.from.nodeId).push(link);
        incoming.add(link.to.nodeId);
      }
      const queue = branch.project.nodes.filter(node => !incoming.has(node.id)).map(node => node.id);
      const visited = new Set();
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        if (visited.has(id)) continue;
        visited.add(id);
        const ports = ix.nodes.get(id).outputs.map(port => port.id);
        const links = outgoing.get(id) || [];
        links.sort((a, b) => ports.indexOf(a.from.portId) - ports.indexOf(b.from.portId));
        for (const link of links) {
          orderedLinks.set(link.id, link);
          queue.push(link.to.nodeId);
        }
      }
    }
    for (const link of orderedLinks.values()) {
      const out = ix.ports.get(link.from.portId).port;
      const inlet = ix.ports.get(link.to.portId).port;
      const cable = E.cableParameters(link, out, inlet);
      const estimate = E.cableEstimate(cable, out.phases, calc.ports.get(out.id).loadA);
      const length = cable.lengthM > 0 ? format.format(cable.lengthM) + " м" : "—";
      rows.set(link.id, {
        id: "К" + String(rows.size + 1).padStart(2, "0"),
        source: labels[link.from.nodeId],
        sourceType: deviceType(ix.nodes.get(link.from.nodeId)),
        output: portLabel(out, ix.nodes.get(link.from.nodeId).outputs.indexOf(out)),
        target: labels[link.to.nodeId],
        targetType: deviceType(ix.nodes.get(link.to.nodeId)),
        input: portLabel(inlet, ix.nodes.get(link.to.nodeId).inputs.indexOf(inlet)),
        outputConnector: out.connType,
        inputConnector: inlet.connType,
        voltage: (() => {
          const receiver = calc.nodes.get(link.to.nodeId);
          const active = receiver.powered && calc.activeInputs.get(link.to.nodeId)?.id === link.id;
          return active ? format.format(receiver.voltageLN * (inlet.phases === 3 ? Math.sqrt(3) : 1)) : "0";
        })(),
        load: format.format(E.sum(calc.ports.get(out.id).loadW)),
        conductors: `${out.phases}P+1N+1PE`,
        section: cable.sectionMm2 == null ? "—" : format.format(cable.sectionMm2) + " мм²",
        length,
        drop: estimate ? "ΔU" + (estimate.lineVoltage ? "л" : "ф") + " " + format.format(estimate.dropV) + " В" : "—",
        loss: estimate ? "ΔP " + format.format(estimate.lossW) + " Вт" : "—",
      });
    }
    return rows;
  }
  function render(p, options = {}) {
    const poses = options.layoutWidth && options.layoutHeight
      ? layoutForSheet(p,options.layoutWidth,options.layoutHeight,options.layoutBalance) : layout(p);
    const
      s = summary(p),
      footer = Math.max(490, 310 + s.points.length * 28),
      width = Math.max(1600, ...[...poses.values()].map((r) => r.x + r.w + 60)),
      diagramBottom = Math.max(
        350,
        ...[...poses.values()].map((r) => r.y + r.h + 60),
      ),
      fullHeight = diagramBottom + footer;
    const left = options.diagramOnly ? 40 : 0,
      top = options.diagramOnly ? 60 : 0;
    const drawingWidth = options.diagramOnly
      ? Math.max(600, ...[...poses.values()].map((r) => r.x + r.w + 40)) - left
      : width;
    const height = options.diagramOnly ? diagramBottom - top : fullHeight;
    if (options.measureOnly) return { width: drawingWidth, height };
    const scale =
        options.renderScale ??
        Math.min(
          2,
          12000 / drawingWidth,
          12000 / height,
          Math.sqrt(24000000 / (drawingWidth * height)),
        ),
      canvas = options.context ? {} : document.createElement("canvas");
    canvas.width = Math.ceil(drawingWidth * scale);
    canvas.height = Math.ceil(height * scale);
    const c = options.context || canvas.getContext("2d");
    c.scale(scale, scale);
    c.translate(-left, -top);
    c.fillStyle = "#fff";
    c.fillRect(left, top, drawingWidth, height);
    c.strokeStyle = "#111";
    c.fillStyle = "#111";
    c.lineWidth = 1.5;
    function line(x, y, x2, y2) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x2, y2);
      c.stroke();
    }
    function text(t, x, y, size = 19) {
      c.font = `${size}px OpenGOST, sans-serif`;
      c.fillText(String(t), x, y);
    }
    function wrap(t, x, y, max, size = 19) {
      c.font = `${size}px OpenGOST, sans-serif`;
      let row = "";
      for (const word of String(t).split(/\s+/)) {
        if (row && c.measureText(row + " " + word).width > max) {
          text(row, x, y, size);
          y += size + 4;
          row = word;
        } else row += (row ? " " : "") + word;
      }
      if (row) text(row, x, y, size);
      return y + size + 4;
    }
    function circle(x, y, r) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.stroke();
    }
    if (!options.diagramOnly) {
      c.strokeRect(20, 20, width - 40, height - 40);
      text("СХЕМА ЭЛЕКТРИЧЕСКАЯ ОДНОЛИНЕЙНАЯ", 50, 55, 28);
      text(
        `${p.settings.voltageLN} / ${number(p.settings.voltageLN * Math.sqrt(3))} В; 50 Гц; cos φ = 1`,
        50,
        85,
        20,
      );
    }
    const labels = new Map(),
      counts = {};
    for (const n of p.nodes) {
      const prefix =
        n.category === "input"
          ? "X"
          : n.category === "distributor"
            ? "QD"
            : n.category === "consumer"
              ? "EL"
              : "XP";
      counts[prefix] = (counts[prefix] || 0) + 1;
      labels.set(n.id, prefix + counts[prefix]);
    }
    if (options.designations)
      for (const n of p.nodes)
        labels.set(n.id, options.designations[n.id] || labels.get(n.id));
    const outAt = (n, port) => {
      const r = poses.get(n.id),
        i = n.outputs.findIndex((v) => v.id === port);
      return { x: r.x + r.w, y: r.y + 85 + i * 28 };
    };
    const paths = connectionPaths(p, poses);
    for (const branch of branches(p)) {
      if (!branch.project.nodes.some(node => node.category === "input")) continue;
      const frames = branch.project.nodes.map(node => poses.get(node.id));
      const points = branch.project.links.flatMap(link => paths.get(link.id) || []);
      const leftEdge = Math.max(left + 2, Math.min(...frames.map(r => r.x), ...points.map(pt => pt.x)) - 16);
      const rightEdge = Math.min(left + drawingWidth - 2, Math.max(...frames.map(r => r.x + r.w), ...points.map(pt => pt.x)) + 16);
      const upperEdge = Math.max(top + 24, Math.min(...frames.map(r => r.y), ...points.map(pt => pt.y)) - 22);
      const lowerEdge = Math.min(diagramBottom - 2, Math.max(...frames.map(r => r.y + r.h), ...points.map(pt => pt.y)) + 16);
      for (let x = leftEdge; x < rightEdge; x += 14) {
        line(x, upperEdge, Math.min(x + 8, rightEdge), upperEdge);
        line(x, lowerEdge, Math.min(x + 8, rightEdge), lowerEdge);
      }
      for (let y = upperEdge; y < lowerEdge; y += 14) {
        line(leftEdge, y, leftEdge, Math.min(y + 8, lowerEdge));
        line(rightEdge, y, rightEdge, Math.min(y + 8, lowerEdge));
      }
      text("Ветка №" + (options.branchNumber || branch.number), leftEdge + 8, upperEdge - 5, 56);
    }
    for (const {points,hits} of R.crossings(paths).values()) {
      // A thin white clearance separates bridge arcs from the crossed conductor.
      R.trace(c,points,hits); c.strokeStyle="#fff";c.lineWidth=4;c.stroke();
      R.trace(c,points,hits); c.strokeStyle="#111";c.lineWidth=1.5;c.stroke();
    }
    for (const n of p.nodes) {
      const r = poses.get(n.id),
        x = r.x,
        y = r.y;
      c.fillStyle = "#fff";
      c.fillRect(x, y, r.w, r.h);
      c.strokeRect(x, y, r.w, r.h);
      c.fillStyle = "#111";
      text(labels.get(n.id), x + 10, y + 20, 22);
      const nameParts = E.nomenclature(n, n.category === "distributor" ? {connectors:true,compactConnectors:true} : {}).split(" | ");
      function shortText(value, tx, ty, max, size) {
        c.font = `${size}px OpenGOST`;
        while (c.measureText(value).width > max && size > 9) {
          size -= 0.5;
          c.font = `${size}px OpenGOST`;
        }
        if (c.measureText(value).width > max) {
          while (value.length && c.measureText(value + "...").width > max)
            value = value.slice(0, -1);
          value = value ? value + "..." : "";
        }
        text(value, tx, ty, size);
      }
      shortText(nameParts[0], x + 65, y + 20, 205, 18);
      shortText(nameParts[1], x + 10, y + 41, 260, 14);
      if (n.category === "distributor" && /→|->/.test(nameParts[2])) {
        const [input, output] = nameParts[2].split(/→|->/);
        shortText(input.trim(), x + 10, y + 62, 101, 13);
        const arrowX = x + 16 + c.measureText(input.trim()).width;
        line(arrowX,y + 58,arrowX + 16,y + 58);
        line(arrowX + 12,y + 54,arrowX + 16,y + 58);
        line(arrowX + 12,y + 62,arrowX + 16,y + 58);
        shortText(output.trim(), arrowX + 22, y + 62, x + 270 - arrowX - 22, 13);
      } else if (n.category !== "extender")
        shortText(nameParts[2], x + 10, y + 62, 260, 13);
      if (n.category === "extender") {
        const short = {
            terminal1: "Концы P+N+PE",
            terminal3: "Концы 3P+N+PE",
            cee1: "CEE P+N+PE",
            cee3: "CEE 3P+N+PE",
            euro: "Schuko",
            powercon: "TRUE1",
          },
          input = n.inputs[0],
          out = n.outputs[0];
        const inputLabel = `${short[input?.connType] || "Вход"} ${input?.nominalA || ""} А`;
        text(
          inputLabel,
          x + 10,
          y + 62,
          13,
        );
        const arrowX = x + 16 + c.measureText(inputLabel).width;
        line(arrowX, y + 58, arrowX + 16, y + 58);
        line(arrowX + 16, y + 58, arrowX + 12, y + 54);
        line(arrowX + 16, y + 58, arrowX + 12, y + 62);
        shortText(
          `${n.outputs.length > 1 ? n.outputs.length + "x " : ""}${short[out?.connType] || "Выход"} ${out?.nominalA || ""} А`,
          arrowX + 22,
          y + 62,
          x + 270 - arrowX - 22,
          13,
        );
      }
      const cy = y + 85;
      if (n.category === "consumer") {
        line(x, cy, x + 35, cy);
        circle(x + 50, cy, 15);
        line(x + 40, cy - 10, x + 60, cy + 10);
        line(x + 40, cy + 10, x + 60, cy - 10);
        text(`${number(n.consumerWatts / 1000)} кВт`, x + 80, cy + 5, 21);
        text(
          `${n.phases}ф; ${E.CONNECTORS[n.inputs[0]?.connType]?.name || ""} ${n.inputs[0]?.nominalA || ""} А`,
          x + 10,
          y + r.h - 20,
          17,
        );
      } else {
        line(x, cy, x + 35, cy);
        if (n.transfer) {
          line(x, cy + 28, x + 35, cy + 28);
          circle(x + 35, cy + 28, 3);
          line(x + 35, cy + 28, x + 51, cy + 14);
          text("АВР", x + 55, cy + 32, 14);
        }
        if (n.category === "input") {
          circle(x + 50, cy, 14);
          text("~", x + 41, cy + 7, 24);
        } else if (n.mainBreaker) {
          line(x + 35, cy, x + 53, cy - 13);
          circle(x + 57, cy, 2);
          if (n.mainBreaker.state === "closed") line(x + 35, cy, x + 65, cy);
          text(`QF ${n.mainBreaker.curve}${n.mainBreaker.ratingA}${n.mainBreaker.state === "closed" ? "" : " ОТКЛ"}`, x + 12, cy + 16, 13);
        } else if (n.category === "extender")
          c.strokeRect(x + 35, cy - 10, 30, 20);
        else line(x + 35, cy, x + 65, cy);
        line(x + 65, cy, x + 100, cy);
        line(
          x + 100,
          cy,
          x + 100,
          y + 85 + Math.max(0, n.outputs.length - 1) * 28,
        );
        for (const o of n.outputs) {
          const at = outAt(n, o.id);
          line(x + 100, at.y, x + 140, at.y);
          if (o.breaker) {
            line(x + 140, at.y, x + 157, at.y - 10);
            if (o.breaker.state === "closed")
              line(x + 140, at.y, x + 162, at.y);
            line(x + 162, at.y, at.x, at.y);
          } else line(x + 140, at.y, at.x, at.y);
          circle(at.x, at.y, 3);
          text(
            `${o.breaker ? "QF " + o.breaker.curve + o.breaker.ratingA + (o.breaker.state === "closed" ? "; " : " ОТКЛ; ") : ""}${o.nominalA} А${o.phase ? " " + o.phase : ""}`,
            x + 163,
            at.y - 7,
            15,
          );
        }
        text(
          `${n.phases}ф; ввод ${n.inputs[0]?.nominalA || n.supplyA} А${n.mainBreaker ? "; QF " + n.mainBreaker.curve + n.mainBreaker.ratingA : ""}`,
          x + 10,
          y + r.h - 12,
          17,
        );
      }
    }
    const heightLimit = height;
    const cables = options.cables || cableRows(p);
    const occupied = [...poses.values()];
    const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x &&
      a.y < b.y + b.h && a.y + a.h > b.y;
    const segments = [...paths.values()].flatMap(points => points.slice(1).map((b, i) => {
      const a = points[i];
      return {a, b, length:Math.abs(a.x - b.x) + Math.abs(a.y - b.y)};
    }));
    const wires = segments.map(({a,b}) => ({
      x:Math.min(a.x,b.x)-3, y:Math.min(a.y,b.y)-3,
      w:Math.abs(a.x-b.x)+6, h:Math.abs(a.y-b.y)+6,
    }));
    for (const [id, points] of paths) {
      const cable = cables.get(id);
      if (!cable) continue;
      c.font = "12px OpenGOST, sans-serif";
      const width = c.measureText(cable.id).width;
      const first = points[0], last = points.at(-1);
      for (const [x,y] of [[first.x+4,first.y-6],[last.x-width-4,last.y-6]]) {
        text(cable.id,x,y,12);
        occupied.push({x:x-2,y:y-13,w:width+4,h:15});
      }
    }
    for (const [id, points] of paths) {
      const cable = cables.get(id);
      if (!cable || cable.length === "—") continue;
      const parts = [cable.id + " · " + cable.length, cable.drop, cable.loss].filter(value => value !== "—");
      const candidates = points.slice(1).map((b,i) => {
        const a = points[i];
        return {a,b,length:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)};
      }).sort((a,b)=>b.length-a.length);
      c.font = "13px OpenGOST, sans-serif";
      let placed = false;
      for (const lines of [[parts.join(" · ")],parts]) {
        const width = Math.max(...lines.map(value=>c.measureText(value).width));
        const height = lines.length * 15;
        for (const {a,b,length} of candidates) {
          if (length < width + 8) continue;
          const horizontal = a.y === b.y;
          for (const fraction of [.5,.3,.7,.15,.85]) {
            const cx = a.x+(b.x-a.x)*fraction, cy = a.y+(b.y-a.y)*fraction;
            for (const side of [-1,1]) {
              const box = horizontal
                ? {x:cx-width/2-3,y:cy+(side<0?-height-6:6),w:width+6,h:height}
                : {x:cx+(side<0?-height-6:6),y:cy-width/2-3,w:height,h:width+6};
              const along = horizontal ? box.x : box.y;
              const start = horizontal ? Math.min(a.x,b.x) : Math.min(a.y,b.y);
              if (along < start || along + width + 6 > start + length ||
                  box.x < left || box.y < top || box.x+box.w > left+drawingWidth ||
                  box.y+box.h > top+heightLimit || occupied.some(other=>overlaps(box,other)) ||
                  wires.some(other=>overlaps(box,other))) continue;
              occupied.push(box);
              const {x,y,w,h} = box;
              const radius = Math.min(6, w / 2, h / 2);
              const previousWidth = c.lineWidth;
              c.lineWidth = .45;
              c.beginPath();
              c.moveTo(x+radius,y);
              c.lineTo(x+w-radius,y);
              c.bezierCurveTo(x+w,y,x+w,y,x+w,y+radius);
              c.lineTo(x+w,y+h-radius);
              c.bezierCurveTo(x+w,y+h,x+w,y+h,x+w-radius,y+h);
              c.lineTo(x+radius,y+h);
              c.bezierCurveTo(x,y+h,x,y+h,x,y+h-radius);
              c.lineTo(x,y+radius);
              c.bezierCurveTo(x,y,x,y,x+radius,y);
              c.stroke();
              if (horizontal) {
                const edge = side < 0 ? y+h : y;
                line(cx, edge, cx, cy);
              } else {
                const edge = side < 0 ? x+w : x;
                line(edge, cy, cx, cy);
              }
              c.lineWidth = previousWidth;
              lines.forEach((value,i)=>{
                if (horizontal) c.fillText(value,box.x+3,box.y+12+i*15);
                else {
                  const x=box.x+12+i*15, y=box.y+box.h-3;
                  if (c.fillVerticalText) c.fillVerticalText(value,x,y);
                  else if (c.rotate) {
                    c.save(); c.translate(x,y); c.rotate(-Math.PI/2);
                    c.fillText(value,0,0); c.restore();
                  }
                }
              });
              placed = true;
              break;
            }
            if (placed) break;
          }
          if (placed) break;
        }
        if (placed) break;
      }
    }
    if (options.diagramOnly) return canvas;
    const fy = diagramBottom;
    line(20, fy, width - 20, fy);
    text("ПОЯСНЕНИЯ И ПОТРЕБНОСТЬ В ПОДКЛЮЧЕНИЯХ", 45, fy + 32, 23);
    text(
      `1. Общая установленная потребляемая мощность: ${number(s.watts / 1000)} кВт`,
      45,
      fy + 65,
      21,
    );
    text(
      `2. Требуемые внешние точки подключения (включая неподключённые ветви):`,
      45,
      fy + 95,
      20,
    );
    let rowY = fy + 127;
    for (const point of s.points) {
      text(
        `${point.type}; ${point.phases}ф ${point.nominal} А; ${number(point.capacity / 1000)} кВт/точка; ${point.count} шт.; нагрузка ${number(point.watts / 1000)} кВт`,
        55,
        rowY,
        18,
      );
      rowY += 28;
    }
    if (!s.points.length) {
      text("Точки подключения отсутствуют", 55, rowY, 18);
      rowY += 28;
    }
    text(
      `3. Всего модулей: ${s.modules}; потребителей: ${s.consumers}; дистрибьюторов: ${s.distros}; переходов/удлинителей: ${s.extenders}`,
      45,
      rowY + 10,
      20,
    );
    text(
      "Мощность — сумма заданных нагрузок. Для трасс с заданной длиной указаны расчётные ΔU и ΔP.",
      45,
      rowY + 40,
      17,
    );
    const legendY = Math.max(rowY + 72, height - 235);
    text("УСЛОВНЫЕ ОБОЗНАЧЕНИЯ", 45, legendY, 22);
    const entries = [
      ["source", "X — ввод / источник"],
      ["consumer", "EL — потребитель"],
      ["distro", "QD — распределитель"],
      ["extender", "XP — переход / удлинитель"],
      ["breaker", "QF — автомат"],
      ["port", "Порт подключения"],
      ["line", "Электрическая связь"],
      ["box", "Граница устройства"],
    ];
    entries.forEach(([kind, label], i) => {
      const x = 55 + (i % 2) * 440,
        y = legendY + 34 + Math.floor(i / 2) * 35;
      if (kind === "source") {
        circle(x + 18, y - 5, 12);
        text("~", x + 11, y + 1, 19);
      }
      if (kind === "consumer") {
        circle(x + 18, y - 5, 12);
        line(x + 10, y - 13, x + 26, y + 3);
        line(x + 10, y + 3, x + 26, y - 13);
      }
      if (kind === "distro") {
        line(x + 10, y - 18, x + 10, y + 8);
        for (const yy of [y - 16, y - 5, y + 6]) line(x + 10, yy, x + 35, yy);
      }
      if (kind === "extender") {
        line(x, y - 5, x + 7, y - 5);
        c.strokeRect(x + 7, y - 15, 25, 20);
        line(x + 32, y - 5, x + 40, y - 5);
      }
      if (kind === "breaker") {
        line(x, y - 5, x + 12, y - 5);
        line(x + 12, y - 5, x + 27, y - 17);
        circle(x + 29, y - 5, 2);
        line(x + 31, y - 5, x + 40, y - 5);
      }
      if (kind === "port") {
        line(x, y - 5, x + 30, y - 5);
        circle(x + 32, y - 5, 4);
      }
      if (kind === "line") line(x, y - 5, x + 40, y - 5);
      if (kind === "box") c.strokeRect(x, y - 18, 40, 25);
      text(label, x + 55, y, 18);
    });
    text("А — номинальный ток; L1/L2/L3 — фаза.", 45, legendY + 178, 17);
    const stampW = 560,
      stampX = width - stampW - 30,
      stampY = height - 125;
    c.clearRect(stampX, stampY, stampW, 100);
    c.fillStyle = "#fff";
    c.fillRect(stampX, stampY, stampW, 100);
    c.fillStyle = "#111";
    c.strokeRect(stampX, stampY, stampW, 100);
    line(stampX, stampY + 40, width - 30, stampY + 40);
    wrap(p.meta.name, stampX + 12, stampY + 26, stampW - 24, 22);
    text(
      "Разработал: " + (options.designer || p.meta.designer || "Не указан"),
      stampX + 12,
      stampY + 67,
      19,
    );
    text(
      "Дата: " +
        (options.date ||
          p.meta.drawingDate ||
          new Date().toLocaleDateString("ru-RU")),
      stampX + 12,
      stampY + 91,
      19,
    );
    text(
      `ЭОМ · Э3 · Лист ${options.pageIndex || 1}/${options.pageCount || 1}`,
      width - 235,
      stampY + 91,
      18,
    );
    return canvas;
  }
  return { cableRows, summary, layout, layoutForSheet, connectionPaths, render, branches, designations };
});

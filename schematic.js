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
      result.push({
        number: result.length + 1,
        project: {
          ...p,
          nodes: p.nodes.filter((n) => ids.has(n.id)),
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
    const ownHeight=n=>Math.max(160,95+n.outputs.length*28);
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
      const result={w:280+(columns.length?180+columns.reduce((sum,r)=>sum+r.w+100,0)-100:0),h:Math.max(ownHeight(n),...columns.map(r=>r.h)),columns};
      sizes.set(id,result);return result;
    }
    function place(id,left,top,depth){
      if(seen.has(id))return;seen.add(id);
      const n=byId.get(id),r=size(id),h=ownHeight(n);
      poses.set(id,{x:left,y:top+(r.h-h)/2,w:280,h,depth});
      let x=left+460;
      for(const column of r.columns){let y=top;for(const child of column.ids){place(child,x,y,depth+1);poses.get(child).routeTop=y; y+=size(child).h+100;}x+=column.w+100;}
    }
    let y=150;
    for(const n of p.nodes.filter(n=>!incoming.has(n.id))){place(n.id,60,y,0);y+=size(n.id).h+140;}
    for(const n of p.nodes)if(!seen.has(n.id)){place(n.id,60,y,0);y+=size(n.id).h+140;}
    return poses;
  }
  function layoutForSheet(p,width,height,balance=100) {
    const factor=Math.min(2,Math.max(0.25,Number(balance)||100)/100); width*=factor; height/=factor;
    const candidates=[];
    let best=null,score=-Infinity;
    for(const split of [false,true])for(const rows of [1,2,3,4,6]){
      const poses=layout(p,rows,split),rects=[...poses.values()];
      const w=Math.max(600,...rects.map(r=>r.x+r.w+40))-40;
      const h=Math.max(350,...rects.map(r=>r.y+r.h+60))-95;
      const fit=Math.min(width/w,height/h);
      candidates.push({poses,fit,w});
      if(fit>score){best=poses;score=fit;}
    }
    return candidates.filter(c=>c.fit>=score*0.9).sort((a,b)=>a.w-b.w||b.fit-a.fit)[0]?.poses || best;
  }
  function connectionPaths(p, poses=layout(p)) {
    const nodes=new Map(p.nodes.map(n=>[n.id,n])),rects=[...poses.values()];
    function clear(points){return points.slice(1).every((b,i)=>{const a=points[i];return rects.every(r=>a.y===b.y ? !(a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w) : !(a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h));});}
    return new Map(p.links.map(l=>{
      const n=nodes.get(l.from.nodeId),a=poses.get(n.id),b=poses.get(l.to.nodeId),i=n.outputs.findIndex(o=>o.id===l.from.portId);
      const start={x:a.x+a.w,y:a.y+85+i*28},end={x:b.x,y:b.y+85};
      const lead=start.x+30+i*12,entry=end.x-30;
      const candidates=[];
      if(start.y===end.y)candidates.push([start,end]);
      for(const mid of [lead,entry])candidates.push([start,{x:mid,y:start.y},{x:mid,y:end.y},end]);
      for(const y of [b.routeTop-35-i*10,...rects.flatMap(r=>[r.y-20-i*8,r.y+r.h+20+i*8])]) {
        candidates.push([start,{x:lead,y:start.y},{x:lead,y},{x:entry,y},{x:entry,y:end.y},end]);
      }
      const length=points=>points.slice(1).reduce((sum,b,i)=>sum+Math.abs(b.x-points[i].x)+Math.abs(b.y-points[i].y)+15,0);
      const points=candidates.filter(clear).sort((a,b)=>length(a)-length(b))[0];
      if(!points)throw Error('Не найден маршрут печатной схемы: '+l.id);
      return [l.id,points];
    }));
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
      top = options.diagramOnly ? 95 : 0;
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
    for (const branch of branches(p)) {
      const bounds = branch.project.nodes.map((n) => poses.get(n.id));
      text(
        `Ветка №${options.branchNumber || branch.number}`,
        60,
        Math.min(...bounds.map((r) => r.y)) - 22,
        24,
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
      const nameParts = E.nomenclature(n).split(" | ");
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
      if (n.category !== "extender")
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
        text(
          `${short[input?.connType] || "Вход"} ${input?.nominalA || ""} А`,
          x + 10,
          y + 62,
          13,
        );
        line(x + 120, y + 58, x + 151, y + 58);
        line(x + 151, y + 58, x + 144, y + 53);
        line(x + 151, y + 58, x + 144, y + 63);
        text(
          `${n.outputs.length > 1 ? n.outputs.length + "x " : ""}${short[out?.connType] || "Выход"} ${out?.nominalA || ""} А`,
          x + 160,
          y + 62,
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
        if (n.category === "input") {
          circle(x + 50, cy, 14);
          text("~", x + 41, cy + 7, 24);
        } else if (n.mainBreaker) {
          line(x + 35, cy, x + 53, cy - 13);
          circle(x + 57, cy, 2);
          if (n.mainBreaker.state === "closed") line(x + 35, cy, x + 65, cy);
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
      "Мощность — сумма заданных нагрузок, независимо от состояния автоматов. Кабельный расчёт не выполняется.",
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
  return { summary, layout, layoutForSheet, connectionPaths, render, branches, designations };
});

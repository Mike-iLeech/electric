(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./schematic")
      : root.ElectricSchematic,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectricSheet = api;
})(globalThis, function (S) {
  "use strict";
  const mm = 72 / 25.4;
  const fmt = (n) => Number(n.toFixed(2)).toLocaleString("ru-RU");
  function geometry(pw, ph, p) {
    const frame = { x: 20 * mm, y: 5 * mm, w: pw - 25 * mm, h: ph - 10 * mm };
    const stamp = {
      x: frame.x + frame.w - 185 * mm,
      y: frame.y + frame.h - 55 * mm,
      w: 185 * mm,
      h: 55 * mm,
    };
    const gap=5*mm,sideWidth=stamp.x-frame.x-3*gap;
    const side=sideWidth>=70*mm;
    // A3 is the reference size; smaller sheets shrink the entire notes block.
    const notesScale=Math.min(1,(Math.min(pw,ph)/(297*mm)) ** 2);
    const notesWidth=Math.min(125*mm*notesScale,side?sideWidth:frame.w-2*gap);
    const h=notesWidth*4/5;
    const notes={x:frame.x+gap,y:side?frame.y+frame.h-gap-h:stamp.y-gap-h,
      w:notesWidth,h,requiredHeight:(76+Math.max(0,S.summary(p).points.length-1)*5.5)*mm,narrow:false};
    const drawing = {
      x: frame.x + 5 * mm,
      y: frame.y + 18 * mm,
      w: frame.w - 10 * mm,
      h: Math.max(30 * mm, Math.min(notes.y, stamp.y) - frame.y - 22 * mm),
    };
    return { frame, stamp, notes, drawing };
  }
  const journalHeaders = ["№ трассы", "Источник", "Тип источника", "Выход · разъём", "Потребитель", "Тип потребителя", "Вход · разъём", "Состав жил", "Сечение жилы", "Длина линии", "Падение ΔU", "Напряжение, В", "Потери ΔP", "Фактическая нагрузка, Вт"];
  function journalRows(cables) {
    return [journalHeaders, ...cables.map(cable => [cable.id,cable.source,cable.sourceType,cable.output,cable.target,cable.targetType,cable.input,cable.conductors,cable.section,cable.length,cable.drop,cable.voltage,cable.loss,cable.load])];
  }
  function journalWidths(cables, c) {
    c.font = `${3 * mm}px OpenGOST, sans-serif`;
    const rows = journalRows(cables);
    return journalHeaders.map((_, col) => 1.2 * Math.max(...rows.map(row => c.measureText(String(row[col])).width)) + ([3,6].includes(col) ? 14 : 0));
  }
  function draw(plan, c) {
    const { frame: f, stamp: b, notes: n } = plan.sheet,
      p = plan.project,
      s = S.summary(p),
      o = plan.options;
    c.fillStyle = "#111";
    c.strokeStyle = "#111";
    c.lineWidth = 0.5 * mm;
    const line = (x, y, x2, y2) => {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x2, y2);
      c.stroke();
    };
    const text = (t, x, y, size = 2.5) => {
      c.font = `${size * mm}px OpenGOST, sans-serif`;
      c.fillText(String(t), x, y);
    };
    function fit(t, x, y, w, size = 2.5) {
      let value = String(t),
        font = size;
      for (; font > 1.7; font -= 0.1) {
        c.font = `${font * mm}px OpenGOST, sans-serif`;
        if (c.measureText(value).width <= w) break;
      }
      if (c.measureText(value).width > w) {
        while (value.length && c.measureText(value + "...").width > w)
          value = value.slice(0, -1);
        value = value ? value + "..." : "";
      }
      text(value, x, y, font);
    }
    function lines(t, x, y, w, size = 3, max = 4) {
      let row = "",
        rows = [];
      c.font = `${size * mm}px OpenGOST, sans-serif`;
      for (const word of String(t).split(/\s+/)) {
        if (row && c.measureText(row + " " + word).width > w) {
          rows.push(row);
          row = word;
        } else row += (row ? " " : "") + word;
      }
      if (row) rows.push(row);
      rows
        .slice(0, max)
        .forEach((r, i) => fit(r, x, y + i * (size + 0.7) * mm, w, size));
    }
    c.strokeRect(f.x, f.y, f.w, f.h);
    text("СХЕМА ЭЛЕКТРИЧЕСКАЯ ОДНОЛИНЕЙНАЯ", f.x + 5 * mm, f.y + 6 * mm, 3.5);
    text(
      `${p.settings.voltageLN} / ${fmt(p.settings.voltageLN * Math.sqrt(3))} В; 50 Гц; cos φ = 1`,
      f.x + 5 * mm,
      f.y + 12 * mm,
      2.5,
    );
    c.strokeRect(b.x, b.y, b.w, b.h);
    c.lineWidth = 0.18 * mm;
    const L = (x, y, x2, y2) =>
      line(b.x + x * mm, b.y + y * mm, b.x + x2 * mm, b.y + y2 * mm);
    for (const x of [7, 17, 40, 55, 65]) L(x, 0, x, 55);
    for (const y of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) L(0, y, 65, y);
    L(65, 15, 185, 15);
    L(65, 35, 185, 35);
    L(135, 15, 135, 55);
    L(135, 20, 185, 20);
    L(135, 40, 185, 40);
    for (const x of [140, 145, 150]) L(x, 20, x, 35);
    L(150, 15, 150, 35);
    L(167, 15, 167, 35);
    L(155, 35, 155, 40);
    L(175, 0, 175, 15);
    L(175, 5, 185, 5);
    const labels = [
      ["Изм.", 0, 7],
      ["Лист", 7, 10],
      ["№ докум.", 17, 23],
      ["Подп.", 40, 15],
      ["Дата", 55, 10],
    ];
    for (const [label, x, w] of labels)
      fit(label, b.x + (x + 0.5) * mm, b.y + 23.5 * mm, (w - 1) * mm, 2.5);
    const roles = ["Разраб.", "Пров.", "Т. контр.", "", "Н. контр.", "Утв."];
    roles.forEach((role, i) =>
      fit(role, b.x + 0.7 * mm, b.y + (28.5 + i * 5) * mm, 16 * mm, 2.5),
    );
    // Role/name cells share the first two columns below the change table.
    c.fillStyle = "#fff";
    c.fillRect(b.x + 0.2 * mm, b.y + 25.2 * mm, 16.6 * mm, 29.6 * mm);
    c.fillStyle = "#111";
    for (const y of [30, 35, 40, 45, 50]) L(0, y, 17, y);
    roles.forEach((role, i) =>
      fit(role, b.x + 0.7 * mm, b.y + (28.5 + i * 5) * mm, 16 * mm, 2.5),
    );
    const signatories = [p.meta.designer, p.meta.checkedBy, p.meta.technicalControlBy,
      p.meta.additionalBy, p.meta.standardsControlBy, p.meta.approvedBy];
    signatories.forEach((name, i) => {
      if (name) fit(name, b.x + 17.7 * mm, b.y + (28.5 + i * 5) * mm, 21.5 * mm, 2.5);
    });
    const date = p.meta.drawingDate || new Date().toLocaleDateString("sv-SE"),
      dateText = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date.split("-").reverse().join(".")
        : date;
    signatories.forEach((name, i) => {
      if (name) fit(dateText, b.x + 55.4 * mm, b.y + (28.5 + i * 5) * mm, 9.2 * mm, 2.3);
    });
    fit(p.meta.designation || "Э3", b.x + 68 * mm, b.y + 10 * mm, 104 * mm, 5);
    text("Вер.", b.x + 175.7 * mm, b.y + 3.7 * mm, 2.5);
    if (p.meta.revision)
      fit(p.meta.revision, b.x + 176 * mm, b.y + 11 * mm, 8 * mm, 2.5);
    lines(
      p.meta.drawingTitle || p.meta.name + " — Схема электрическая однолинейная",
      b.x + 67 * mm,
      b.y + 20 * mm,
      66 * mm,
      3.5,
      4,
    );
    for (const [t, x, w] of [
      ["Лит.", 135, 15],
      ["Масса", 150, 17],
      ["Масштаб", 167, 18],
    ])
      fit(t, b.x + (x + 1) * mm, b.y + 18.5 * mm, (w - 2) * mm, 2.5);
    fit(
      (Number(o.scale) || 100) + "%",
      b.x + 168 * mm,
      b.y + 28 * mm,
      16 * mm,
      3,
    );
    fit(
      "Лист " + ((o.pageCount || 1) > 1 ? (o.pageIndex || 1) : ""),
      b.x + 136 * mm,
      b.y + 38.5 * mm,
      18 * mm,
      2.5,
    );
    fit(
      "Листов " + ((o.pageIndex || 1) === 1 ? (o.pageCount || 1) : ""),
      b.x + 156 * mm,
      b.y + 38.5 * mm,
      28 * mm,
      2.5,
    );
    if (p.meta.organization)
      lines(p.meta.organization, b.x + 137 * mm, b.y + 46 * mm, 46 * mm, 3.5, 2);
    text(
      "Формат " + String(o.paper || "a3").toUpperCase(),
      b.x + b.w - 35 * mm,
      plan.ph - 1.5 * mm,
      2.5,
    );
    c.lineWidth = 0.35 * mm;
    if (plan.journal) {
      const {x, y: drawingY, w} = plan.sheet.drawing;
      const tables = plan.journalTables || [{
        rows: plan.journal, number: o.branchNumber, offset: 0,
        height: b.y - drawingY - 5 * mm,
      }];
      for (const table of tables) {
        const y = drawingY + table.offset;
        const rows = journalRows(table.rows);
        if (!table.rows.length) rows.push(rows[0].map((_, index) => index === 2 ? "Нет трасс" : "—"));
        const widths = journalWidths(table.rows, c);
        const naturalWidth = widths.reduce((sum, width) => sum + width, 0);
        const availableHeight = table.height;
        const gap = 18;
        const rowCount = rows.length - 1;
        let columnCount = 1, scale, perBlock;
        for (;;) {
          scale = Math.min(1, w / (columnCount * naturalWidth + (columnCount-1)*gap));
          perBlock = Math.max(1, Math.floor((availableHeight / scale - 50) / 20));
          if (rowCount <= perBlock * columnCount) break;
          columnCount++;
        }
        const width = columnCount * naturalWidth + (columnCount-1)*gap;
        const height = 50 + 20 * Math.min(perBlock, rowCount);
        c.lineWidth = 0.65 * scale;
        const left = x + (w - width * scale) / 2;
        const headingY = y + (availableHeight - height * scale) / 2 + 14 * scale;
        const heading = "КАБЕЛЬНЫЙ ЖУРНАЛ" + (table.number
          ? " · Ветка №" + table.number
          : table.rows.length ? " · Группа без ввода" : "");
        c.font = `${4 * mm * scale}px OpenGOST, sans-serif`;
        text(heading, x + (w - c.measureText(heading).width) / 2, headingY, 4 * scale);
        for (let offset = 1; offset < rows.length; offset += perBlock) {
          const blockX = left + ((offset - 1) / perBlock) * (naturalWidth + gap) * scale;
          [rows[0], ...rows.slice(offset, offset + perBlock)].forEach((row, index) => {
          const top = headingY + (10 + index * 20) * scale;
          let cellX = blockX;
          row.forEach((value, col) => {
            const width = widths[col] * scale;
            c.strokeRect(cellX, top, width, 20 * scale);
            c.font = `${3 * mm * scale}px OpenGOST, sans-serif`;
            const cable = index ? table.rows[offset + index - 2] : null;
            const connector = col === 3 ? cable?.outputConnector : col === 6 ? cable?.inputConnector : null;
            if (connector) {
              c.lineWidth = 0.65 * scale;
              const cx = cellX + 9 * scale, cy = top + 10 * scale;
              const pin = (dx, dy, radius) => {
                c.beginPath();
                c.arc(cx + dx * scale, cy + dy * scale, radius * scale, 0, 2 * Math.PI);
                c.stroke();
              };
              if (connector.startsWith("terminal")) {
                c.strokeRect(cx - 5 * scale, cy - 3 * scale, 10 * scale, 6 * scale);
                for (const dx of [-3, 0, 3]) pin(dx, 0, .75);
              } else {
                pin(0, 0, 5);
                if (connector === "cee3") {
                  pin(0, -2.9, .65);
                  for (const side of [-1, 1]) {
                    pin(side * 2.75, -.9, .65);
                    pin(side * 1.7, 2.35, .65);
                  }
                } else {
                  pin(-2, 0, .75);
                  pin(2, 0, .75);
                  if (connector === "cee1") pin(0, 3, .75);
                }
              }
            }

            const inset = connector ? 15 * scale : 0;
            text(value, cellX + inset + (width - inset - c.measureText(value).width) / 2, top + 14 * scale, 3 * scale);
            cellX += width;
          });
          });
        }
      }
      return;
    }
    c.strokeRect(n.x, n.y, n.w, n.h);
    const u = Math.min(1, n.w / (125 * mm), n.h / n.requiredHeight),
      W = n.w / mm / u - 8;
    const X = (x) => n.x + x * mm * u,
      Y = (y) => n.y + y * mm * u;
    const nt = (t, x, y, size = 2.5) => text(t, X(x), Y(y), size * u);
    function nw(t, y, size = 2.5) {
      c.font = `${size * mm * u}px OpenGOST, sans-serif`;
      let row = "";
      for (const word of String(t).split(/\s+/)) {
        if (row && c.measureText(row + " " + word).width > W * mm * u) {
          nt(row, 4, y, size);
          y += size + 0.8;
          row = word;
        } else row += (row ? " " : "") + word;
      }
      if (row) {
        nt(row, 4, y, size);
        y += size + 0.8;
      }
      return y;
    }
    let y = 6;
    nt("ПОЯСНЕНИЯ, ПРИМЕЧАНИЯ И ОБОЗНАЧЕНИЯ", 4, y, 3);
    y += 6;
    y = nw(
      "1. Общая потребляемая мощность: " + fmt(s.watts / 1000) + " кВт.",
      y,
      3,
    );
    y = nw("2. Требуемые внешние точки подключения:", y + 1);
    for (const q of s.points)
      y = nw(
        `${q.type}; ${q.phases}ф ${q.nominal} А; ${fmt(q.capacity / 1000)} кВт/точка; ${q.count} шт.; нагрузка ${fmt(q.watts / 1000)} кВт.`,
        y + 1,
      );
    if (!s.points.length) y = nw("Точки подключения отсутствуют.", y);
    y = nw(
      `3. Модулей ${s.modules}; потребителей ${s.consumers}; дистрибьюторов ${s.distros}; переходов/удлинителей ${s.extenders}.`,
      y + 1,
    );
    y = nw(
      "Мощность включает неподключённые нагрузки. Для трасс с заданной длиной указаны расчётные ΔU и ΔP.",
      y + 1,
      2.2,
    );
    y += 3;
    nt("УСЛОВНЫЕ ОБОЗНАЧЕНИЯ", 4, y, 3);
    y += 6;
    const entries = [
      ["source", "X — ввод / источник"],
      ["consumer", "EL — потребитель"],
      ["distro", "QD — распределитель"],
      ["extender", "XP — переход"],
      ["breaker", "QF — автомат"],
      ["port", "Порт подключения"],
      ["line", "Электрическая связь"],
      ["box", "Граница устройства"],
      ["branch", "Ветка №х — граница ветки"],
    ];
    const nl = (a, b, d, e) => line(X(a), Y(b), X(d), Y(e));
    const nc = (x, yy, r) => {
      c.beginPath();
      c.arc(X(x), Y(yy), r * mm * u, 0, 2 * Math.PI);
      c.stroke();
    };
    c.lineWidth = 0.22 * mm * u;
    entries.forEach(([kind, label], i) => {
      const col = n.narrow ? 0 : i % 2,
        row = n.narrow ? i : Math.floor(i / 2),
        x = 4 + col * (W / 2 + 1),
        yy = y + row * 6;
      if (kind === "source") {
        nc(x + 3, yy - 1, 2);
        nt("~", x + 1.8, yy, 2.5);
      }
      if (kind === "consumer") {
        nc(x + 3, yy - 1, 2);
        nl(x + 1.5, yy - 2.5, x + 4.5, yy + 0.5);
        nl(x + 1.5, yy + 0.5, x + 4.5, yy - 2.5);
      }
      if (kind === "distro") {
        nl(x + 1, yy - 3, x + 1, yy + 1);
        for (const a of [-3, -1, 1]) nl(x + 1, yy + a, x + 6, yy + a);
      }
      if (kind === "extender") {
        nl(x, yy - 1, x + 1, yy - 1);
        c.strokeRect(X(x + 1), Y(yy - 3), 5 * mm * u, 4 * mm * u);
        nl(x + 6, yy - 1, x + 7, yy - 1);
      }
      if (kind === "breaker") {
        nl(x, yy - 1, x + 2, yy - 1);
        nl(x + 2, yy - 1, x + 5, yy - 3);
        nc(x + 5, yy - 1, 0.4);
        nl(x + 5.5, yy - 1, x + 7, yy - 1);
      }
      if (kind === "port") {
        nl(x, yy - 1, x + 5, yy - 1);
        nc(x + 5.5, yy - 1, 0.7);
      }
      if (kind === "line") nl(x, yy - 1, x + 7, yy - 1);
      if (kind === "box") c.strokeRect(X(x), Y(yy - 3), 7 * mm * u, 4 * mm * u);
      if (kind === "branch") {
        for (const dy of [-3, 1])
          for (const dx of [0, 3, 6]) nl(x + dx, yy + dy, x + Math.min(dx + 1, 7), yy + dy);
        for (const dx of [0, 7]) nl(x + dx, yy - 2, x + dx, yy);
      }
      nt(label, x + 9, yy, 2.5);
    });
  }
  return { geometry, draw, journalWidths };
});

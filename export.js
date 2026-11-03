(function () {
  "use strict";
  const S = ElectricSchematic,
    Sheet = ElectricSheet,
    mm = 72 / 25.4;
  function plans(project, options = {}) {
    const all = S.branches(project),
      groups =
        options.separateBranches && all.length > 1
          ? all
          : [{ project, number: null }];
    const sizes = { a4: [210, 297], a3: [297, 420], a2: [420, 594], a1: [594, 841], a0: [841, 1189] },
      paper = sizes[options.paper] || (project.nodes.length > 60 ? sizes.a0 : project.nodes.length > 30 ? sizes.a1 : sizes.a3);
    const landscape =
        options.paper !== "a4" && options.orientation !== "portrait",
      pw = paper[landscape ? 1 : 0] * mm,
      ph = paper[landscape ? 0 : 1] * mm;
    const pages = groups.map((branch, i) => {
      const sheet = Sheet.geometry(pw, ph, branch.project);
      const opts = {
          layoutWidth: sheet.drawing.w,
          layoutHeight: sheet.drawing.h,
          ...options,
          diagramOnly: true,
          designations: S.designations(project),
          branchNumber: branch.number,
          pageIndex: i + 1,
          pageCount: groups.length,
        },
        size = S.render(branch.project, { ...opts, measureOnly: true });
      const fit = Math.min(
          sheet.drawing.w / size.width,
          sheet.drawing.h / size.height,
        ),
        percent = Math.min(100, Math.max(25, Number(options.scale) || 100)),
        scale = (fit * percent) / 100;
      return {
        project: branch.project,
        options: opts,
        pw,
        ph,
        scale,
        sheet,
        size,
        x: sheet.drawing.x + (sheet.drawing.w - size.width * scale) / 2,
        y: sheet.drawing.y + (sheet.drawing.h - size.height * scale) / 2,
      };
    });
    const commonScale = Math.min(...pages.map((page) => page.scale));
    return pages.map((page) => ({
      ...page,
      scale: commonScale,
      x:
        page.sheet.drawing.x +
        (page.sheet.drawing.w - page.size.width * commonScale) / 2,
      y:
        page.sheet.drawing.y +
        (page.sheet.drawing.h - page.size.height * commonScale) / 2,
    }));
  }
  function pageCanvas(plan, resolution = 300) {
    // Keep previews lightweight while allowing large sheets to retain small labels.
    const pixelBudget = resolution > 120 ? 64000000 : 24000000;
    const dpi = Math.min(
        resolution / 72,
        Math.sqrt(pixelBudget / (plan.pw * plan.ph)),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.floor(plan.pw * dpi);
    canvas.height = Math.floor(plan.ph * dpi);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(plan.x * dpi, plan.y * dpi);
    S.render(plan.project, {
      ...plan.options,
      context: ctx,
      renderScale: plan.scale * dpi,
    });
    ctx.restore();
    ctx.save();
    ctx.scale(dpi, dpi);
    Sheet.draw(plan, ctx);
    ctx.restore();
    return canvas;
  }
  function render(project, routes, options) {
    return pageCanvas(plans(project, options)[0]);
  }
  class PDFContext {
    constructor(doc, x, y) {
      this.doc = doc;
      this.x = x;
      this.y = y;
      this.factor = 1;
      this.fillStyle = "#111";
      this.strokeStyle = "#111";
      this.lineWidth = 1;
      this.font = "19px OpenGOST";
      this.path = [];
    }
    scale(x) {
      this.factor *= x;
    }
    translate(x, y) {
      this.x += x * this.factor;
      this.y += y * this.factor;
    }
    xy(x, y) {
      return [this.x + x * this.factor, this.y + y * this.factor];
    }
    beginPath() {
      this.path = [];
    }
    moveTo(x, y) {
      this.path.push({ op: "m", c: this.xy(x, y) });
    }
    lineTo(x, y) {
      this.path.push({ op: "l", c: this.xy(x, y) });
    }
    bezierCurveTo(x1,y1,x2,y2,x,y) {
      this.path.push({op:"c",c:[...this.xy(x1,y1),...this.xy(x2,y2),...this.xy(x,y)]});
    }
    arc(x, y, r) {
      const k = r * 0.5522847498;
      this.moveTo(x + r, y);
      for (const v of [
        [x + r, y + k, x + k, y + r, x, y + r],
        [x - k, y + r, x - r, y + k, x - r, y],
        [x - r, y - k, x - k, y - r, x, y - r],
        [x + k, y - r, x + r, y - k, x + r, y],
      ])
        this.path.push({
          op: "c",
          c: [
            ...this.xy(v[0], v[1]),
            ...this.xy(v[2], v[3]),
            ...this.xy(v[4], v[5]),
          ],
        });
      this.path.push({ op: "h", c: [] });
    }
    stroke() {
      this.doc.setDrawColor(this.strokeStyle);
      this.doc.setLineWidth(this.lineWidth * this.factor);
      this.doc.path(this.path);
      this.doc.stroke();
    }
    fillRect(x, y, w, h) {
      this.doc.setFillColor(this.fillStyle);
      this.doc.rect(...this.xy(x, y), w * this.factor, h * this.factor, "F");
    }
    clearRect(x, y, w, h) {
      const old = this.fillStyle;
      this.fillStyle = "#fff";
      this.fillRect(x, y, w, h);
      this.fillStyle = old;
    }
    strokeRect(x, y, w, h) {
      this.doc.setDrawColor(this.strokeStyle);
      this.doc.setLineWidth(this.lineWidth * this.factor);
      this.doc.rect(...this.xy(x, y), w * this.factor, h * this.factor, "S");
    }
    setFont() {
      this.doc.setFont("OpenGOST", "normal");
      this.doc.setFontSize(
        Number(this.font.match(/([\d.]+)px/)?.[1] || 19) * this.factor,
      );
    }
    fillText(t, x, y) {
      this.setFont();
      this.doc.setTextColor(this.fillStyle);
      this.doc.text(String(t), ...this.xy(x, y));
    }
    measureText(t) {
      this.setFont();
      return { width: this.doc.getTextWidth(String(t)) / this.factor };
    }
  }
  function pdf(project, options = {}) {
    const list = plans(project, options),
      doc = new window.jspdf.jsPDF({
        orientation: list[0].pw > list[0].ph ? "landscape" : "portrait",
        unit: "pt",
        format: [list[0].pw, list[0].ph],
        compress: true,
        putOnlyUsedFonts: true,
      });
    doc.addFileToVFS("OpenGOST.ttf", window.ElectricGostFont);
    doc.addFont("OpenGOST.ttf", "OpenGOST", "normal");
    doc.setProperties({
      title: project.meta.name,
      author: project.meta.designer || "",
      subject: "Однолинейная электрическая схема",
    });
    list.forEach((plan, i) => {
      if (i)
        doc.addPage(
          [plan.pw, plan.ph],
          plan.pw > plan.ph ? "landscape" : "portrait",
        );
      const ctx = new PDFContext(doc, plan.x, plan.y);
      S.render(plan.project, {
        ...plan.options,
        context: ctx,
        renderScale: plan.scale,
      });
      Sheet.draw(plan, new PDFContext(doc, 0, 0));
    });
    return doc.output("blob");
  }
  window.ElectricExport = { render, pdf, plans, pageCanvas, PDFContext };
})();

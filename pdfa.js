/* Adaptador: interface no estilo jsPDF (mm, origem no topo) sobre pdf-lib. Tudo local, sem internet. */
(function () {
  'use strict';
  var K = 72 / 25.4;
  function b64ToBytes(s) { var b = atob(s.split(',')[1] || s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function imgSize(dataUrl) {
    var b = dataUrl.split(',')[1] || dataUrl; b = b.slice(0, Math.min(b.length, 160000) - (Math.min(b.length, 160000) % 4));
    var u = b64ToBytes(b);
    if (u[0] === 0x89 && u[1] === 0x50) return { width: (u[16] << 24) | (u[17] << 16) | (u[18] << 8) | u[19], height: (u[20] << 24) | (u[21] << 16) | (u[22] << 8) | u[23], type: 'png' };
    var i = 2;
    while (i < u.length) {
      if (u[i] !== 0xFF) { i++; continue; }
      var m = u[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { height: (u[i + 5] << 8) | u[i + 6], width: (u[i + 7] << 8) | u[i + 8], type: 'jpg' };
      i += 2 + ((u[i + 2] << 8) | u[i + 3]);
    }
    return { width: 1, height: 1, type: 'jpg' };
  }
  function clean(s) { // só caracteres que a fonte padrão (WinAnsi) aceita
    return String(s).replace(/[✓✔]/g, 'v').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF–—•€…]/g, '');
  }

  function Doc(lib, pdf, fonts) {
    this.lib = lib; this.pdf = pdf; this.fonts = fonts; this.pages = [[]]; this.cur = 0;
    this.st = { font: 'normal', size: 7, text: [0, 0, 0], draw: [0, 0, 0], fill: [255, 255, 255], lw: 0.25 };
  }
  Doc.prototype._f = function () { return this.st.font === 'bold' ? this.fonts.b : this.fonts.n; };
  Doc.prototype.setFont = function (f, s) { this.st.font = s === 'bold' ? 'bold' : 'normal'; };
  Doc.prototype.setFontSize = function (s) { this.st.size = s; };
  function rgb(a) { return a.length === 1 ? [a[0], a[0], a[0]] : [a[0], a[1], a[2]]; }
  Doc.prototype.setTextColor = function () { this.st.text = rgb([].slice.call(arguments)); };
  Doc.prototype.setDrawColor = function () { this.st.draw = rgb([].slice.call(arguments)); };
  Doc.prototype.setFillColor = function () { this.st.fill = rgb([].slice.call(arguments)); };
  Doc.prototype.setLineWidth = function (w) { this.st.lw = w; };
  Doc.prototype.getTextWidth = function (t) { return this._f().widthOfTextAtSize(clean(t), this.st.size) / K; };
  Doc.prototype.splitTextToSize = function (t, w) {
    var self = this, out = [];
    String(t).split('\n').forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (wd) {
        var tryL = line ? line + ' ' + wd : wd;
        if (self.getTextWidth(tryL) <= w || !line) {
          if (!line && self.getTextWidth(wd) > w) { // palavra maior que a linha
            var part = ''; wd.split('').forEach(function (ch) { if (self.getTextWidth(part + ch) > w) { out.push(part); part = ch; } else part += ch; }); line = part;
          } else line = tryL;
        } else { out.push(line); line = wd; }
      });
      out.push(line);
    });
    return out;
  };
  Doc.prototype.rect = function (x, y, w, h, style) { this.pages[this.cur].push({ k: 'rect', x: x, y: y, w: w, h: h, fill: style === 'FD' || style === 'F' ? this.st.fill.slice() : null, draw: this.st.draw.slice(), lw: this.st.lw }); };
  Doc.prototype.text = function (lines, x, y, o) {
    o = o || {}; if (!Array.isArray(lines)) lines = [lines];
    var lh = this.st.size * (o.lineHeightFactor || 1.15) / K, self = this;
    lines.forEach(function (l, i) {
      var t = clean(l), w = self.getTextWidth(t), xx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      self.pages[self.cur].push({ k: 'text', t: t, x: xx, y: y + i * lh, size: self.st.size, bold: self.st.font === 'bold', color: self.st.text.slice() });
    });
  };
  Doc.prototype.getImageProperties = function (d) { return imgSize(d); };
  Doc.prototype.addImage = function (data, fmt, x, y, w, h) { this.pages[this.cur].push({ k: 'img', data: data, x: x, y: y, w: w, h: h }); };
  Doc.prototype.addPage = function () { this.pages.push([]); this.cur = this.pages.length - 1; };
  Doc.prototype.getNumberOfPages = function () { return this.pages.length; };
  Doc.prototype.setPage = function (n) { this.cur = n - 1; };
  Doc.prototype.output = function () {
    var L = this.lib, pdf = this.pdf, fonts = this.fonts, cache = {};
    var PH = 297 * K;
    var chain = Promise.resolve();
    this.pages.forEach(function (ops) {
      chain = chain.then(function () {
        var pg = pdf.addPage([210 * K, PH]);
        return ops.reduce(function (c, op) {
          return c.then(function () {
            if (op.k === 'rect') {
              var a = { x: op.x * K, y: PH - (op.y + op.h) * K, width: op.w * K, height: op.h * K, borderWidth: op.lw * K, borderColor: L.rgb(op.draw[0] / 255, op.draw[1] / 255, op.draw[2] / 255) };
              if (op.fill) a.color = L.rgb(op.fill[0] / 255, op.fill[1] / 255, op.fill[2] / 255);
              pg.drawRectangle(a);
            } else if (op.k === 'text') {
              if (op.t) pg.drawText(op.t, { x: op.x * K, y: PH - op.y * K, size: op.size, font: op.bold ? fonts.b : fonts.n, color: L.rgb(op.color[0] / 255, op.color[1] / 255, op.color[2] / 255) });
            } else if (op.k === 'img') {
              var key = op.data.length + ':' + op.data.slice(-40);
              var p = cache[key] || (cache[key] = (imgSize(op.data).type === 'png' ? pdf.embedPng(b64ToBytes(op.data)) : pdf.embedJpg(b64ToBytes(op.data))));
              return p.then(function (im) { pg.drawImage(im, { x: op.x * K, y: PH - (op.y + op.h) * K, width: op.w * K, height: op.h * K }); }).catch(function () { });
            }
          });
        }, Promise.resolve());
      });
    });
    return chain.then(function () { return pdf.save(); });
  };
  Doc.prototype.save = function (name) {
    return this.output().then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return blob;
    });
  };
  window.newPdfDoc = function () {
    var L = window.PDFLib;
    return L.PDFDocument.create().then(function (pdf) {
      return Promise.all([pdf.embedFont(L.StandardFonts.Helvetica), pdf.embedFont(L.StandardFonts.HelveticaBold)]).then(function (f) {
        pdf.setTitle('RDA'); pdf.setCreator('RDA Almas');
        return new Doc(L, pdf, { n: f[0], b: f[1] });
      });
    });
  };
})();

/* Gera o PDF no formato do RDA impresso (jsPDF). */
(function () {
  'use strict';
  var W = 210, H = 297, M = 8, CW = W - 2 * M, BOT = H - 10;
  var NAVY = [11, 42, 91], GRAY = [217, 217, 217], LGRAY = [242, 242, 242];
  var OBRA = 'PABH 059 25 - AURA MINERALS - BRITAGEM - ALMAS-TO';
  var MURO = ['MONTAGEM DAS ESCAMAS', 'ALINHAMENTO DAS ESCAMAS', 'REATERRO E COMPACTAÇÃO - 1ª CAMADA', 'LANÇAMENTO DE BRITA - 1ª CAMADA',
    'APLICAÇÃO DAS FITAS METÁLICAS', 'REATERRO E COMPACTAÇÃO - 2ª CAMADA', 'LANÇAMENTO DE BRITA - 2ª CAMADA'];

  function br(s) { if (!s) return ''; var a = String(s).split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : s; }
  function brs(s) { if (!s) return ''; var a = String(s).split('-'); return a.length === 3 ? a[2] + '/' + a[1] : s; }

  function Pdf(doc) { this.d = doc; this.y = M; }
  Pdf.prototype.box = function (x, y, w, h, fill) {
    var d = this.d; d.setLineWidth(0.25); d.setDrawColor(0);
    if (fill) { d.setFillColor.apply(d, fill); d.rect(x, y, w, h, 'FD'); } else d.rect(x, y, w, h);
  };
  Pdf.prototype.text = function (t, x, y, w, h, o) {
    o = o || {}; var d = this.d;
    d.setFont('helvetica', o.bold ? 'bold' : 'normal'); d.setFontSize(o.size || 7); d.setTextColor.apply(d, o.color || [0, 0, 0]);
    var lines = o.wrap ? d.splitTextToSize(String(t == null ? '' : t), w - 2) : [String(t == null ? '' : t)];
    if (!o.wrap) { while (lines[0].length > 1 && d.getTextWidth(lines[0]) > w - 1.5) lines[0] = lines[0].slice(0, -1); }
    var lh = (o.size || 7) * 0.42;
    var ty = o.top ? y + lh + 0.8 : y + h / 2 - (lines.length - 1) * lh / 2 + lh * 0.35;
    var align = o.align || 'center';
    var tx = align === 'left' ? x + 1.2 : align === 'right' ? x + w - 1.2 : x + w / 2;
    d.text(lines, tx, ty, { align: align, lineHeightFactor: 1.15 });
  };
  Pdf.prototype.cell = function (t, x, y, w, h, o) { o = o || {}; this.box(x, y, w, h, o.fill); if (t !== '' && t != null) this.text(t, x, y, w, h, o); };
  Pdf.prototype.cols = function (cells, widths, y, h, o) {
    var x = M, self = this;
    cells.forEach(function (c, i) { var co = Object.assign({}, o || {}, (c && typeof c === 'object') ? c : {}); self.cell(c && typeof c === 'object' ? c.t : c, x, y, widths[i], h, co); x += widths[i]; });
  };
  Pdf.prototype.lines = function (t, w, size) { this.d.setFont('helvetica', 'normal'); this.d.setFontSize(size || 7); return this.d.splitTextToSize(String(t || ''), w - 2).length; };

  function header(p, r, logo, titulo) {
    var d = p.d, y = M;
    p.box(M, y, 36, 15); if (logo) { try { d.addImage(logo, 'JPEG', M + 2, y + 3.5, 32, 8.2); } catch (e) { } }
    p.box(M + 36, y, 112, 15);
    p.text(titulo, M + 36, y + 1.5, 112, 6, { bold: true, size: 9.5 });
    p.text(OBRA, M + 36, y + 7.5, 112, 6, { bold: true, size: 9.5 });
    p.box(M + 148, y, CW - 148, 15);
    p.text('DATA:   ' + br(r.date), M + 148, y, CW - 148, 15, { bold: true, size: 10 });
    return y + 15;
  }
  function climaBlock(p, r, y) {
    var L = 110, lw = 30, rw = CW - L, c1 = 32, cw = (rw - c1) / 3, rh = 5.6;
    var cl = r.clima || {};
    // esquerda
    p.cell('ENCARREGADO:', M, y, lw, rh * 1.0, { bold: true, size: 7 });
    p.cell(r.enc, M + lw, y, L - lw, rh, { bold: true, size: 8 });
    p.cell('DISCIPLINA:', M, y + rh, lw, rh * 2, { bold: true });
    p.cell(r.disciplina, M + lw, y + rh, L - lw, rh * 2, { size: 8 });
    p.cell('SUPERVISOR', M, y + rh * 3, lw, rh, { bold: true });
    p.cell(r.supervisor, M + lw, y + rh * 3, L - lw, rh, { size: 8 });
    // direita
    var x = M + L;
    p.cell('CONDIÇOES DO TEMPO', x, y, c1, rh, { bold: true });
    ['DIA', 'TARDE', 'NOITE'].forEach(function (t, i) { p.cell(t, x + c1 + i * cw, y, cw, rh, { bold: true, fill: GRAY }); });
    ['BOM', 'NUBLADO', 'CHUVOSO'].forEach(function (k, j) {
      var yy = y + rh * (j + 1);
      p.cell(k, x, yy, c1, rh, { bold: true, align: 'right', size: 6.5 });
      ['dia', 'tarde', 'noite'].forEach(function (per, i) { p.cell(cl[per] === k ? 'X' : '', x + c1 + i * cw, yy, cw, rh, { bold: true, size: 9, color: [20, 40, 160] }); });
    });
    y += rh * 4;
    var rh2 = 8;
    p.cell('PERÍODO NORMAL DE TRABALHO  ' + (r.periodo || '06:30 AS 16:30'), M, y, L, rh2, { bold: true });
    p.cell('HORÁRIO DA CHUVA', x, y, 16, rh2, { bold: true, size: 5.8, wrap: true });
    p.cell('INÍCIO:  ' + (r.chuvaIni || ''), x + 16, y, (rw - 16) / 2, rh2, { bold: true, align: 'left' });
    p.cell('TÉRMINO:  ' + (r.chuvaFim || ''), x + 16 + (rw - 16) / 2, y, (rw - 16) / 2, rh2, { bold: true, align: 'left' });
    return y + rh2;
  }
  function ensure(p, h, r, logo, titulo) {
    if (p.y + h <= BOT) return;
    titulo = titulo || (p.ctx && p.ctx.titulo) || '';
    p.d.addPage(); p.y = M;
    p.box(M, p.y, CW, 8, LGRAY);
    p.text(titulo + '  ·  ' + (r.numero || '') + '  ·  ' + br(r.date) + '  (continuação)', M, p.y, CW, 8, { bold: true, size: 8 });
    p.y += 8;
  }

  function teamTable(p, r, widths, minRows, rh, muro) {
    var y = p.y, hh = 4;
    // cabeçalho duplo
    var x = M, hdr = muro ? ['ITEM', 'CHAPA', 'NOME', 'FUNÇÃO', 'STATUS'] : ['ITEM', 'CHAPA', 'NOME', 'FUNÇÃO'];
    hdr.forEach(function (t, i) { p.cell(t, x, y, widths[i], hh * 2, { bold: true, fill: GRAY }); x += widths[i]; });
    var hw = widths[hdr.length] + widths[hdr.length + 1];
    p.cell('Horário', x, y, hw, hh, { bold: true, fill: GRAY });
    p.cell('INICIO', x, y + hh, widths[hdr.length], hh, { bold: true, fill: GRAY });
    p.cell('TERMINO', x + widths[hdr.length], y + hh, widths[hdr.length + 1], hh, { bold: true, fill: GRAY });
    if (!muro) p.cell('STATUS', x + hw, y, widths[widths.length - 1], hh * 2, { bold: true, fill: GRAY });
    p.y = y + hh * 2;
    var team = r.team || [], n = Math.max(team.length, minRows);
    for (var i = 0; i < n; i++) {
      var t = team[i] || {};
      ensure(p, rh, r, null, '');
      var ini = t.inicio || (t.nome ? '-' : ':'), fim = t.termino || (t.nome ? '-' : ':');
      var row = muro ? [i + 1, t.chapa || '-', { t: t.nome || '', align: 'center' }, { t: t.funcao || '', align: 'center' }, { t: t.status || '', bold: true, size: 6 }, ini, fim]
        : [i + 1, t.chapa || '-', { t: t.nome || '', align: 'left' }, { t: t.funcao || '', align: 'left' }, ini, fim, { t: t.status || '', bold: true, size: 6.3, color: t.status && t.status !== 'PRESENTE' ? [190, 30, 30] : [0, 0, 0] }];
      p.cols(row, widths, p.y, rh, { size: 6.8 });
      p.y += rh;
    }
  }
  function equipTable(p, r, minRows, rh, ctx) {
    var widths = [14, 76, 50, 18, 36];
    ensure(p, 14, r, ctx.logo, ctx.titulo);
    p.cols([{ t: 'ITEM', bold: true, fill: GRAY }, { t: 'EQUIPAMENTOS UTILIZADOS NO DIA', bold: true, fill: GRAY }], [14, CW - 14], p.y, 4.5); p.y += 4.5;
    var eq = (r.equipamentos || []).filter(function (e) { return e.d; }), n = Math.max(eq.length, minRows);
    p.cols(['', 'EQUIPAMENTO UTILIZADO', 'TAG', 'QUANT', 'ÁREA'], widths, p.y, 4.5, { bold: true }); p.y += 4.5;
    for (var i = 0; i < n; i++) {
      ensure(p, rh, r, ctx.logo, ctx.titulo);
      var e = eq[i] || {};
      p.cols([i + 1, { t: e.d || '', align: 'left' }, e.t || '', e.q || '', e.a || ''], widths, p.y, rh, { size: 6.8 }); p.y += rh;
    }
  }
  function ativTable(p, r, ctx) {
    var widths = [14, 116, 34, 30], at = r.atividades || [];
    ensure(p, 6 + 10, r, ctx.logo, ctx.titulo);
    p.cols([{ t: 'Nº ATIVIDADE', size: 5.8, wrap: true }, 'DESCRIÇÃO DAS ATIVIDADES', 'ÁREA', 'QTD MONTADA'], widths, p.y, 6, { bold: true, fill: GRAY }); p.y += 6;
    var n = Math.max(at.length, 4);
    for (var i = 0; i < n; i++) {
      var a = at[i] || {};
      var desc = (a.desc || '') + (a.progId ? (a.concluida ? '  [Programação: concluída]' : '  [Programação: em andamento]') : '') + ((a.fotos || []).length ? '  (' + a.fotos.length + ' foto' + (a.fotos.length > 1 ? 's' : '') + ' – ver registro fotográfico)' : '');
      var h = Math.max(11, p.lines(desc, widths[1], 8) * 3.6 + 3);
      ensure(p, h, r, ctx.logo, ctx.titulo);
      p.cols([i + 1, { t: desc, align: 'left', wrap: true, size: 8, color: [10, 30, 120] }, { t: a.area || '', wrap: true }, a.qtd || ''], widths, p.y, h, { size: 7.5 });
      p.y += h;
    }
  }
  function muroAtivTable(p, r, ctx) {
    var widths = [12, 62, 18, 22, 20, 20, 20, 20], at = r.atividades || [], rh = 5;
    ensure(p, 7 + rh * 3, r, ctx.logo, ctx.titulo);
    p.cols([{ t: 'Nº ATIVIDADE', size: 5.5, wrap: true }, 'DESCRIÇÃO DAS ATIVIDADES', 'Nº DA FIADA', 'QUANTIDADE MONTADA', 'DATA INICIO', 'HORÁRIO INICIO', 'DATA TÉRMINO', 'HORÁRIO TÉRMINO'], widths, p.y, 7, { bold: true, fill: GRAY, size: 5.8, wrap: true }); p.y += 7;
    var rows = [], item = 0;
    MURO.forEach(function (nome, ti) {
      var ls = at.filter(function (a) { return a.tipo === ti + 1; });
      if (!ls.length) rows.push({ desc: nome });
      ls.forEach(function (a) { rows.push(Object.assign({}, a, { desc: nome })); });
    });
    at.filter(function (a) { return !a.tipo; }).forEach(function (a) { rows.push(a); });
    while (rows.length < 10) rows.push({});
    rows.forEach(function (a) {
      item++;
      var desc = (a.desc || '') + ((a.fotos || []).length ? ' (' + a.fotos.length + ' foto' + (a.fotos.length > 1 ? 's' : '') + ')' : '');
      var h = Math.max(rh, p.lines(desc, widths[1], 6.3) * 2.9 + 1.6);
      ensure(p, h, r, ctx.logo, ctx.titulo);
      p.cols([item, { t: desc, align: 'left', wrap: true, size: 6.3 }, a.fiada || '', a.qtd || '', brs(a.dataIni), a.horaIni || ':', brs(a.dataFim), a.horaFim || ':'], widths, p.y, h, { size: 7, color: [10, 30, 120] });
      p.y += h;
    });
  }
  function paralTable(p, r, ctx, muro, minRows) {
    var px = (r.paralisacoes || []).filter(function (x) { return x.motivo; });
    var widths = muro ? [12, 102, 20, 20, 20, 20] : [12, 92, 50, 20, 20];
    ensure(p, 12, r, ctx.logo, ctx.titulo);
    p.cell(muro ? 'ATIVIDADE PARALIZADA' : 'PARALISAÇÕES / IMPACTOS DO DIA', M, p.y, CW, 4.5, { bold: true, fill: GRAY }); p.y += 4.5;
    p.cols(muro ? ['ITEM', 'MOTIVO', 'DATA INICIO', 'HORÁRIO INICIO', 'DATA TÉRMINO', { t: 'HORÁRIO TÉRMINO', size: 5.3 }] : ['ITEM', 'MOTIVO / IMPACTO', 'ATIVIDADE AFETADA', 'INÍCIO', 'TÉRMINO'], widths, p.y, 5, { bold: true, fill: GRAY, size: 6 }); p.y += 5;
    var n = Math.max(px.length, minRows);
    for (var i = 0; i < n; i++) {
      var x = px[i] || {};
      var h = Math.max(5, p.lines(x.motivo, widths[1], 7) * 3.1 + 1.8);
      ensure(p, h, r, ctx.logo, ctx.titulo);
      var row = muro ? [i + 1, { t: x.motivo || '', align: 'left', wrap: true }, brs(x.dataIni && x.motivo ? x.dataIni : ''), x.horaIni || ':', brs(x.dataFim && x.motivo ? x.dataFim : ''), x.horaFim || ':']
        : [i + 1, { t: x.motivo || '', align: 'left', wrap: true }, { t: x.ativ || '', wrap: true }, x.horaIni || ':', x.horaFim || ':'];
      p.cols(row, widths, p.y, h, { size: 7, color: [10, 30, 120] }); p.y += h;
    }
  }
  function signBlock(p, r, sig, ctx) {
    var h = 20, ws = [CW * 0.42, CW * 0.29, CW * 0.29];
    ensure(p, h + 5, r, ctx.logo, ctx.titulo);
    p.cols(['ENCARREGADO', 'SUPERVISOR', 'PLANEJAMENTO'], ws, p.y, 4.5, { bold: true, fill: GRAY }); p.y += 4.5;
    p.cols(['', '', ''], ws, p.y, h);
    if (sig) { try { p.d.addImage(sig, 'PNG', M + 4, p.y + 1, ws[0] - 8, h - 6); } catch (e) { } }
    p.text(r.enc, M, p.y + h - 5, ws[0], 4, { size: 6.5 });
    p.y += h;
  }
  function photoPages(p, r, fotos, ctx) {
    if (!fotos || !fotos.length) return;
    var d = p.d, cols = 2, rows = 3, gw = (CW - 6) / cols, gh = 82;
    fotos.forEach(function (f, i) {
      if (i % (cols * rows) === 0) {
        d.addPage(); p.y = M;
        p.cell('REGISTRO FOTOGRÁFICO  ·  ' + (r.numero || '') + '  ·  ' + br(r.date) + '  ·  ' + r.enc, M, p.y, CW, 8, { bold: true, fill: GRAY, size: 8.5 });
        p.y += 11;
      }
      var k = i % (cols * rows), cx = M + (k % cols) * (gw + 6), cy = M + 11 + Math.floor(k / cols) * (gh + 4);
      p.box(cx, cy, gw, gh);
      try {
        var props = d.getImageProperties(f.data); var iw = gw - 4, ih = gh - 13, sc = Math.min(iw / props.width, ih / props.height);
        var w = props.width * sc, h = props.height * sc;
        d.addImage(f.data, 'JPEG', cx + (gw - w) / 2, cy + 2 + (ih - h) / 2, w, h);
      } catch (e) { p.text('(foto indisponível)', cx, cy, gw, gh - 10, {}); }
      p.text(f.caption, cx, cy + gh - 11, gw, 10, { size: 6.8, wrap: true });
    });
  }

  function simpleHeader(p, titulo, dataTxt, logo) {
    var d = p.d, y = M;
    p.box(M, y, 36, 15); if (logo) { try { d.addImage(logo, 'JPEG', M + 2, y + 3.5, 32, 8.2); } catch (e) { } }
    p.box(M + 36, y, 112, 15);
    p.text(titulo, M + 36, y + 1.5, 112, 6, { bold: true, size: 10 });
    p.text(OBRA, M + 36, y + 7.5, 112, 6, { bold: true, size: 9 });
    p.box(M + 148, y, CW - 148, 15);
    p.text(dataTxt, M + 148, y, CW - 148, 15, { bold: true, size: 9.5, wrap: true });
    return y + 15;
  }
  function pageFooter(doc, start, txt) {
    var end = doc.getNumberOfPages();
    for (var i = start; i <= end; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90); doc.text(txt + '   ·   Página ' + (i - start + 1) + ' de ' + (end - start + 1), W / 2, H - 4, { align: 'center' }); }
    doc.setPage(end);
  }
  function newDocPage(doc) { if (doc.__used) doc.addPage(); doc.__used = true; return doc.getNumberOfPages(); }

  /** Permissão para horas extras (modelo da obra), um pedido por página */
  window.buildPermissaoPdf = function (h, opts, doc) {
    opts = opts || {};
    var start = newDocPage(doc), p = new Pdf(doc);
    p.ctx = { titulo: 'PERMISSÃO PARA HORAS EXTRAS' };
    p.y = simpleHeader(p, 'PERMISSÃO PARA HORAS EXTRAS', 'DATA:  ' + br(String(h.pedidoEm || '').slice(0, 10)), opts.logo);
    var w5 = [30, 56, 22, 50, CW - 158];
    p.cols(['Data prevista:', 'Encarregado:', 'Turno:', 'Área:', 'Responsável:'], w5, p.y, 5, { bold: true, fill: GRAY, size: 7 }); p.y += 5;
    p.cols([br(h.date), { t: h.enc, size: 6.8 }, h.turno || 'DIURNO', { t: h.area || '', wrap: true, size: 6.5 }, { t: h.supervisor || '', size: 6.5 }], w5, p.y, 7, { size: 7.5 }); p.y += 7;
    var tipo = h.tipo === 'ESCALA' ? 'ESCALA EM DIA NÃO ÚTIL' : 'EXTENSÃO DE HORÁRIO';
    var mh = Math.max(7, p.lines(h.motivo, CW - 90, 7.5) * 3.3 + 2);
    p.cols([{ t: 'Tipo: ' + tipo, bold: true }, { t: 'Horário: ' + (h.ini || '') + ' às ' + (h.fim || ''), bold: true }, { t: 'Atividade: ' + (h.motivo || ''), align: 'left', wrap: true, size: 7.5 }], [45, 45, CW - 90], p.y, mh, { size: 7.5 }); p.y += mh + 2;
    var widths = [12, 16, 66, 16, 16, 42, CW - 168];
    var x = M, hh = 4;
    ['ITEM', 'CHAPA', 'NOME'].forEach(function (t, i) { p.cell(t, x, p.y, widths[i], hh * 2, { bold: true, fill: GRAY }); x += widths[i]; });
    p.cell('Marque (X) p/ Hora Extra', x, p.y, widths[3] + widths[4], hh, { bold: true, fill: GRAY, size: 6 });
    p.cell('SIM', x, p.y + hh, widths[3], hh, { bold: true, fill: GRAY }); p.cell('NÃO', x + widths[3], p.y + hh, widths[4], hh, { bold: true, fill: GRAY });
    x += widths[3] + widths[4];
    p.cell('FUNÇÃO', x, p.y, widths[5], hh * 2, { bold: true, fill: GRAY }); p.cell('CONFIRMAÇÃO', x + widths[5], p.y, widths[6], hh * 2, { bold: true, fill: GRAY });
    p.y += hh * 2;
    var sel = {}; (h.pessoas || []).forEach(function (x) { sel[x.chapa] = 1; });
    var lista = (h.equipe && h.equipe.length ? h.equipe : h.pessoas || []);
    var n = Math.max(lista.length, 20);
    for (var i = 0; i < n; i++) {
      var t = lista[i] || {}, on = t.chapa && sel[t.chapa];
      ensure(p, 5.2, { numero: h.id, date: h.date });
      p.cols([i + 1, t.chapa || '-', { t: t.nome || '', align: 'left' }, { t: on ? 'X' : '', bold: true, size: 9, color: [20, 40, 160] }, { t: t.chapa && !on ? 'X' : '', bold: true, size: 9, color: [20, 40, 160] }, { t: t.funcao || '', align: 'left', size: 6.5 }, { t: on ? 'Decl. do encarregado' : '', size: 6 }], widths, p.y, 5.2, { size: 7 });
      p.y += 5.2;
    }
    ensure(p, 40, { numero: h.id, date: h.date });
    p.y += 3;
    var half = CW / 2;
    p.cols(['ENCARREGADO', 'APROVAÇÃO'], [half, half], p.y, 5, { bold: true, fill: GRAY }); p.y += 5;
    p.cols(['', ''], [half, half], p.y, 26);
    p.text('Declaro que combinei a hora extra com cada pessoa marcada e que todas concordaram.', M, p.y + 0.5, half, 7, { size: 6.3, wrap: true });
    if (opts.assinatura) { try { doc.addImage(opts.assinatura, 'PNG', M + 10, p.y + 7, half - 20, 13); } catch (e) { } }
    p.text(h.enc + (h.pedidoEm ? '  ·  enviado ' + br(String(h.pedidoEm).slice(0, 10)) + ' ' + String(h.pedidoEm).slice(11, 16) : ''), M, p.y + 20, half, 5, { size: 6.5 });
    var st = h.status || 'PENDENTE', stc = st === 'APROVADO' ? [17, 96, 42] : st === 'REPROVADO' ? [190, 30, 30] : [90, 90, 90];
    p.text(st, M + half, p.y + 3, half, 8, { bold: true, size: 13, color: stc });
    p.text((h.decididoEm ? 'em ' + br(String(h.decididoEm).slice(0, 10)) + ' ' + String(h.decididoEm).slice(11, 16) : '') + (h.noPrazo === false ? '   ·   PEDIDO FORA DO PRAZO' : '   ·   pedido no prazo'), M + half, p.y + 11, half, 5, { size: 7, color: h.noPrazo === false ? [190, 30, 30] : [0, 0, 0] });
    if (h.obsAdmin) p.text('Obs.: ' + h.obsAdmin, M + half, p.y + 16, half, 9, { size: 6.5, wrap: true });
    p.y += 26;
    pageFooter(doc, start, 'Pedido ' + h.id + '  ·  ' + h.enc);
    return doc;
  };

  /** Escala de hora extra consolidada do dia (todos os encarregados) */
  window.buildEscalaPdf = function (date, pedidos, opts, doc) {
    opts = opts || {};
    var start = newDocPage(doc), p = new Pdf(doc);
    p.ctx = { titulo: 'ESCALA HORA EXTRA' };
    var horarios = {}; pedidos.forEach(function (h) { horarios[h.ini + ' às ' + h.fim] = 1; });
    var hk = Object.keys(horarios);
    p.y = simpleHeader(p, 'ESCALA HORA EXTRA', 'Data da atividade:\n' + br(date), opts.logo);
    p.cols([{ t: 'Horário:', bold: true }, hk.length === 1 ? hk[0] : 'conforme lista abaixo', { t: 'Pessoas:', bold: true }, String(pedidos.reduce(function (a, h) { return a + (h.pessoas || []).length; }, 0))], [30, 90, 30, CW - 150], p.y, 6, { size: 8 }); p.y += 8;
    var widths = [8, 12, 46, 26, 10, 18, 18, 18, 8, 8, CW - 172], hh = 4, RH = 7;
    var hdr = function () {
      var x = M;
      ['ITEM', 'CHAPA', 'NOME', 'FUNÇÃO', 'TIPO MO', 'LÍDER', 'DISCIPLINA', 'HORÁRIO'].forEach(function (t, k) { p.cell(t, x, p.y, widths[k], hh * 2, { bold: true, fill: GRAY, size: 6, wrap: true }); x += widths[k]; });
      p.cell('Marque (X)', x, p.y, widths[8] + widths[9], hh, { bold: true, fill: GRAY, size: 5.5 });
      p.cell('SIM', x, p.y + hh, widths[8], hh, { bold: true, fill: GRAY, size: 6 }); p.cell('NÃO', x + widths[8], p.y + hh, widths[9], hh, { bold: true, fill: GRAY, size: 6 });
      p.cell('ASSINATURA', x + widths[8] + widths[9], p.y, widths[10], hh * 2, { bold: true, fill: GRAY, size: 6 });
      p.y += hh * 2;
    };
    hdr();
    var i = 0, row = function (c) { if (p.y + RH > BOT) { ensure(p, RH + 20, { numero: 'Escala', date: date }); hdr(); } p.cols(c, widths, p.y, RH, { size: 6.5 }); p.y += RH; };
    pedidos.forEach(function (h) {
      (h.pessoas || []).forEach(function (x) {
        i++;
        row([i, x.chapa, { t: x.nome, align: 'left', size: 6.2 }, { t: x.funcao || '', size: 5.6 }, x.mo || '', { t: h.curto || h.enc, size: 5.8 }, { t: h.disciplina || '', size: 5.6 }, { t: (x.ini || h.ini) + ' às ' + (x.fim || h.fim), size: 6 }, '', '', '']);
      });
    });
    while (i < 25) { i++; row([i, '-', '', '', '', '', '', '', '', '', '']); }
    p.y += 4;
    if (p.y + 22 > BOT) ensure(p, 30, { numero: 'Escala', date: date });
    var t3 = CW / 3;
    p.cols(['RESPONSÁVEL PELA ESCALA', 'SUPERVISOR', 'PLANEJAMENTO'], [t3, t3, t3], p.y, 5, { bold: true, fill: GRAY }); p.y += 5;
    p.cols(['', '', ''], [t3, t3, t3], p.y, 16); p.y += 16;
    pageFooter(doc, start, 'Escala de hora extra  ·  ' + br(date) + '  ·  somente pedidos aprovados');
    return doc;
  };

  /** r: RDA; opts: {logo, assinatura, fotos:[{data,caption}]}; doc = newPdfDoc() (pode receber vários RDAs) */
  window.buildRdaPdf = function (r, opts, doc) {
    opts = opts || {};
    if (doc.__used) doc.addPage();
    doc.__used = true;
    var startPage = doc.getNumberOfPages();
    var p = new Pdf(doc);
    var muro = r.modelo === 'MURO';
    var titulo = muro ? 'APROPRIAÇÃO DAS ATIVIDADES DO MURO DE TERRA ARMADA' : 'RDA - RELATÓRIO DIÁRIO DE ATIVIDADES';
    var ctx = { logo: opts.logo, titulo: titulo }; p.ctx = ctx;
    p.y = header(p, r, opts.logo, titulo);
    p.y = climaBlock(p, r, p.y);
    var rh = 4.8;
    // calcula quantas linhas em branco cabem na equipe mantendo a folha 1 completa
    var nAt = (r.atividades || []).length, nEq = (r.equipamentos || []).filter(function (e) { return e.d; }).length, nPa = (r.paralisacoes || []).filter(function (x) { return x.motivo; }).length;
    var other = muro ? (9 + Math.max(nEq, 5) * rh + 7 + Math.max(10, nAt + 8) * 5 + 9.5 + Math.max(nPa, 6) * 5 + 25)
      : (9 + Math.max(nEq, 4) * rh + 6 + Math.max(nAt, 4) * 11 + 9.5 + Math.max(nPa, 2) * 5 + 25);
    var avail = BOT - p.y - 8 - other;
    var maxRows = muro ? 15 : 26;
    var minRows = Math.min(maxRows, Math.max((r.team || []).length, Math.floor(avail / rh)));
    var widths = muro ? [12, 16, 64, 38, 32, 16, 16] : [10, 14, 64, 42, 16, 16, 32];
    teamTable(p, r, widths, minRows, rh, muro);
    equipTable(p, r, muro ? 5 : 4, rh, ctx);
    if (muro) muroAtivTable(p, r, ctx); else ativTable(p, r, ctx);
    paralTable(p, r, ctx, muro, muro ? 6 : 2);
    signBlock(p, r, opts.assinatura, ctx);
    photoPages(p, r, opts.fotos, ctx);
    // rodapé apenas nas páginas deste RDA
    var end = doc.getNumberOfPages();
    for (var i = startPage; i <= end; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90);
      doc.text((r.numero || '') + '   ·   Enviado em ' + (r.enviadoEm || '') + '   ·   Página ' + (i - startPage + 1) + ' de ' + (end - startPage + 1), W / 2, H - 4, { align: 'center' });
    }
    doc.setPage(end);
    return doc;
  };
})();

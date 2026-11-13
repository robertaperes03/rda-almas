/* Tela da administradora: controle de recebimento, PDF, planilha e importações */
(function () {
  'use strict';
  var U = function () { return window.RDA_UTIL; };
  var A = { pass: sessionStorage.getItem('rda_admin') || '', tab: 'entregas', date: null, dias: 7, todos: false, de: null, ate: null, list: null };
  var DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  var DIAS_EXT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var ABREV = { 'SEM ESCALA': 'S/E', 'DOMINGO / DSR': 'DSR', 'FERIADO': 'FER', 'FOLGA DE CAMPO': 'F.C', 'SEM ATIVIDADE': 'S/A', 'PARALISAÇÃO': 'PAR', 'PARALISAÇÃO CLIMÁTICA': 'CHU', 'AGUARDANDO LIBERAÇÃO': 'AG.L', 'FOLGA': 'FOL', 'FÉRIAS': 'FÉR', 'ATESTADO / MÉDICO': 'ATE', 'FALTA JUSTIFICADA': 'F.J', 'NÃO TEM RDA': 'N/T' };
  function p2(n) { return ('0' + n).slice(-2); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dow(s) { return new Date(s + 'T12:00:00').getDay(); }
  function diff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function esc(s) { return U().esc(s); }
  function br(s) { return U().br(s); }
  function api(action, data, t) { return window.RDA_API(action, Object.assign({ admin: A.pass }, data || {}), t); }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Falha ao carregar ' + src)); }; document.head.appendChild(s);
    });
  }
  function toDataURL(url) { return fetch(url).then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(b); }); }); }
  function busy(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); }
  function done(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.add('hidden'); }, 3000); }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 3000); }
  function sheetUI(html) { var s = document.getElementById('sheet'); document.getElementById('sheetbody').innerHTML = html; s.classList.remove('hidden'); s.querySelector('.sheet-bg').onclick = closeUI; return document.getElementById('sheetbody'); }
  function closeUI() { document.getElementById('sheet').classList.add('hidden'); }

  /* ----- regra do controle de recebimento (igual à planilha de controle) ----- */
  function numero(e, d) { var n = e.refData && e.refNum ? e.refNum + diff(e.refData, d) : 0; return 'RDA-' + (e.cod || '') + '-' + (e.curto || e.nome) + '-' + (n > 0 ? ('000' + n).slice(-4) : '????'); }
  function diaUtil(d, j) { var w = dow(d); return w >= 1 && w <= 5 && j.feriados.indexOf(d) < 0; }
  function temAtiv(e, d, j) { return diaUtil(d, j) || (j.escalas || {})[e.nome + '|' + d] || j.map[e.nome + '|' + d]; }
  function prazoDe(e, d, j) { for (var k = 1; k <= 12; k++) { var x = addDays(d, k); if (temAtiv(e, x, j)) return x + ' 12:00'; } return addDays(d, 1) + ' 12:00'; }
  function atrasoDias(prazo, quando) { if (quando <= prazo) return 0; return Math.max(1, diff(prazo.slice(0, 10), quando.slice(0, 10))); }
  function controle(j, e, d) {
    var r = j.map[e.nome + '|' + d];
    var ov = j.situacoes[e.nome + '|' + d];
    var esc = (j.escalas || {})[e.nome + '|' + d];
    var fo = (j.folgas || []).filter(function (f) { return f.enc === e.nome && d >= f.ini && d <= f.fim; })[0];
    var sit = ov ? ov.s : (fo && !fo.subst ? 'FOLGA DE CAMPO' : diaUtil(d, j) || esc ? 'TRABALHO NORMAL' : dow(d) === 0 ? 'DOMINGO / DSR' : j.feriados.indexOf(d) >= 0 ? 'FERIADO' : 'SEM ESCALA');
    if (!e.cobra && !ov) sit = 'NÃO TEM RDA';
    var cobra = (j.listaSituacoes.filter(function (x) { return x[0] === sit; })[0] || [sit, true])[1];
    var prazo = prazoDe(e, d, j), agora = j.agora || (today() + ' 23:59');
    var out = { rda: r, sit: sit, obs: ov ? ov.o : (fo ? 'Folga de campo ' + br(fo.ini).slice(0, 5) + '–' + br(fo.fim).slice(0, 5) + (fo.subst ? ', RDA por ' + fo.subst : '') : ''), cobra: cobra || !!r, prevista: prazo.slice(0, 10), prazo: prazo, numero: r ? r.numero : numero(e, d) };
    if (!r) { // o encarregado consta no RDA de outro encarregado: conta como feito
      var outro = j.rdas.filter(function (x) {
        return x.date === d && x.enc !== e.nome && (x.membros || []).some(function (m) { return (m[0] === e.nome || m[0].indexOf(e.nome + ' ') === 0) && (!m[1] || stOk(m[1])); });
      })[0];
      if (outro) { out.via = outro; out.cobra = cobra; out.status = 'Concluído'; out.entrega = String(outro.enviadoEm).slice(0, 10); out.atraso = atrasoDias(prazo, String(outro.enviadoEm).slice(0, 16)); out.obs = 'Consta no RDA de ' + outro.enc + ' (' + outro.numero + ')'; return out; }
    }
    if (r) { out.status = 'Concluído'; out.entrega = String(r.enviadoEm).slice(0, 10); out.atraso = atrasoDias(prazo, String(r.enviadoEm).slice(0, 16)); }
    else if (cobra && agora > prazo) { out.status = 'Pendente'; out.atraso = atrasoDias(prazo, agora); }
    else if (cobra) { out.status = 'No prazo'; out.atraso = 0; }
    else { out.status = 'Desconsiderado'; out.atraso = 0; }
    return out;
  }
  function stOk(st) { return ['FALTA', 'ATESTADO', 'FÉRIAS', 'FOLGA', 'FOLGA DE CAMPO', 'EXAME PERIÓDICO', 'AFASTADO INSS', 'DEMITIDO'].indexOf(String(st).toUpperCase()) < 0; }
  function loadControle(de, ate) {
    return api('admin_list', { de: de, ate: ate }).then(function (j) {
      j.map = {}; j.rdas.forEach(function (r) { j.map[r.enc + '|' + r.date] = r; });
      j.encarregados.sort(function (a, b) { return (a.disciplina + a.nome).localeCompare(b.disciplina + b.nome); });
      return j;
    });
  }

  var $root;
  function render(root) {
    $root = root || $root;
    document.getElementById('topsub').textContent = 'Administração';
    if (!A.pass) return login();
    A.date = A.date || today(); A.de = A.de || today(); A.ate = A.ate || today();
    $root.innerHTML = '<div class="tabs"><button data-t="entregas">📊 Recebimento</button><button data-t="exportar">📄 RDAs e exportação</button><button data-t="importar">⬆️ Importar</button><button data-t="he">⏱ Horas extras</button><button data-t="avisos">🔔 Avisos</button><button data-t="msg">✉️ Mensagens</button><button data-t="folgas">🏖 Folgas</button><button data-t="feriados">📅 Feriados</button><button data-t="cadastro">🗂 Cadastro base</button><button data-t="ajuda">❓</button><button data-t="sair">Sair</button></div><div id="adm"></div>';
    [].forEach.call($root.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('sel', b.dataset.t === A.tab);
      b.onclick = function () { if (b.dataset.t === 'sair') { A.pass = ''; sessionStorage.removeItem('rda_admin'); location.hash = ''; return; } A.tab = b.dataset.t; render(); };
    });
    if (A.tab === 'ajuda') { A.tab = 'entregas'; tourAdmin(true); }
    if (A.tab === 'entregas') entregas(); else if (A.tab === 'exportar') exportar(); else if (A.tab === 'feriados') feriados(); else if (A.tab === 'he') horasExtras(); else if (A.tab === 'avisos') avisos(); else if (A.tab === 'msg') mensagens(); else if (A.tab === 'folgas') folgas(); else if (A.tab === 'cadastro') cadastro(); else importar();
  }

  function login() {
    $root.innerHTML = '<h1>Administração</h1><div class="card"><label class="f">Senha</label><input type="password" id="pw"><button class="btn big" style="margin-top:12px" id="go">Entrar</button></div>';
    var go = function () {
      var pw = document.getElementById('pw').value; if (!pw) return;
      A.pass = pw; busy('Verificando…');
      api('admin_login').then(function (r) { sessionStorage.setItem('rda_admin', pw); if (r.vapid) sessionStorage.setItem('rda_vapid', r.vapid); done('Bem-vinda!'); render(); setTimeout(function () { tourAdmin(); }, 500); })
        .catch(function (e) { A.pass = ''; done(e.message); });
    };
    document.getElementById('go').onclick = go;
    document.getElementById('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  /* ---------- Recebimento ---------- */
  function entregas() {
    var el = document.getElementById('adm');
    el.innerHTML = '<div class="card"><div class="row" style="align-items:end;flex-wrap:wrap"><div><label class="f" style="margin-top:0">Até o dia</label><input type="date" id="dd" value="' + A.date + '"></div>' +
      '<div><label class="f" style="margin-top:0">Período</label><select id="per"><option value="7">7 dias</option><option value="15">15 dias</option><option value="31">31 dias</option></select></div></div>' +
      '<label class="chk"><input type="checkbox" id="todos"' + (A.todos ? ' checked' : '') + '> Mostrar também quem não entrega RDA</label><button class="btn sm ghost" id="quem" style="margin-top:8px">👷 Quem faz RDA (recebe cobrança e alertas)</button></div><div id="ent"><p class="empty">Carregando…</p></div>';
    document.getElementById('per').value = String(A.dias);
    document.getElementById('dd').onchange = function () { A.date = this.value; entregas(); };
    document.getElementById('per').onchange = function () { A.dias = +this.value; entregas(); };
    document.getElementById('todos').onchange = function () { A.todos = this.checked; entregas(); };
    document.getElementById('quem').onclick = quemFaz;
    var de = addDays(A.date, -(A.dias - 1));
    loadControle(de, A.date).then(function (j) {
      var days = []; for (var i = A.dias - 1; i >= 0; i--) days.push(addDays(A.date, -i));
      var encs = j.encarregados.filter(function (e) { return A.todos || e.cobra; });
      var hoje = encs.map(function (e) { return { e: e, c: controle(j, e, A.date) }; });
      var prevDia = hoje.filter(function (x) { return x.c.cobra; }).length, entDia = hoje.filter(function (x) { return x.c.rda || x.c.via; }).length;
      var prevP = 0, entP = 0, porEnc = {};
      encs.forEach(function (e) { var s = porEnc[e.nome] = { p: 0, e: 0, at: 0 }; days.forEach(function (d) { var c = controle(j, e, d); if (c.cobra) { s.p++; prevP++; } if (c.rda || c.via) { s.e++; entP++; if (c.atraso) s.at++; } }); });
      var h = '<div class="kpis"><div><b>' + entDia + '/' + prevDia + '</b><small>entregues em ' + br(A.date).slice(0, 5) + '</small></div><div><b>' + entP + '/' + prevP + '</b><small>no período</small></div><div><b>' + Math.round(entP * 100 / Math.max(1, prevP)) + '%</b><small>aderência</small></div></div>';
      var pend = [];
      encs.forEach(function (e) { days.forEach(function (d) { var c = controle(j, e, d); if (c.status === 'Pendente') pend.push({ e: e, d: d, c: c }); }); });
      var line = function (x) {
        return '<div class="rdaline"><div class="tx"><b>' + esc(x.e.curto || x.e.nome) + ' · ' + br(x.d) + '</b><small>' + esc(x.c.numero) + ' · prazo ' + br(x.c.prevista).slice(0, 5) + ' 12:00' + (x.c.atraso ? ' · <b style="color:var(--bad)">' + x.c.atraso + ' dia(s) de atraso</b>' : '') + '</small></div><button class="btn sm ghost" data-sit="' + esc(x.e.nome) + '|' + x.d + '">Situação</button></div>';
      };
      var pDia = pend.filter(function (x) { return x.d === A.date; }), pAnt = pend.filter(function (x) { return x.d !== A.date; }).reverse();
      h += '<div class="card"><div class="card-h"><h2>Pendentes de ' + br(A.date) + ' (' + pDia.length + ')</h2></div>' + (pDia.length ? pDia.map(line).join('') : '<p class="empty">Ninguém pendente neste dia ✓</p>') +
        (pAnt.length ? '<details style="margin-top:10px"><summary class="link">Pendentes dos dias anteriores do período (' + pAnt.length + ')</summary>' + pAnt.map(line).join('') + '</details>' : '') + '</div>';
      h += '<div class="card"><div class="card-h"><h2>Mapa de recebimento</h2></div><div class="tablewrap"><table class="ctl"><thead><tr><th>Encarregado</th><th>Entregue</th>' + days.map(function (d) { return '<th>' + DIAS[dow(d)] + '<br>' + br(d).slice(0, 5) + '</th>'; }).join('') + '</tr></thead><tbody>';
      encs.forEach(function (e) {
        var s = porEnc[e.nome];
        h += '<tr><td class="nm">' + esc(e.curto || e.nome) + '<br><small class="muted">' + esc(e.disciplina) + '</small></td><td><b>' + s.e + '/' + s.p + '</b></td>' + days.map(function (d) {
          var c = controle(j, e, d), key = esc(e.nome) + '|' + d;
          if (c.via) return '<td class="ok" data-id="' + esc(c.via.id) + '" title="' + esc(c.obs) + '" style="background:#e3f2fd;color:#0b4f9c">✓<br><small>' + esc((c.via.enc || '').split(' ')[0]) + '</small></td>';
          if (c.rda) return '<td class="ok" data-id="' + esc(c.rda.id) + '" title="' + esc(c.numero) + '"' + (c.atraso ? ' style="background:#fff1e6;color:#a34600"' : '') + '>✓' + (c.atraso ? '<br><small>+' + c.atraso + 'd</small>' : '') + '</td>';
          if (c.status === 'Pendente') return '<td class="pend" data-sit="' + key + '" title="' + esc(c.sit) + '">✗</td>';
          if (c.status === 'No prazo') return '<td data-sit="' + key + '" style="background:#fff8e1;color:#a36b00;font-weight:700" title="Prazo ' + esc(br(c.prazo.slice(0, 10)) + ' 12:00') + '">…</td>';
          return '<td class="na" data-sit="' + key + '" title="' + esc(c.sit + (c.obs ? ' – ' + c.obs : '')) + '"><small>' + esc(ABREV[c.sit] || c.sit.slice(0, 3)) + '</small></td>';
        }).join('') + '</tr>';
      });
      h += '</tbody></table></div><p class="small muted">✓ entregue (toque para o PDF; laranja = entregue com atraso; azul = consta no RDA de outro encarregado) · … ainda no prazo (até 12:00 do próximo dia de atividade) · ✗ atrasado · siglas = situação que não cobra RDA (DSR, FER, F.C = folga de campo, PAR, CHU, N/T = não tem RDA…). Toque num dia sem RDA para mudar a situação.</p></div>';
      document.getElementById('ent').innerHTML = h;
      [].forEach.call(document.querySelectorAll('td.ok'), function (td) { td.onclick = function () { pdfOne(td.dataset.id); }; });
      [].forEach.call(document.querySelectorAll('[data-sit]'), function (td) { td.onclick = function () { var k = td.dataset.sit.split('|'); situacao(j, k[0], k[1]); }; });
    }).catch(function (e) { document.getElementById('ent').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; if (e.auth) { A.pass = ''; render(); } });
  }
  function situacao(j, enc, d) {
    var e = j.encarregados.filter(function (x) { return x.nome === enc; })[0];
    var c = controle(j, e, d);
    var b = sheetUI('<h3>' + esc(e.curto || e.nome) + ' · ' + br(d) + '</h3><p class="small muted">Situação operacional (igual à aba MASTER do seu controle). Em verde: cobra RDA.</p><div class="stgrid">' +
      j.listaSituacoes.map(function (s) { return '<button data-v="' + esc(s[0]) + '" style="background:' + (s[1] ? '#1e8e3e' : '#5f6368') + '" class="' + (s[0] === c.sit ? 'cur' : '') + '">' + esc(s[0]) + '</button>'; }).join('') +
      '</div><label class="f">Observação</label><input id="sobs" value="' + esc(c.obs) + '">');
    [].forEach.call(b.querySelectorAll('[data-v]'), function (x) {
      x.onclick = function () {
        busy('Salvando…');
        api('admin_setSituacao', { enc: enc, date: d, situacao: x.dataset.v, obs: b.querySelector('#sobs').value }).then(function () { closeUI(); done('Situação salva ✓'); entregas(); }).catch(function (er) { done('Erro: ' + er.message); });
      };
    });
  }

  /* ---------- Exportar ---------- */
  function exportar() {
    var el = document.getElementById('adm');
    el.innerHTML = '<div class="card"><div class="grid2"><div><label class="f" style="margin-top:0">De</label><input type="date" id="de" value="' + A.de + '"></div><div><label class="f" style="margin-top:0">Até</label><input type="date" id="ate" value="' + A.ate + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn ok" id="xls">📊 Planilha (.xlsx)</button><button class="btn" id="pdfall">📄 PDF de todos</button></div></div><div class="card" id="lst"><p class="empty">Carregando…</p></div>';
    document.getElementById('de').onchange = function () { A.de = this.value; if (A.ate < A.de) A.ate = A.de; exportar(); };
    document.getElementById('ate').onchange = function () { A.ate = this.value; exportar(); };
    document.getElementById('xls').onclick = planilha;
    document.getElementById('pdfall').onclick = function () { pdfMany(A.list || []); };
    api('admin_list', { de: A.de, ate: A.ate }).then(function (j) {
      A.list = j.rdas.sort(function (a, b) { return (a.date + a.disciplina + a.enc).localeCompare(b.date + b.disciplina + b.enc); });
      document.getElementById('lst').innerHTML = '<div class="card-h"><h2>' + A.list.length + ' RDA(s)</h2></div>' + (A.list.map(function (r) {
        return '<div class="rdaline"><div class="tx"><b>' + esc(r.numero) + '</b><small>' + br(r.date) + ' · ' + esc(r.enc) + ' · ' + r.presentes + '/' + r.equipe + ' presentes · ' + r.atividades + ' ativ. · ' + r.fotos + ' fotos' + (r.versao > 1 ? ' · reenviado (v' + r.versao + ')' : '') + '</small></div><button class="btn sm" data-id="' + esc(r.id) + '">PDF</button></div>';
      }).join('') || '<p class="empty">Nenhum RDA no período</p>');
      [].forEach.call(document.querySelectorAll('#lst [data-id]'), function (b) { b.onclick = function () { pdfOne(b.dataset.id); }; });
    }).catch(function (e) { document.getElementById('lst').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  function fetchFull(id) {
    return api('admin_get', { id: id }).then(function (j) {
      var r = j.rda, fotos = [], jobs = [];
      (r.atividades || []).forEach(function (a, ai) {
        (a.fotos || []).forEach(function (f) {
          if (!f.fileId) return;
          jobs.push(function () {
            return api('admin_photo', { fileId: f.fileId }, 120000).then(function (ph) {
              var desc = a.desc || (a.tipo ? U().MURO_ATIVS[a.tipo - 1] : '');
              fotos.push({ data: ph.data, caption: 'Atividade ' + (ai + 1) + ' – ' + desc + (f.takenAt ? '  ·  ' + f.takenAt : '') + (f.fileName ? '\n' + f.fileName : '') });
            }).catch(function () { });
          });
        });
      });
      return jobs.reduce(function (c, fn) { return c.then(fn); }, Promise.resolve()).then(function () { return { rda: r, assinatura: j.assinatura, fotos: fotos }; });
    });
  }
  function prepPdf() { return loadScript('pdf-lib.min.js').then(function () { return Promise.all([loadScript('pdfa.js'), toDataURL('logo.jpg')]); }).then(function (x) { return x[1]; }); }
  function pdfOne(id) {
    busy('Gerando PDF…');
    prepPdf().then(function (logo) {
      return fetchFull(id).then(function (f) {
        return window.newPdfDoc().then(function (doc) {
          window.buildRdaPdf(f.rda, { logo: logo, assinatura: f.assinatura, fotos: f.fotos }, doc);
          return doc.save(f.rda.date + ' - ' + f.rda.numero + '.pdf');
        });
      });
    }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
  }
  function pdfMany(list) {
    if (!list.length) return done('Nenhum RDA no período');
    prepPdf().then(function (logo) {
      return window.newPdfDoc().then(function (doc) {
        var i = 0;
        return list.reduce(function (c, r) {
          return c.then(function () {
            busy('Gerando PDF ' + (++i) + ' de ' + list.length + '…');
            return fetchFull(r.id).then(function (f) { window.buildRdaPdf(f.rda, { logo: logo, assinatura: f.assinatura, fotos: f.fotos }, doc); });
          });
        }, Promise.resolve()).then(function () { busy('Finalizando arquivo…'); return doc.save('RDAs ' + A.de + (A.ate !== A.de ? ' a ' + A.ate : '') + '.pdf'); });
      });
    }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
  }
  function planilha() {
    busy('Montando planilha…');
    Promise.all([loadScript('jszip.min.js').then(function () { return loadScript('xlsxw.js'); }), api('admin_day', { de: A.de, ate: A.ate }, 120000), loadControle(A.de, A.ate)]).then(function (x) {
      var t = x[1].tabelas, j = x[2], sheets = [];
      // controle de recebimento no mesmo formato da aba BANCO DE DADOS
      var ctl = [['Nº RDA', 'DISCIPLINA', 'ENCAREGADO', 'DATA', 'DIA DA SEMANA', 'DATA PREVISTA', 'DATA DE ENTREGA', 'STATUS', 'ATRASO', 'SITUAÇÃO OPERACIONAL', 'GRÁFICO RDA', 'OBSERVAÇÃO']];
      for (var d = A.de; d <= A.ate; d = addDays(d, 1)) {
        j.encarregados.forEach(function (e) {
          var c = controle(j, e, d);
          if (!e.cobra && !c.rda) return;
          ctl.push([c.via ? c.via.numero : c.numero, e.disciplina, e.curto || e.nome, br(d), DIAS_EXT[dow(d)], br(c.prevista) + ' 12:00', c.entrega ? br(c.entrega) : '', c.status, c.atraso, c.sit, c.cobra ? 'SIM' : 'NÃO', c.obs || '']);
        });
      }
      sheets.push({ name: 'Controle de recebimento', rows: ctl });
      var nomes = { RDA: 'RDAs', RDA_EFETIVO: 'Efetivo', RDA_ATIVIDADES: 'Atividades', RDA_EQUIPAMENTOS: 'Equipamentos', RDA_PARALISACOES: 'Paralisações', RDA_FOTOS: 'Fotos', HORA_EXTRA: 'Horas extras', HORA_EXTRA_PESSOAS: 'Horas extras - pessoas' };
      Object.keys(nomes).forEach(function (k) { var tb = t[k]; if (tb) sheets.push({ name: nomes[k], rows: [tb.header].concat(tb.rows) }); });
      return window.makeXlsx(sheets).then(function (blob) { download(blob, 'RDA - Registros ' + A.de + (A.ate !== A.de ? ' a ' + A.ate : '') + '.xlsx'); done('Planilha pronta ✓'); });
    }).catch(function (e) { done('Erro: ' + e.message); });
  }

  /* ---------- Importar programação semanal e posição de frota ---------- */
  function importar() {
    var el = document.getElementById('adm');
    el.innerHTML = '<div class="card"><div class="card-h"><h2>Programação semanal</h2></div><p class="small muted" style="margin-top:0">Escolha o arquivo da programação da semana (.xlsx, mesmo modelo de sempre). Os encarregados passam a ver a programação no celular.</p>' +
      '<label class="btn block">📋 Escolher programação…<input type="file" id="fprog" accept=".xlsx" class="hidden"></label><div id="rprog"></div></div>' +
      '<div class="card"><div class="card-h"><h2>Posição de frota (equipamentos)</h2></div><p class="small muted" style="margin-top:0">Escolha a planilha de posição de frota. A lista da aba CADASTRO vira a sugestão de equipamentos no RDA. Ficam de fora os que estão como DESM (desmobilizado) na aba POSIÇÃO DE FROTA - ANALÍTICA na última data marcada até hoje.</p>' +
      '<label class="btn block ghost">🚜 Escolher posição de frota…<input type="file" id="ffrota" accept=".xlsx" class="hidden"></label><div id="rfrota"></div></div>' +
      '<div class="card"><div class="card-h"><h2>Projetos (lista do Greendocs)</h2></div><p class="small muted" style="margin-top:0">Quando sair revisão nova, exporte do Greendocs e escolha aqui a planilha (colunas Nome, Título Complementar e Revisão). Pode escolher as duas listas juntas (Projetos e PIM/CODEME). A lista do app é substituída por estas.</p>' +
      '<label class="btn block ghost">📐 Escolher lista(s) do Greendocs…<input type="file" id="fgd" accept=".xlsx" multiple class="hidden"></label><div id="rgd"></div></div>';
    document.getElementById('fprog').onchange = function () { var f = this.files[0]; if (f) importProg(f); this.value = ''; };
    document.getElementById('ffrota').onchange = function () { var f = this.files[0]; if (f) importFrota(f); this.value = ''; };
    document.getElementById('fgd').onchange = function () { var f = [].slice.call(this.files); if (f.length) importGreendocs(f); this.value = ''; };
  }
  function importGreendocs(files) {
    var out = document.getElementById('rgd'); out.innerHTML = '<p class="empty">Lendo arquivo(s)…</p>';
    var mapa = {};
    libsXlsx().then(function () {
      return files.reduce(function (c, file) {
        return c.then(function () {
          return window.readXlsx(file).then(function (book) {
            var achou = false;
            Object.keys(book).forEach(function (name) {
              var rows = book[name];
              for (var i = 0; i < Math.min(rows.length, 15); i++) {
                var hdr = (rows[i] || []).map(H), cN = hdr.indexOf('NOME'), cT = hdr.indexOf('TITULO COMPLEMENTAR'), cR = hdr.indexOf('REVISAO');
                if (cN < 0 || cR < 0) continue;
                for (var r = i + 1; r < rows.length; r++) {
                  var row = rows[r] || [], cod = String(row[cN] || '').trim().toUpperCase();
                  if (!/^ALM-D-[A-Z]{2}-\d{4}-[A-Z]{3}-[A-Z]-\d{4}$/.test(cod)) continue;
                  mapa[cod] = [cod, String(row[cT] || '').replace(/\s+/g, ' ').trim(), row[cR] == null ? '' : String(row[cR]).trim()];
                }
                achou = true; break;
              }
            });
            if (!achou) throw new Error('O arquivo ' + file.name + ' não tem as colunas Nome / Revisão do Greendocs.');
          });
        });
      }, Promise.resolve());
    }).then(function () {
      var itens = Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
      if (!itens.length) throw new Error('Nenhum documento encontrado.');
      out.innerHTML = '<p class="empty">Enviando ' + itens.length + ' documentos…</p>';
      return api('admin_setProjetos', { itens: itens }, 120000).then(function (r) { out.innerHTML = '<div class="alert ok">✓ ' + r.total + ' projetos atualizados. Os celulares recebem a lista nova na próxima sincronização.</div>'; });
    }).catch(function (e) { out.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  function libsXlsx() { return loadScript('jszip.min.js').then(function () { return loadScript('xlsxr.js'); }); }
  function H(s) { return U().norm(s).replace(/\s+/g, ' ').trim(); }
  function importProg(file) {
    var out = document.getElementById('rprog'); out.innerHTML = '<p class="empty">Lendo arquivo…</p>';
    libsXlsx().then(function () { return window.readXlsx(file); }).then(function (book) {
      var res = null;
      Object.keys(book).some(function (name) {
        var rows = book[name];
        for (var i = 0; i < Math.min(rows.length, 30); i++) {
          var hdr = (rows[i] || []).map(H);
          var cA = hdr.indexOf('ATIVIDADE'), cE = hdr.indexOf('ENCARREGADO'), cD = hdr.indexOf('DISTRIB.');
          if (cA < 0 || cE < 0 || cD < 0) continue;
          var col = function (n) { return hdr.indexOf(n); };
          var cP = col('PROGRAMACAO SEMANAL'), dates = {}, k;
          for (var r = i + 1; r < i + 6 && r < rows.length; r++) {
            (rows[r] || []).forEach(function (v, c) { if (c >= cP && typeof v === 'number' && v > 40000 && v < 60000) dates[c] = window.xlsDate(v); });
            if (Object.keys(dates).length) break;
          }
          var dcols = Object.keys(dates).map(Number);
          if (!dcols.length) continue;
          var itens = [];
          for (k = i + 1; k < rows.length; k++) {
            var row = rows[k] || [];
            if (H(row[cD]) !== 'PROGRAMADO' || !row[cA]) continue;
            var dia = {}; dcols.forEach(function (c) { if (typeof row[c] === 'number' && row[c]) dia[dates[c]] = row[c]; });
            itens.push({ area: row[col('AREA')] || '', disc: String(row[col('DISCIPLINA')] || '').trim(), ativ: String(row[cA]).trim(), un: row[col('UND')] || '', qtd: row[col('QTD PROGRAMADA')] != null ? row[col('QTD PROGRAMADA')] : '', sup: row[col('SUPERVISOR')] || '', enc: String(row[cE] || '').trim(), dia: dia });
          }
          var first = dates[dcols[0]], d = new Date(first + 'T12:00:00'), w = d.getDay();
          res = { semana: addDays(first, w === 0 ? -6 : 1 - w), itens: itens };
          return true;
        }
        return false;
      });
      if (!res || !res.itens.length) throw new Error('Não encontrei a tabela da programação (colunas ATIVIDADE / ENCARREGADO / DISTRIB.).');
      out.innerHTML = '<p class="empty">Enviando ' + res.itens.length + ' atividades da semana de ' + br(res.semana) + '…</p>';
      return api('admin_setProg', res, 120000).then(function (r) {
        out.innerHTML = '<div class="alert ok">✓ Semana de <b>' + br(r.semana) + '</b> importada: ' + r.itens + ' atividade(s) distribuídas aos encarregados.</div>' +
          (r.semEncarregado.length ? '<div class="alert">Não achei no cadastro estes encarregados da programação (as atividades deles não aparecem no app): <b>' + r.semEncarregado.map(esc).join(', ') + '</b>. Corrija o nome na programação ou cadastre na aba ENCARREGADOS.</div>' : '');
      });
    }).catch(function (e) { out.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  function importFrota(file) {
    var out = document.getElementById('rfrota'); out.innerHTML = '<p class="empty">Lendo arquivo…</p>';
    libsXlsx().then(function () { return window.readXlsx(file); }).then(function (book) {
      var itens = null, desm = {}, K = function (v) { return U().norm(v).replace(/[^A-Z0-9]/g, ''); }, hj = today();
      // aba POSIÇÃO DE FROTA - ANALITICA: última situação marcada até hoje; DESM = desmobilizado
      Object.keys(book).forEach(function (name) {
        if (H(name).indexOf('ANALITICA') < 0) return;
        var rows = book[name], dcols = [];
        for (var i = 0; i < Math.min(rows.length, 5) && !dcols.length; i++) (rows[i] || []).forEach(function (v, c) { if (typeof v === 'number' && v > 40000 && v < 60000 && window.xlsDate(v) <= hj) dcols.push(c); });
        rows.forEach(function (row) {
          var lab = String((row || [])[0] || ''); if (lab.indexOf(' - ') < 0) return;
          var ult = '';
          dcols.forEach(function (c) { var v = String(row[c] == null ? '' : row[c]).trim(); if (v && v !== '-') ult = v; });
          if (H(ult) === 'DESM') desm[K(lab.split(' - ')[0])] = true;
        });
      });
      var nDesm = 0;
      Object.keys(book).some(function (name) {
        var rows = book[name];
        for (var i = 0; i < Math.min(rows.length, 15); i++) {
          var hdr = (rows[i] || []).map(H), cT = hdr.indexOf('TIPO EQUIPAMENTO');
          if (cT < 0) continue;
          var f = function (pre) { for (var c = 0; c < hdr.length; c++) if (hdr[c] && hdr[c].indexOf(pre) === 0) return c; return -1; };
          var cM = f('MARCA'), cF = f('FORNECEDOR'), cP = f('PLACA'), cG = f('TAG'), cX = f('DATA DESMOB');
          itens = [];
          for (var r = i + 1; r < rows.length; r++) {
            var row = rows[r] || []; if (!row[cT]) continue;
            if (cX >= 0 && typeof row[cX] === 'number' && window.xlsDate(row[cX]) < today()) continue;
            if (desm[K(row[cP])]) { nDesm++; continue; }
            var mm = String(row[cM] || '').trim();
            itens.push({ d: String(row[cT]).trim() + (mm ? ' - ' + mm : ''), t: String(row[cG] || '').trim(), p: String(row[cP] || '').trim(), f: String(row[cF] || '').trim() });
          }
          return true;
        }
        return false;
      });
      if (!itens || !itens.length) throw new Error('Não encontrei a aba de cadastro (coluna TIPO EQUIPAMENTO).');
      return api('admin_setEquip', { itens: itens }).then(function (r) { out.innerHTML = '<div class="alert ok">✓ ' + r.itens + ' equipamentos atualizados' + (nDesm ? ' (' + nDesm + ' desmobilizado(s) na aba ANALÍTICA ficaram de fora)' : '') + '. Os celulares recebem a lista na próxima sincronização.</div>'; });
    }).catch(function (e) { out.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  /* ---------- Calendário de feriados ---------- */
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  function feriados(lista) {
    var el = document.getElementById('adm');
    if (!lista) { el.innerHTML = '<p class="empty">Carregando…</p>'; return api('admin_feriados').then(function (j) { A.fer = j.feriados; feriados(j.feriados); }).catch(function (e) { el.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; }); }
    A.mes = A.mes || today().slice(0, 7);
    var y = +A.mes.slice(0, 4), m = +A.mes.slice(5, 7), first = A.mes + '-01', start = dow(first);
    var nd = new Date(y, m, 0).getDate(), map = {}; lista.forEach(function (f) { map[f.d] = f.n; });
    var h = '<div class="card"><div class="row" style="align-items:center"><button class="btn ghost sm" id="mprev" style="flex:0 0 auto">‹</button><h2 style="text-align:center">' + MESES[m - 1] + ' ' + y + '</h2><button class="btn ghost sm" id="mnext" style="flex:0 0 auto">›</button></div>' +
      '<p class="small muted">Toque no dia para marcar ou desmarcar feriado. No feriado o horário padrão vira 06:30–15:30 e o controle de recebimento não cobra RDA.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center">' + DIAS.map(function (d) { return '<div class="small muted"><b>' + d + '</b></div>'; }).join('');
    for (var i = 0; i < start; i++) h += '<div></div>';
    for (var dd = 1; dd <= nd; dd++) {
      var ds = A.mes + '-' + p2(dd), f = map[ds] != null, dom = dow(ds) === 0;
      h += '<button data-fd="' + ds + '" style="min-height:52px;border-radius:10px;border:1.5px solid ' + (f ? '#d93025' : 'var(--line)') + ';background:' + (f ? '#fde7e5' : (dom ? '#f3f5f9' : '#fff')) + ';font-weight:700;color:' + (f ? '#d93025' : 'inherit') + '">' + dd + (f ? '<br><small style="font-size:10px;font-weight:600">' + esc((map[ds] || 'Feriado').slice(0, 10)) + '</small>' : '') + (ds === today() ? '<br><small style="font-size:10px">hoje</small>' : '') + '</button>';
    }
    h += '</div></div><div class="card"><div class="card-h"><h2>Feriados marcados</h2></div>' + (lista.slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; }).map(function (f) { return '<div class="rdaline"><div class="tx"><b>' + br(f.d) + ' · ' + DIAS[dow(f.d)] + '</b><small>' + esc(f.n || 'Feriado') + '</small></div></div>'; }).join('') || '<p class="empty">Nenhum feriado marcado ainda</p>') + '</div>';
    el.innerHTML = h;
    var mv = function (k) { var d = new Date(y, m - 1 + k, 1); A.mes = d.getFullYear() + '-' + p2(d.getMonth() + 1); feriados(A.fer); };
    document.getElementById('mprev').onclick = function () { mv(-1); };
    document.getElementById('mnext').onclick = function () { mv(1); };
    [].forEach.call(el.querySelectorAll('[data-fd]'), function (b) {
      b.onclick = function () {
        var ds = b.dataset.fd, is = map[ds] != null;
        var sb = sheetUI('<h3>' + br(ds) + ' · ' + DIAS_EXT[dow(ds)] + '</h3><label class="f">Nome do feriado</label><input id="fn" value="' + esc(map[ds] || '') + '" placeholder="Ex.: Aniversário de Almas">' +
          '<div class="row" style="margin-top:14px">' + (is ? '<button class="btn danger" id="frm">Não é feriado</button>' : '') + '<button class="btn" id="fok">' + (is ? 'Salvar' : 'Marcar feriado') + '</button></div>');
        var save = function (rm) {
          busy('Salvando…');
          api('admin_setFeriado', { date: ds, nome: sb.querySelector('#fn').value.trim(), remove: rm }).then(function (j) { A.fer = j.feriados; closeUI(); done('Calendário atualizado ✓'); feriados(j.feriados); }).catch(function (e) { done('Erro: ' + e.message); });
        };
        sb.querySelector('#fok').onclick = function () { save(false); };
        if (is) sb.querySelector('#frm').onclick = function () { save(true); };
        setTimeout(function () { sb.querySelector('#fn').focus(); }, 100);
      };
    });
  }

  /* ---------- Horas extras: aprovação e documentos ---------- */
  function horasExtras() {
    var el = document.getElementById('adm');
    A.heDate = A.heDate || addDays(today(), 1);
    el.innerHTML = '<div class="card"><div class="row" style="align-items:end"><div><label class="f" style="margin-top:0">Dia da hora extra</label><input type="date" id="hd" value="' + A.heDate + '"></div><button class="btn" id="hdref" style="flex:0 0 auto">Atualizar</button></div><div id="hepend"></div></div><div id="helst"><p class="empty">Carregando…</p></div><div id="hecfg"></div>';
    document.getElementById('hd').onchange = function () { A.heDate = this.value; horasExtras(); };
    document.getElementById('hdref').onclick = horasExtras;
    api('admin_heList', { de: addDays(today(), -15), ate: addDays(today(), 30) }).then(function (j) {
      var all = j.pedidos, dia = all.filter(function (h) { return h.date === A.heDate; }).sort(function (a, b) { return (a.disciplina + a.enc).localeCompare(b.disciplina + b.enc); });
      var pend = all.filter(function (h) { return h.status === 'PENDENTE' && h.date !== A.heDate; });
      var dias = {}; pend.forEach(function (h) { dias[h.date] = (dias[h.date] || 0) + 1; });
      document.getElementById('hepend').innerHTML = Object.keys(dias).length ? '<div class="alert" style="margin:12px 0 0">Aguardando sua aprovação em outros dias: ' + Object.keys(dias).sort().map(function (d) { return '<button class="link" data-gd="' + d + '">' + br(d).slice(0, 5) + ' (' + dias[d] + ')</button>'; }).join(' · ') + '</div>' : '';
      [].forEach.call(document.querySelectorAll('[data-gd]'), function (b) { b.onclick = function () { A.heDate = b.dataset.gd; horasExtras(); }; });
      var nPes = dia.reduce(function (a, h) { return a + (h.status !== 'REPROVADO' ? (h.pessoas || []).length : 0); }, 0);
      var h = '<div class="kpis"><div><b>' + dia.length + '</b><small>pedidos</small></div><div><b>' + dia.filter(function (x) { return x.status === 'PENDENTE'; }).length + '</b><small>a aprovar</small></div><div><b>' + nPes + '</b><small>pessoas</small></div></div>';
      h += '<div class="card"><div class="card-h"><h2>' + DIAS_EXT[dow(A.heDate)] + ', ' + br(A.heDate) + '</h2></div>' +
        '<div class="row" style="flex-wrap:wrap;margin-bottom:8px"><button class="btn sm ok" id="apall">✓ Aprovar todos pendentes</button><button class="btn sm" id="pdfperm">📄 Permissões do dia (extensão e escala)</button><button class="btn sm ghost" id="pdfesc">📄 Lista nominal do dia</button></div>';
      h += dia.map(function (x) {
        var stc = x.status === 'APROVADO' ? 'background:#e8f5ec;color:#11602a' : x.status === 'REPROVADO' ? 'background:#fde7e5;color:#d93025' : 'background:#eef1f6;color:#0b2a5b';
        return '<div class="ativ"><div class="ah"><b>' + esc(x.enc) + '</b><span class="tag" style="' + stc + '">' + esc(x.status) + '</span></div>' +
          '<div class="small">' + esc(x.tipo === 'ESCALA' ? 'Escala (dia não útil)' : 'Extensão de horário') + ' · <b>' + esc(x.ini) + ' às ' + esc(x.fim) + '</b> · ' + (x.pessoas || []).length + ' pessoa(s)' + (x.area ? ' · ' + esc(x.area) : '') + '</div>' +
          '<div class="small muted">Pedido em ' + esc(String(x.pedidoEm || '').slice(0, 16)) + ' · ' + (x.noPrazo ? 'no prazo' : '<b style="color:var(--bad)">FORA DO PRAZO</b>') + '</div>' +
          '<div class="small" style="margin:6px 0">' + esc(x.motivo || '') + '</div><details><summary class="link">Ver pessoas</summary><div class="small">' + (x.pessoas || []).map(function (p) { return esc(p.chapa + ' – ' + p.nome + ' (' + (p.funcao || '') + ')'); }).join('<br>') + '</div></details>' +
          (x.obsAdmin ? '<div class="small muted">Obs.: ' + esc(x.obsAdmin) + '</div>' : '') +
          '<div class="row" style="margin-top:8px"><button class="btn sm ok" data-ap="' + esc(x.id) + '">Aprovar</button><button class="btn sm danger" data-rp="' + esc(x.id) + '">Reprovar</button><button class="btn sm ghost" data-pp="' + esc(x.id) + '">PDF</button></div></div>';
      }).join('') + (dia.length ? '' : '<p class="empty">Nenhum pedido para este dia</p>') + '</div>';
      document.getElementById('helst').innerHTML = h;
      var decide = function (ids, st) {
        var obs = st === 'REPROVADO' ? prompt('Motivo da reprovação (aparece para o encarregado):', '') : '';
        if (obs === null) return;
        busy('Salvando…');
        api('admin_heDecide', { ids: ids, status: st, obs: obs }).then(function () { done(st === 'APROVADO' ? 'Aprovado ✓' : 'Reprovado'); horasExtras(); }).catch(function (e) { done('Erro: ' + e.message); });
      };
      [].forEach.call(document.querySelectorAll('[data-ap]'), function (b) { b.onclick = function () { decide([b.dataset.ap], 'APROVADO'); }; });
      [].forEach.call(document.querySelectorAll('[data-rp]'), function (b) { b.onclick = function () { decide([b.dataset.rp], 'REPROVADO'); }; });
      document.getElementById('apall').onclick = function () { var ids = dia.filter(function (x) { return x.status === 'PENDENTE'; }).map(function (x) { return x.id; }); if (!ids.length) return done('Nada pendente neste dia'); if (confirm('Aprovar ' + ids.length + ' pedido(s) de ' + br(A.heDate) + '?')) decide(ids, 'APROVADO'); };
      var permPdf = function (lista, nome) {
        if (!lista.length) return done('Nenhum pedido');
        busy('Gerando PDF…');
        prepPdf().then(function (logo) {
          return window.newPdfDoc().then(function (doc) {
            return lista.reduce(function (c, x) {
              return c.then(function () {
                return (x.assinaturaFileId ? api('admin_sig', { fileId: x.assinaturaFileId }).then(function (r) { return r.data; }).catch(function () { return null; }) : Promise.resolve(null))
                  .then(function (sig) { window.buildPermissaoPdf(x, { logo: logo, assinatura: sig }, doc); });
              });
            }, Promise.resolve()).then(function () { return doc.save(nome); });
          });
        }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
      };
      [].forEach.call(document.querySelectorAll('[data-pp]'), function (b) { b.onclick = function () { var x = dia.filter(function (y) { return y.id === b.dataset.pp; })[0]; permPdf([x], A.heDate + ' - Permissão HE - ' + (x.curto || x.enc) + '.pdf'); }; });
      document.getElementById('pdfperm').onclick = function () { permPdf(dia.filter(function (x) { return x.status !== 'REPROVADO'; }), A.heDate + ' - Permissões de hora extra.pdf'); };
      document.getElementById('pdfesc').onclick = function () {
        var ap = dia.filter(function (x) { return x.status === 'APROVADO'; });
        if (!ap.length) return done('Nenhum pedido aprovado neste dia');
        busy('Gerando PDF…');
        prepPdf().then(function (logo) { return window.newPdfDoc().then(function (doc) { window.buildEscalaPdf(A.heDate, ap, { logo: logo }, doc); return doc.save(A.heDate + ' - Lista nominal de hora extra.pdf'); }); })
          .then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
      };
      var c = j.config;
      document.getElementById('hecfg').innerHTML = '<div class="card"><div class="card-h"><h2>Regras</h2></div><div class="small">Prazo do pedido: até <b>' + esc(c.HE_PRAZO) + '</b> (extensão: do próprio dia; escala: do último dia útil antes) · Extensão até <b>' + esc(c.HE_SEMANA_MAX) + '</b> (seg a qui) e <b>' + esc(c.HE_SEXTA_MAX) + '</b> (sexta) · Sábado: <b>' + (c.SABADO_ESCALA === 'SIM' ? 'é escala' : 'é dia útil') + '</b> · Fora do prazo: <b>' + (c.HE_FORA_PRAZO === 'BLOQUEAR' ? 'bloqueia' : 'envia com aviso para você decidir') + '</b></div></div>';
    }).catch(function (e) { document.getElementById('helst').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }


  /* ---------- cadastro base ---------- */
  var CADS = [['enc', '👷 Encarregados'], ['area', '📍 Áreas']];
  function cadastro() {
    var el = document.getElementById('adm');
    A.cad = A.cad || 'enc';
    el.innerHTML = '<div class="chips" style="margin:0 0 10px">' + CADS.map(function (c) { return '<button data-cad="' + c[0] + '" class="' + (A.cad === c[0] ? 'sel' : '') + '">' + c[1] + '</button>'; }).join('') + '</div><div id="cadbox"><p class="empty">Carregando…</p></div>';
    [].forEach.call(el.querySelectorAll('[data-cad]'), function (b) { b.onclick = function () { A.cad = b.dataset.cad; cadastro(); }; });
    if (A.cad === 'area') cadAreas(); else cadEnc();
  }
  function cadErro(e) { var b = document.getElementById('cadbox'); if (b) b.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; }

  /* ----- encarregados ----- */
  function cadEnc(j) {
    var box = document.getElementById('cadbox');
    if (!j) return api('admin_encList').then(function (r) { A.encCad = r; cadEnc(r); }).catch(cadErro);
    var f = A.encBusca || '';
    var ok = function (e) { return !f || U().norm(e.nome + ' ' + e.curto + ' ' + e.disciplina + ' ' + e.supervisor).indexOf(U().norm(f)) >= 0; };
    var ativos = j.encarregados.filter(function (e) { return e.ativo && ok(e); }), inat = j.encarregados.filter(function (e) { return !e.ativo && ok(e); });
    var linha = function (e) {
      return '<div class="rdaline" data-ed="' + esc(e.nome) + '" style="cursor:pointer"><div class="tx"><b>' + esc(e.nome) + '</b><small>' + esc(e.curto) + ' · ' + esc(e.disciplina) + (e.supervisor ? ' · sup. ' + esc(e.supervisor) : '') + ' · ' + e.equipe + ' na equipe</small></div>' +
        (e.modelo === 'MURO' ? '<span class="tag">Muro</span>' : '') + (e.ativo ? (e.cobra ? '<span class="tag" style="background:#e6f4ea;color:#1e8e3e">Cobra RDA</span>' : '<span class="tag">Não cobra</span>') : '') + '<span class="muted">›</span></div>';
    };
    var grupos = {}; ativos.forEach(function (e) { (grupos[e.disciplina] = grupos[e.disciplina] || []).push(e); });
    var h = '<div class="card"><div class="row" style="align-items:center"><input id="ebusca" placeholder="🔍 Procurar" value="' + esc(f) + '"><button class="btn" id="enovo" style="flex:0 0 auto">＋ Novo</button></div>' +
      '<p class="small muted" style="margin-bottom:0">' + ativos.length + ' na lista do app. Toque num nome para editar, desativar ou mudar o modelo de RDA.</p></div>';
    Object.keys(grupos).sort().forEach(function (d) {
      h += '<div class="card"><div class="card-h"><h2>' + esc(d) + ' <span class="muted small">(' + grupos[d].length + ')</span></h2></div>' + grupos[d].sort(function (a, b) { return a.nome.localeCompare(b.nome); }).map(linha).join('') + '</div>';
    });
    if (!ativos.length) h += '<p class="empty">Ninguém encontrado</p>';
    if (inat.length) h += '<div class="card"><div class="card-h"><h2>Inativos <span class="muted small">(fora da lista, histórico guardado)</span></h2></div>' + inat.map(linha).join('') + '</div>';
    box.innerHTML = h;
    var eb = document.getElementById('ebusca');
    eb.oninput = function () { A.encBusca = eb.value; var pos = eb.selectionStart; cadEnc(j); var n = document.getElementById('ebusca'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('enovo').onclick = function () { encForm(null, j); };
    [].forEach.call(box.querySelectorAll('[data-ed]'), function (r) { r.onclick = function () { encForm(j.encarregados.filter(function (e) { return e.nome === r.dataset.ed; })[0], j); }; });
  }

  function encForm(e, j) {
    var novo = !e; e = e || { nome: '', curto: '', disciplina: '', supervisor: '', modelo: 'PADRAO', ativo: true, cobra: true, equipe: 0 };
    var b = sheetUI('<h3>' + (novo ? 'Novo encarregado' : 'Editar encarregado') + '</h3>' +
      '<label class="f" style="margin-top:0">Nome completo</label><input id="cn" value="' + esc(e.nome) + '" autocapitalize="characters">' +
      '<label class="f">Nome curto</label><input id="cc" value="' + esc(e.curto) + '" autocapitalize="characters" placeholder="Ex.: ' + esc((e.nome || 'MARCIO JOEL').split(' ').slice(0, 2).join(' ')) + '"><p class="small muted" style="margin:4px 0 0">Vai no número do RDA: RDA-' + esc(e.cod || 'CIV') + '-<b>NOME CURTO</b>-0001' + (novo ? '' : '. Mudar o nome curto muda o número dos próximos RDAs.') + '</p>' +
      '<label class="f">Disciplina</label><input id="cd" list="cdl" value="' + esc(e.disciplina) + '" autocapitalize="characters" placeholder="Escolha ou digite"><datalist id="cdl">' + j.disciplinas.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f">Supervisor</label><input id="cs" list="csl" value="' + esc(e.supervisor) + '" autocapitalize="characters" placeholder="Escolha ou digite"><datalist id="csl">' + j.supervisores.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f">Modelo de RDA</label><select id="cm"><option value="PADRAO"' + (e.modelo !== 'MURO' ? ' selected' : '') + '>Padrão</option><option value="MURO"' + (e.modelo === 'MURO' ? ' selected' : '') + '>Muro (fiadas)</option></select>' +
      '<label class="person" style="cursor:pointer;margin-top:10px"><input type="checkbox" id="cb"' + (e.cobra ? ' checked' : '') + ' style="width:28px;height:28px;min-height:0;flex:0 0 28px"><div class="pinfo"><b>Cobrar RDA</b><small>Entra no controle de recebimento e recebe os alertas de prazo</small></div></label>' +
      '<div class="row" style="margin-top:14px">' + (novo ? '' : '<button class="btn ' + (e.ativo ? 'danger' : 'ghost') + '" id="cat">' + (e.ativo ? 'Desativar' : 'Reativar') + '</button>') + '<button class="btn" id="cok">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var val = function () {
      return { nome: b.querySelector('#cn').value, curto: b.querySelector('#cc').value, disciplina: b.querySelector('#cd').value, supervisor: b.querySelector('#cs').value, modelo: b.querySelector('#cm').value, cobra: b.querySelector('#cb').checked, ativo: e.ativo };
    };
    var enviar = function (v, hist) {
      busy('Salvando…');
      api('admin_encSave', { orig: novo ? '' : e.nome, e: v, historico: !!hist }, 120000).then(function (r) {
        A.encCad = r; closeUI();
        done(novo ? 'Encarregado cadastrado ✓' : (v.ativo === false && e.ativo ? 'Desativado ✓ (histórico guardado)' : (!e.ativo && v.ativo ? 'Reativado ✓' : 'Salvo ✓')));
        cadEnc(r);
      }).catch(function (x) { done('Erro: ' + x.message); });
    };
    var salvar = function (v) {
      var nn = String(v.nome || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!nn) return done('Informe o nome');
      if (!String(v.disciplina || '').trim()) return done('Informe a disciplina');
      if (novo || nn === e.nome) return enviar(v, false);
      var s2 = sheetUI('<h3>Trocar o nome</h3><p>De <b>' + esc(e.nome) + '</b><br>para <b>' + esc(nn) + '</b></p>' +
        '<p class="small muted">A equipe, a programação, as folgas e o celular dele passam para o nome novo de qualquer forma. O RDA ainda não enviado no celular também vai com o nome novo.</p>' +
        '<p><b>E nos RDAs, horas extras e controles já enviados?</b></p>' +
        '<button class="btn block" id="h1">Trocar também nos já enviados</button><p class="small muted" style="margin:4px 0 12px">A planilha e os PDFs gerados daqui em diante saem com o nome novo.</p>' +
        '<button class="btn ghost block" id="h0">Manter o nome antigo nos já enviados</button><p class="small muted" style="margin:4px 0 12px">Os já enviados continuam como estão. O controle de recebimento entende que é a mesma pessoa.</p>' +
        '<button class="btn ghost block" id="hx">Cancelar</button>');
      s2.querySelector('#h1').onclick = function () { enviar(v, true); };
      s2.querySelector('#h0').onclick = function () { enviar(v, false); };
      s2.querySelector('#hx').onclick = function () { encForm(e, j); };
    };
    b.querySelector('#cok').onclick = function () { salvar(val()); };
    var at = b.querySelector('#cat');
    if (at) at.onclick = function () {
      var v = val();
      if (e.ativo) {
        if (!confirm(e.nome + ' sai da lista do app e do controle de recebimento.\n\nOs RDAs, horas extras e todo o histórico continuam guardados.' + (e.equipe ? '\n\nAtenção: ' + e.equipe + ' pessoa(s) ainda estão na equipe dele. Elas continuam vinculadas até alguém trazê-las para outra equipe.' : '') + '\n\nDesativar?')) return;
        v.ativo = false; v.nome = e.nome; enviar(v, false);
      } else { v.ativo = true; v.nome = e.nome; enviar(v, false); }
    };
  }

  /* ----- áreas ----- */
  function cadAreas(j) {
    var box = document.getElementById('cadbox');
    if (!j) return api('admin_areas').then(function (r) { cadAreas(r); }).catch(cadErro);
    var f = A.areaBusca || '';
    var lista = j.areas.filter(function (a) { return !f || U().norm(a.c + ' ' + a.n).indexOf(U().norm(f)) >= 0; });
    box.innerHTML = '<div class="card"><div class="row" style="align-items:center"><input id="abusca" placeholder="🔍 Procurar" value="' + esc(f) + '"><button class="btn" id="anova" style="flex:0 0 auto">＋ Nova</button></div>' +
      '<p class="small muted" style="margin-bottom:0">' + j.areas.length + ' áreas. É a lista que o encarregado vê ao escolher a área da atividade. Mudanças chegam no celular na próxima vez que ele abrir o app com internet.</p></div>' +
      '<div class="card">' + (lista.map(function (a, i) {
        return '<div class="rdaline" data-ai="' + j.areas.indexOf(a) + '" style="cursor:pointer"><div class="tx"><b>' + (a.c ? esc(a.c) + ' – ' : '') + esc(a.n) + '</b><small>' + (a.c ? '' : 'sem código · ') + (a.tags ? a.tags + ' TAG(s) desta área' : 'nenhuma TAG ligada') + '</small></div><span class="muted">›</span></div>';
      }).join('') || '<p class="empty">Nenhuma área encontrada</p>') + '</div>';
    var ab = document.getElementById('abusca');
    ab.oninput = function () { A.areaBusca = ab.value; var pos = ab.selectionStart; cadAreas(j); var n = document.getElementById('abusca'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('anova').onclick = function () { areaForm(null, j); };
    [].forEach.call(box.querySelectorAll('[data-ai]'), function (r) { r.onclick = function () { areaForm(j.areas[+r.dataset.ai], j); }; });
  }
  function areaForm(a, j) {
    var nova = !a; a = a || { c: '', n: '' };
    var b = sheetUI('<h3>' + (nova ? 'Nova área' : 'Editar área') + '</h3>' +
      '<label class="f" style="margin-top:0">Código <span class="muted small">(opcional, ex.: 1050)</span></label><input id="ac" value="' + esc(a.c) + '" inputmode="numeric">' +
      '<label class="f">Nome</label><input id="an" value="' + esc(a.n) + '" autocapitalize="characters" placeholder="Ex.: PENEIRAMENTO SECUNDÁRIO">' +
      (nova ? '' : '<p class="small muted">RDAs já enviados continuam com a área escrita como estava.' + (a.tags ? ' Se mudar o código, as ' + a.tags + ' TAG(s) ligadas ao código ' + esc(a.c) + ' deixam de aparecer no filtro desta área.' : '') + '</p>') +
      '<div class="row" style="margin-top:14px">' + (nova ? '' : '<button class="btn danger" id="arm">Excluir</button>') + '<button class="btn" id="aok">' + (nova ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var go = function (rm) {
      busy('Salvando…');
      api('admin_areaSave', { orig: nova ? null : a, area: { c: b.querySelector('#ac').value, n: b.querySelector('#an').value }, remove: !!rm }).then(function (r) {
        closeUI(); done(rm ? 'Área excluída ✓' : 'Salvo ✓'); cadAreas(r);
      }).catch(function (x) { done('Erro: ' + x.message); });
    };
    b.querySelector('#aok').onclick = function () { go(false); };
    var rm = b.querySelector('#arm');
    if (rm) rm.onclick = function () { if (confirm('Excluir a área ' + (a.c ? a.c + ' – ' : '') + a.n + '?\n\nEla some da lista do app. RDAs já enviados continuam com a área escrita.')) go(true); };
  }

  /* ---------- quem faz RDA ---------- */
  function quemFaz() {
    busy('Carregando…');
    api('admin_list', { de: today(), ate: today() }).then(function (j) {
      done('');
      var encs = j.encarregados.slice().sort(function (a, b) { return (a.disciplina + a.nome).localeCompare(b.disciplina + b.nome); });
      var b = sheetUI('<h3>👷 Quem faz RDA</h3><p class="small muted">Marcados: entram no controle de recebimento e recebem os alertas de prazo e os lembretes de hora extra.</p>' +
        encs.map(function (e) { return '<label class="person" style="cursor:pointer"><input type="checkbox" data-cb="' + esc(e.nome) + '"' + (e.cobra ? ' checked' : '') + ' style="width:28px;height:28px;min-height:0;flex:0 0 28px"><div class="pinfo"><b>' + esc(e.nome) + '</b><small>' + esc(e.disciplina) + '</small></div></label>'; }).join('') +
        '<button class="btn block" style="margin-top:12px" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Fechar</button>');
      [].forEach.call(b.querySelectorAll('[data-cb]'), function (c) {
        c.onchange = function () { api('admin_setCobra', { enc: c.dataset.cb, cobra: c.checked }).then(function () { done('Salvo ✓'); }).catch(function (e) { done('Erro: ' + e.message); c.checked = !c.checked; }); };
      });
    }).catch(function (e) { done('Erro: ' + e.message); });
  }

  /* ---------- avisos (sininho da administração) ---------- */
  function avisos() {
    var el = document.getElementById('adm');
    var perm = ('Notification' in window) ? Notification.permission : 'indisponível';
    el.innerHTML = '<div class="card"><div class="card-h"><h2>Notificações neste aparelho</h2></div><p class="small muted" style="margin-top:0">Você recebe um resumo a cada hora com as novidades (RDAs enviados, alterados ou atrasados, pedidos de hora extra, mudanças de equipe). O mesmo resumo vai para o seu e-mail.</p>' +
      '<div class="row"><button class="btn orange" id="anot">🔔 ' + (perm === 'granted' ? 'Reativar notificações' : 'Ativar notificações') + '</button><button class="btn ghost" id="atest">Enviar teste</button></div>' +
      '<button class="btn ghost block" style="margin-top:8px" id="ainst">📲 Instalar como aplicativo</button></div><div class="card"><div class="card-h"><h2>Últimos avisos</h2></div><div id="alist"><p class="empty">Carregando…</p></div></div>';
    document.getElementById('ainst').onclick = function () {
      if (!/admin\.html$/.test(location.pathname)) { location.href = 'admin.html#admin'; return; }
      window.RDA_INSTALL();
    };
    if (!/admin\.html$/.test(location.pathname)) document.getElementById('ainst').textContent = '📲 Instalar o app da administração';
    else document.getElementById('ainst').insertAdjacentHTML('afterend', '<p class="small muted" style="margin:6px 0 0">Instala o ícone <b>RDA Admin</b>, separado do app dos encarregados.</p>');
    document.getElementById('anot').onclick = function () {
      window.RDA_PUSH.setVapid(sessionStorage.getItem('rda_vapid'));
      window.RDA_PUSH.ativar(function (sub) { return api('admin_pushSubscribe', { sub: sub }).then(function (r) { return DB.put('kv', 'adminToken', r.token); }); });
    };
    document.getElementById('atest').onclick = function () { busy('Enviando…'); api('admin_testPush').then(function (r) { done(r.enviados ? 'Teste enviado para ' + r.enviados + ' aparelho(s)' : 'Nenhum aparelho com notificação ativa'); }).catch(function (e) { done('Erro: ' + e.message); }); };
    api('admin_inbox').then(function (r) {
      document.getElementById('alist').innerHTML = (r.mensagens || []).map(function (m) {
        return '<div style="border-left:4px solid #0b2a5b;background:#f6f8fb;border-radius:10px;padding:10px 12px;margin-bottom:8px"><b>' + esc(m.titulo) + '</b><div class="small" style="white-space:pre-line;margin-top:4px">' + esc(m.texto) + '</div><small class="muted">' + esc(br(m.em.slice(0, 10))) + ' ' + esc(m.em.slice(11, 16)) + '</small></div>';
      }).join('') || '<p class="empty">Nenhum aviso ainda. O primeiro resumo chega na próxima hora cheia em que houver novidade.</p>';
    }).catch(function (e) { document.getElementById('alist').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  /* ---------- mensagens para os encarregados ---------- */
  function mensagens() {
    var el = document.getElementById('adm');
    el.innerHTML = '<p class="empty">Carregando…</p>';
    api('admin_list', { de: today(), ate: today() }).then(function (j) {
      var encs = j.encarregados.slice().sort(function (a, b) { return (a.disciplina + a.nome).localeCompare(b.disciplina + b.nome); });
      var discs = []; encs.forEach(function (e) { if (discs.indexOf(e.disciplina) < 0) discs.push(e.disciplina); });
      var sel = {};
      el.innerHTML = '<div class="card"><div class="card-h"><h2>✉️ Novo aviso</h2></div><label class="f" style="margin-top:0">Título</label><input id="mt" maxlength="60" placeholder="Ex.: Reunião de segurança">' +
        '<label class="f">Mensagem</label><textarea id="mx" placeholder="Escreva o aviso"></textarea>' +
        '<label class="f">Para quem</label><div class="chips"><button data-q="todos">Todos</button><button data-q="rda">Quem faz RDA</button><button data-q="nenhum">Limpar</button></div>' +
        '<div class="small muted">Por disciplina:</div><div class="chips">' + discs.map(function (d) { return '<button data-d="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + '</div>' +
        '<div id="mlist" style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:0 10px;margin-top:6px"></div>' +
        '<button class="btn orange block" id="msend" style="margin-top:12px">📤 Enviar aviso</button></div>';
      function draw() {
        document.getElementById('mlist').innerHTML = encs.map(function (e) { return '<label class="person" style="cursor:pointer;padding:6px 0"><input type="checkbox" data-p="' + esc(e.nome) + '"' + (sel[e.nome] ? ' checked' : '') + ' style="width:24px;height:24px;min-height:0;flex:0 0 24px"><div class="pinfo"><b style="font-size:15px">' + esc(e.nome) + '</b><small>' + esc(e.disciplina) + '</small></div></label>'; }).join('');
        [].forEach.call(document.querySelectorAll('[data-p]'), function (c) { c.onchange = function () { sel[c.dataset.p] = c.checked; cnt(); }; });
        cnt();
      }
      function cnt() { var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length; document.getElementById('msend').textContent = '📤 Enviar aviso' + (n ? ' para ' + n + ' pessoa(s)' : ''); }
      [].forEach.call(el.querySelectorAll('[data-q]'), function (b) { b.onclick = function () { var q = b.dataset.q; sel = {}; if (q !== 'nenhum') encs.forEach(function (e) { if (q === 'todos' || e.cobra) sel[e.nome] = true; }); draw(); }; });
      [].forEach.call(el.querySelectorAll('[data-d]'), function (b) { b.onclick = function () { encs.forEach(function (e) { if (e.disciplina === b.dataset.d) sel[e.nome] = true; }); draw(); }; });
      draw();
      document.getElementById('msend').onclick = function () {
        var para = Object.keys(sel).filter(function (k) { return sel[k]; }), t = document.getElementById('mt').value.trim(), x = document.getElementById('mx').value.trim();
        if (!t || !x) return done('Preencha o título e a mensagem');
        if (!para.length) return done('Escolha para quem enviar');
        if (!confirm('Enviar "' + t + '" para ' + para.length + ' encarregado(s)?')) return;
        busy('Enviando…');
        api('admin_sendMsg', { para: para, titulo: t, texto: x }, 120000).then(function (r) { done('Aviso enviado para ' + r.enviados + ' encarregado(s) ✓'); mensagens(); }).catch(function (e) { done('Erro: ' + e.message); });
      };
    }).catch(function (e) { el.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  /* ---------- ajuda da administração ---------- */
  var TOUR_ADM = [
    ['📊', 'Recebimento', 'Mostra quem entregou o RDA, quem está no prazo (até 12:00 do próximo dia de atividade) e quem está atrasado. Toque num dia sem RDA para marcar a situação (folga de campo, paralisação…). Em <b>"Quem faz RDA"</b> você escolhe quem é cobrado.'],
    ['📄', 'RDAs e exportação', 'Escolha o período e baixe o <b>PDF</b> (no modelo do RDA impresso, com as fotos) ou a <b>planilha</b> com todos os registros e o controle de recebimento.'],
    ['⏱', 'Horas extras', 'Aprove ou reprove os pedidos de extensão e escala. Daqui saem as <b>permissões</b> em PDF e a lista nominal do dia.'],
    ['🔔', 'Avisos', 'Ative as notificações neste aparelho para receber o resumo de hora em hora. O mesmo resumo vai para o seu e-mail.'],
    ['✉️', 'Mensagens', 'Envie avisos para todos, por disciplina ou para pessoas escolhidas. Eles recebem no celular e no sininho do app.'],
    ['⬆️', 'Programação, frota e projetos', 'Toda semana importe a programação semanal; quando mudar a frota, importe a posição de frota; quando sair revisão nova no Greendocs, importe a lista de projetos. Em <b>📅 Feriados</b> marque os feriados da obra.']
  ];
  function tourAdmin(force) {
    DB.get('kv', 'tourAdm1').then(function (v) {
      if (v && !force) return;
      var i = 0;
      function step() {
        var t = TOUR_ADM[i];
        var b = sheetUI('<div style="text-align:center;font-size:50px;margin:4px 0">' + t[0] + '</div><h3 style="text-align:center">' + t[1] + '</h3><div style="font-size:16px;line-height:1.5">' + t[2] + '</div>' +
          '<div style="display:flex;justify-content:center;gap:6px;margin:14px 0">' + TOUR_ADM.map(function (_, k) { return '<span style="width:9px;height:9px;border-radius:50%;background:' + (k === i ? 'var(--navy)' : '#c9d1dd') + '"></span>'; }).join('') + '</div>' +
          '<div class="row"><button class="btn ghost" id="tb">' + (i ? '‹ Voltar' : 'Pular') + '</button><button class="btn" id="tn">' + (i === TOUR_ADM.length - 1 ? 'Começar ✓' : 'Próximo ›') + '</button></div>');
        b.querySelector('#tn').onclick = function () { if (i === TOUR_ADM.length - 1) { closeUI(); DB.put('kv', 'tourAdm1', 1); } else { i++; step(); } };
        b.querySelector('#tb').onclick = function () { if (i) { i--; step(); } else { closeUI(); DB.put('kv', 'tourAdm1', 1); } };
      }
      step();
    });
  }


  /* ---------- folgas de campo ---------- */
  function folgas() {
    var el = document.getElementById('adm');
    el.innerHTML = '<p class="empty">Carregando…</p>';
    Promise.all([api('admin_folgas'), api('admin_list', { de: today(), ate: today() })]).then(function (x) {
      var lista = x[0].folgas.sort(function (a, b) { return a.ini < b.ini ? 1 : -1; }), encs = x[1].encarregados.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      el.innerHTML = '<div class="card"><div class="card-h"><h2>🏖 Registrar folga de campo</h2></div>' +
        '<label class="f" style="margin-top:0">Encarregado</label><select id="fe"><option value="">Escolha…</option>' + encs.map(function (e) { return '<option>' + esc(e.nome) + '</option>'; }).join('') + '</select>' +
        '<div class="grid2"><div><label class="f">Início</label><input type="date" id="fi"></div><div><label class="f">Fim</label><input type="date" id="ff"></div></div>' +
        '<label class="f">Quem faz o RDA no período</label><select id="ft"><option value="">Ninguém (equipe transferida ou parada) – não cobra RDA</option><option value="MEMBRO">Alguém da própria equipe</option><option value="ENCARREGADO">Outro encarregado</option></select>' +
        '<div id="fsbox" class="hidden"><label class="f">Nome</label><input id="fs" list="fsl" placeholder="Digite o nome"><datalist id="fsl"></datalist></div>' +
        '<label class="f">Observação</label><input id="fo">' +
        '<button class="btn orange block" id="fsave" style="margin-top:12px">Salvar folga</button></div>' +
        '<div class="card"><div class="card-h"><h2>Folgas registradas</h2></div>' + (lista.map(function (f) {
          var at = f.ini <= today() && today() <= f.fim;
          return '<div class="rdaline"><div class="tx"><b>' + esc(f.enc) + (at ? ' <span class="tag" style="background:#e3f2fd;color:#0b4f9c">de folga agora</span>' : '') + '</b><small>' + br(f.ini) + ' a ' + br(f.fim) + ' · ' + (f.subst ? 'RDA por ' + esc(f.subst) + (f.tipo === 'ENCARREGADO' ? ' (encarregado)' : ' (da equipe)') : 'sem RDA no período') + (f.obs ? ' · ' + esc(f.obs) : '') + '</small></div><button class="btn sm danger" data-fdel="' + esc(f.id) + '">Excluir</button></div>';
        }).join('') || '<p class="empty">Nenhuma folga registrada</p>') + '</div>';
      var ft = document.getElementById('ft'), fe = document.getElementById('fe');
      function opts() {
        var t = ft.value; document.getElementById('fsbox').classList.toggle('hidden', !t);
        var nomes = t === 'ENCARREGADO' ? encs.filter(function (e) { return e.nome !== fe.value; }).map(function (e) { return e.nome; }) : (x[1].efetivo || []);
        document.getElementById('fsl').innerHTML = nomes.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
      }
      ft.onchange = opts; fe.onchange = function () {
        if (ft.value === 'MEMBRO') api('bootstrap', { enc: fe.value }).then(function (b) { x[1].efetivo = b.efetivo.filter(function (p) { return p.enc === fe.value; }).map(function (p) { return p.nome; }); opts(); });
        else opts();
      };
      ft.addEventListener('change', function () { if (ft.value === 'MEMBRO' && fe.value) fe.onchange(); });
      document.getElementById('fsave').onclick = function () {
        var f = { enc: fe.value, ini: document.getElementById('fi').value, fim: document.getElementById('ff').value, tipo: ft.value, subst: ft.value ? document.getElementById('fs').value.trim() : '', obs: document.getElementById('fo').value.trim() };
        if (!f.enc || !f.ini || !f.fim) return done('Preencha encarregado, início e fim');
        if (f.fim < f.ini) return done('O fim é antes do início');
        if (f.tipo && !f.subst) return done('Informe quem faz o RDA');
        busy('Salvando…'); api('admin_setFolga', { folga: f }).then(function () { done('Folga registrada ✓'); folgas(); }).catch(function (e) { done('Erro: ' + e.message); });
      };
      [].forEach.call(el.querySelectorAll('[data-fdel]'), function (b) { b.onclick = function () { if (!confirm('Excluir esta folga?')) return; api('admin_setFolga', { folga: { id: b.dataset.fdel }, remove: true }).then(function () { done('Excluída'); folgas(); }); }; });
    }).catch(function (e) { el.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  window.RDA_ADMIN = { render: render };
})();

/* RDA Almas — aplicativo do encarregado (funciona offline) */
(function () {
  'use strict';
  var CFG = window.RDA_CONFIG || {};
  var MURO_ATIVS = ['MONTAGEM DAS ESCAMAS', 'ALINHAMENTO DAS ESCAMAS', 'REATERRO E COMPACTAÇÃO - 1ª CAMADA', 'LANÇAMENTO DE BRITA - 1ª CAMADA',
    'APLICAÇÃO DAS FITAS METÁLICAS', 'REATERRO E COMPACTAÇÃO - 2ª CAMADA', 'LANÇAMENTO DE BRITA - 2ª CAMADA'];
  var CLIMA = [['BOM', '☀️'], ['NUBLADO', '☁️'], ['CHUVOSO', '🌧️']];
  var DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  var DEFAULT_STATUS = [
    { s: 'PRESENTE', w: true, c: '#1e8e3e' }, { s: 'FALTA', w: false, c: '#d93025' }, { s: 'ATESTADO', w: false, c: '#e8710a' },
    { s: 'FÉRIAS', w: false, c: '#1a73e8' }, { s: 'FOLGA', w: false, c: '#5f6368' }, { s: 'FOLGA DE CAMPO', w: false, c: '#80868b' },
    { s: 'TREINAMENTO', w: true, c: '#9334e6' }, { s: 'SERVIÇO EXTERNO', w: true, c: '#129eaf' }, { s: 'EXAME PERIÓDICO', w: false, c: '#b06000' },
    { s: 'AFASTADO INSS', w: false, c: '#a50e0e' }, { s: 'DEMITIDO', w: false, c: '#202124' }];

  var S = { boot: null, me: null, key: '', draft: null, syncing: false, online: navigator.onLine, pending: 0, saveT: null };
  var $app = document.getElementById('app');

  /* ---------------- utilidades ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function p2(n) { return ('0' + n).slice(-2); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dow(s) { return new Date(s + 'T12:00:00').getDay(); }
  function br(s) { if (!s) return ''; var a = s.split('-'); return a[2] + '/' + a[1] + '/' + a[0]; }
  function monday(s) { var w = dow(s); return addDays(s, w === 0 ? -6 : 1 - w); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function fmtN(n) { var x = Number(n); return isNaN(x) ? String(n) : String(Math.round(x * 100) / 100).replace('.', ','); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function toast(msg, ms) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.add('hidden'); }, ms || 2600); }
  function statusList() { return (S.boot && S.boot.status && S.boot.status.length) ? S.boot.status : DEFAULT_STATUS; }
  function stInfo(s) { return statusList().filter(function (x) { return x.s === s; })[0] || { s: s, w: false, c: '#5f6368' }; }
  function isHoliday(d) { return (S.boot && S.boot.feriados || []).some(function (f) { return f.d === d; }); }
  function horario(d) { var w = dow(d); var curto = (w === 5 || w === 6 || w === 0 || isHoliday(d)); return { ini: '06:30', fim: curto ? '15:30' : '16:30' }; }
  function rdaNumero(enc, d) {
    if (!enc) return '';
    var n = enc.refData && enc.refNum ? enc.refNum + daysBetween(enc.refData, d) : 0;
    return 'RDA-' + (enc.cod || 'RDA') + '-' + enc.curto + '-' + (n > 0 ? ('000' + n).slice(-4) : '????');
  }
  function sheet(html) { var s = document.getElementById('sheet'); document.getElementById('sheetbody').innerHTML = html; s.classList.remove('hidden'); s.querySelector('.sheet-bg').onclick = closeSheet; return document.getElementById('sheetbody'); }
  function closeSheet() { document.getElementById('sheet').classList.add('hidden'); }
  window.RDA_UTIL = { esc: esc, br: br, norm: norm, statusInfo: stInfo, MURO_ATIVS: MURO_ATIVS };

  /* ---------------- API ---------------- */
  function api(action, data, timeoutMs) {
    if (!CFG.API_URL) return Promise.reject(new Error('Aplicativo ainda sem servidor configurado'));
    var body = Object.assign({ action: action, key: S.key }, data || {});
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, timeoutMs || 60000);
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl && ctl.signal, redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(t); if (!j.ok) { var e = new Error(j.error || 'Erro'); e.auth = j.auth === false; throw e; } return j; })
      .catch(function (e) { clearTimeout(t); throw e; });
  }
  window.RDA_API = function (action, data, t) { return api(action, data, t); };

  /* ---------------- sincronização ---------------- */
  function setPill() {
    var p = document.getElementById('syncpill'), t = document.getElementById('synctext');
    p.className = 'pill ' + (S.syncing ? 'busy' : (S.online ? 'on' : 'off'));
    if (S.syncing) t.textContent = 'Enviando…';
    else if (S.pending) t.textContent = (S.online ? '' : 'Sem internet · ') + S.pending + ' para enviar';
    else t.textContent = S.online ? 'Tudo enviado' : 'Sem internet';
  }
  function countPending() { return DB.all('queue').then(function (q) { S.pending = q.length; setPill(); return q; }); }
  function enqueue(op) { op.id = op.id || uid(); op.ts = Date.now(); return DB.put('queue', op.ts + '_' + op.id, op).then(countPending); }

  function refreshBoot() {
    if (!navigator.onLine || !CFG.API_URL || !S.key) return Promise.resolve(false);
    return api('bootstrap', { enc: S.me ? S.me.nome : '', refV: S.refs ? S.refs.v : '' }, 30000).then(function (b) {
      if (b.refs && !b.refs.same) { S.refs = b.refs; DB.put('kv', 'refs', b.refs); }
      delete b.refs;
      S.boot = b; S.online = true;
      return DB.put('kv', 'boot', b).then(function () { return migraRenomes(b.renomes); }).then(function () { return applyLocalTeamOps(); }).then(function () { return true; });
    }).catch(function (e) { if (e.auth) { S.key = ''; DB.del('kv', 'key'); render(); } return false; });
  }
  // encarregado que teve o nome trocado na administração: leva rascunhos, fila e login para o nome novo
  function migraRenomes(m) {
    if (!m || !Object.keys(m).length) return Promise.resolve();
    var res = function (n) { var k = 0; while (n && m[n] && k++ < 10) n = m[n]; return n; };
    var info = function (n) { return (S.boot.encarregados || []).filter(function (e) { return e.nome === n; })[0]; };
    var idMap = {};
    return DB.all('drafts').then(function (all) {
      return Promise.all(all.map(function (x) {
        var d = x.value; if (!d || !d.enc) return null;
        var nn = res(d.enc); if (nn === d.enc) return null;
        var e = info(nn), nd = Object.assign({}, d, { enc: nn, id: nn + '|' + d.date });
        if (e) { nd.curto = e.curto; nd.cod = e.cod; nd.disciplina = e.disciplina; nd.supervisor = e.supervisor; }
        idMap[x.key] = nd.id;
        return DB.get('drafts', nd.id).then(function (ex) {
          return (ex && (ex.updatedAt || 0) >= (d.updatedAt || 0) ? Promise.resolve() : DB.put('drafts', nd.id, nd)).then(function () { return DB.del('drafts', x.key); });
        });
      }));
    }).then(function () { return DB.all('queue'); }).then(function (q) {
      return Promise.all(q.map(function (it) {
        var op = it.value, ch = false;
        if (op.draftId && idMap[op.draftId]) { op.draftId = idMap[op.draftId]; ch = true; }
        if (op.enc && res(op.enc) !== op.enc) { op.enc = res(op.enc); ch = true; }
        return ch ? DB.put('queue', it.key, op) : null;
      }));
    }).then(function () { return DB.get('kv', 'me'); }).then(function (me) {
      if (!me || res(me) === me) return;
      var nn = res(me);
      if (S.me && S.me.nome === me) S.me = info(nn) || Object.assign({}, S.me, { nome: nn });
      if (S.draft && idMap[S.draft.id]) S.draft = null;
      setTimeout(function () { if (location.hash !== '#admin') render(); }, 0);
      return Promise.all([DB.put('kv', 'me', nn),
        DB.get('kv', 'he:' + me).then(function (l) { if (!l) return; l.forEach(function (h) { h.enc = nn; }); return DB.put('kv', 'he:' + nn, l).then(function () { return DB.del('kv', 'he:' + me); }); }),
        DB.get('kv', 'inbox:' + me).then(function (l) { if (l) return DB.put('kv', 'inbox:' + nn, l); })]);
    });
  }
  // mantém alterações de equipe ainda não enviadas por cima do que veio do servidor
  function applyLocalTeamOps() {
    return DB.all('queue').then(function (q) {
      q.forEach(function (it) { if (it.value.type === 'team') applyTeamChanges(it.value.enc, it.value.changes); });
      if (S.me) S.me = (S.boot.encarregados.filter(function (e) { return e.nome === S.me.nome; })[0]) || S.me;
    });
  }
  function applyTeamChanges(enc, changes) {
    (changes || []).forEach(function (c) {
      S.boot.efetivo.forEach(function (p) {
        if (p.chapa !== c.chapa) return;
        if (c.op === 'add') p.enc = enc; else if (c.op === 'remove' && p.enc === enc) p.enc = S.boot.livre || 'SEM EQUIPE';
      });
    });
  }

  function sync() {
    if (S.syncing || !navigator.onLine || !CFG.API_URL || !S.key) return Promise.resolve();
    S.syncing = true; setPill();
    return DB.all('queue').then(function (q) {
      q.sort(function (a, b) { return a.value.ts - b.value.ts; });
      var chain = Promise.resolve();
      q.forEach(function (it) {
        chain = chain.then(function () {
          var op = it.value;
          var job = op.type === 'team' ? api('teamChange', { enc: op.enc, changes: op.changes }) : op.type === 'he' ? sendHe(op.heId) : sendRda(op.draftId);
          return job.then(function () { return DB.del('queue', it.key); });
        });
      });
      return chain;
    }).then(function () { return refreshBoot(); }).then(function () { return refreshInbox(); })
      .catch(function (e) { console.warn('sync', e); if (!/servidor/.test(e.message)) S.online = navigator.onLine; })
      .then(function () { S.syncing = false; return countPending(); })
      .then(function () { if (S.draft) { DB.get('drafts', S.draft.id).then(function (d) { if (d && S.draft && d.id === S.draft.id) { S.draft.state = d.state; S.draft.numero = d.numero; S.draft.enviadoEm = d.enviadoEm; updateHeadState(); } }); } });
  }

  function photoFileName(d, ativIdx, seq) {
    return d.date + ' - ' + norm(d.disciplina) + ' - ' + norm(d.curto) + ' - Ativ ' + (ativIdx + 1) + ' - ' + p2(seq + 1) + '.jpg';
  }
  function sendRda(draftId) {
    return DB.get('drafts', draftId).then(function (d) {
      if (!d) return;
      var jobs = [];
      d.atividades.forEach(function (a, ai) {
        (a.fotos || []).forEach(function (pid, pi) {
          jobs.push(function () {
            return DB.get('photos', pid).then(function (ph) {
              if (!ph || ph.fileId) return;
              var name = photoFileName(d, ai, pi);
              return api('uploadPhoto', { id: pid, rdaId: d.id, rdaNum: d.numero, date: d.date, enc: d.enc, disc: d.disciplina, ativ: 'Ativ ' + (ai + 1) + ' - ' + (a.desc || ''), fileName: name, takenAt: ph.takenAt, data: ph.data }, 120000)
                .then(function (r) { ph.fileId = r.fileId; ph.url = r.url; ph.fileName = name; return DB.put('photos', pid, ph); });
            });
          });
        });
      });
      if (d.assinatura) jobs.push(function () {
        return DB.get('photos', d.assinatura).then(function (ph) {
          if (!ph || ph.fileId) return;
          var name = d.date + ' - ' + norm(d.disciplina) + ' - ' + norm(d.curto) + ' - ASSINATURA.png';
          return api('uploadPhoto', { id: d.assinatura, kind: 'assinatura', rdaId: d.id, rdaNum: d.numero, date: d.date, enc: d.enc, disc: d.disciplina, fileName: name, takenAt: ph.takenAt, data: ph.data })
            .then(function (r) { ph.fileId = r.fileId; return DB.put('photos', d.assinatura, ph); });
        });
      });
      return jobs.reduce(function (c, j) { return c.then(j); }, Promise.resolve()).then(function () { return payload(d); })
        .then(function (pl) { return api('submitRda', { rda: pl }, 90000); })
        .then(function (r) {
          return DB.get('drafts', draftId).then(function (cur) {
            cur = cur || d;
            if (cur.updatedAt <= d.updatedAt) cur.state = 'enviado';
            cur.numero = r.numero; cur.enviadoEm = new Date().toISOString();
            return DB.put('drafts', draftId, cur);
          });
        });
    });
  }
  function payload(d) {
    var ids = []; d.atividades.forEach(function (a) { ids = ids.concat(a.fotos || []); });
    if (d.assinatura) ids.push(d.assinatura);
    return Promise.all(ids.map(function (id) { return DB.get('photos', id); })).then(function (phs) {
      var m = {}; phs.forEach(function (p, i) { if (p) m[ids[i]] = p; });
      var r = JSON.parse(JSON.stringify(d));
      r.atividades.forEach(function (a) { a.fotos = (a.fotos || []).map(function (id) { var p = m[id] || {}; return { id: id, fileId: p.fileId, fileName: p.fileName, takenAt: p.takenAt }; }); });
      r.assinaturaFileId = d.assinatura && m[d.assinatura] ? m[d.assinatura].fileId : '';
      r.assinaturaId = r.assinaturaFileId;
      delete r.assinatura;
      return r;
    });
  }

  window.addEventListener('online', function () { S.online = true; setPill(); sync(); });
  window.addEventListener('offline', function () { S.online = false; setPill(); });
  setInterval(function () { if (navigator.onLine) sync(); }, 90000);
  document.getElementById('syncpill').onclick = function () { if (navigator.onLine) { toast('Sincronizando…'); sync().then(function () { toast(S.pending ? 'Ainda há ' + S.pending + ' item(ns) na fila' : 'Tudo enviado ✓'); }); } else toast('Sem internet. Os dados ficam guardados no celular.'); };

  /* ---------------- telas ---------------- */
  function render() {
    closeSheet();
    if (location.hash === '#admin') { if (window.RDA_ADMIN) return window.RDA_ADMIN.render($app); }
    if (!S.key) return renderKey();
    if (!S.boot) return renderLoading();
    if (!S.me) return renderPick();
    if (S.view === 'he') return renderHe();
    if (S.view === 'heform') return renderHeForm();
    return renderRda();
  }
  window.addEventListener('hashchange', render);

  function renderLoading() {
    $app.innerHTML = '<div class="card"><h2>Carregando…</h2><p class="muted">Na primeira vez é preciso estar com internet para baixar as equipes.</p><button class="btn block" id="retry">Tentar de novo</button></div>';
    document.getElementById('retry').onclick = function () { refreshBoot().then(function (ok) { if (!ok) toast('Sem conexão com o servidor'); render(); }); };
  }

  function renderKey() {
    $app.innerHTML = '<h1>Bem-vindo ao RDA</h1><div class="card"><label class="f">Código de acesso da obra</label><input id="k" autocapitalize="characters" placeholder="Digite o código"><p class="small muted">Peça o código para o planejamento. Só é pedido uma vez.</p><button class="btn big" id="go">Entrar</button></div>';
    document.getElementById('go').onclick = function () {
      var k = document.getElementById('k').value.trim(); if (!k) return;
      S.key = k;
      toast('Verificando…');
      refreshBoot().then(function (ok) {
        if (ok) { DB.put('kv', 'key', k); toast('Código aceito ✓', 1200); render(); }
        else { S.key = ''; toast(navigator.onLine ? 'Código inválido' : 'Precisa de internet na primeira vez'); }
      });
    };
  }

  function renderPick() {
    var list = S.boot.encarregados.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    $app.innerHTML = '<h1>Quem é você?</h1><div class="search"><input id="q" placeholder="Procure seu nome"></div><div class="namelist" id="nl"></div>';
    function draw(f) {
      var nf = norm(f);
      document.getElementById('nl').innerHTML = list.filter(function (e) { return !nf || norm(e.nome).indexOf(nf) >= 0; }).map(function (e) {
        var n = S.boot.efetivo.filter(function (p) { return p.enc === e.nome; }).length;
        return '<button data-n="' + esc(e.nome) + '"><span><b>' + esc(e.nome) + '</b><small>' + esc(e.disciplina) + ' · ' + n + ' pessoas</small></span><span class="tag">' + esc(e.cod) + '</span></button>';
      }).join('') || '<p class="empty">Nenhum nome encontrado</p>';
      [].forEach.call(document.querySelectorAll('#nl button'), function (b) {
        b.onclick = function () {
          S.me = S.boot.encarregados.filter(function (e) { return e.nome === b.dataset.n; })[0];
          DB.put('kv', 'me', S.me.nome); openDraft(today()); S.inbox = []; refreshInbox(); setTimeout(function () { tour(); }, 400);
        };
      });
    }
    document.getElementById('q').oninput = function () { draw(this.value); };
    draw('');
  }

  function isMe(nome) { return !!S.me && (nome === S.me.nome || nome.indexOf(S.me.nome + ' ') === 0); }
  function myTeam() { return S.boot.efetivo.filter(function (p) { return p.enc === S.me.nome; }).sort(function (a, b) { return isMe(a.nome) ? -1 : isMe(b.nome) ? 1 : a.nome.localeCompare(b.nome); }); }

  function openDraft(date) {
    var id = S.me.nome + '|' + date;
    DB.get('drafts', id).then(function (d) {
      if (d) { S.draft = d; return render(); }
      return lastDraftBefore(date).then(function (prev) {
        var prevSt = {}; if (prev) prev.team.forEach(function (t) { prevSt[t.chapa] = t.status; });
        var h = horario(date);
        S.draft = {
          id: id, enc: S.me.nome, curto: S.me.curto, cod: S.me.cod, date: date, numero: rdaNumero(S.me, date), disciplina: S.me.disciplina, supervisor: S.me.supervisor,
          modelo: S.me.modelo || 'PADRAO', clima: { dia: '', tarde: '', noite: '' }, chuvaIni: '', chuvaFim: '', periodo: h.ini + ' AS ' + h.fim,
          team: myTeam().map(function (p) {
            var st = prevSt[p.chapa] || p.st || 'PRESENTE';
            if (!statusList().some(function (x) { return x.s === st; })) st = 'PRESENTE';
            var w = stInfo(st).w;
            return { chapa: p.chapa, nome: p.nome, funcao: p.funcao, status: st, inicio: w ? h.ini : '', termino: w ? h.fim : '', custom: false };
          }),
          atividades: [], equipamentos: [], paralisacoes: [], assinatura: '', state: 'rascunho', createdAt: Date.now(), updatedAt: Date.now(),
          preenchidoPor: S.cover ? S.cover.nome : ((folgaHoje(S.me.nome, date) || {}).tipo === 'MEMBRO' ? folgaHoje(S.me.nome, date).subst : '')
        };
        if (S.draft.modelo === 'MURO') S.draft.atividades = [];
        return DB.put('drafts', id, S.draft).then(render);
      });
    });
  }
  function lastDraftBefore(date) {
    return DB.all('drafts').then(function (all) {
      var mine = all.map(function (x) { return x.value; }).filter(function (d) { return d.enc === S.me.nome && d.date < date; });
      mine.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      return mine[0] || null;
    });
  }

  function save(now) {
    if (!S.draft) return;
    S.draft.updatedAt = Date.now();
    if (S.draft.state === 'enviado') { S.draft.state = 'alterado'; updateHeadState(); }
    clearTimeout(S.saveT);
    var d = S.draft;
    var go = function () { return DB.put('drafts', d.id, d); };
    if (now) return go();
    S.saveT = setTimeout(go, 400);
  }

  function stateLabel(d) {
    if (d.state === 'enviado') return '<span class="statebadge enviado">✓ Enviado</span>';
    if (d.state === 'fila') return '<span class="statebadge fila">⏳ Aguardando internet</span>';
    if (d.state === 'alterado') return '<span class="statebadge fila">Alterado · reenviar</span>';
    return '<span class="statebadge">Rascunho salvo no celular</span>';
  }
  function updateHeadState() { var el = document.getElementById('stbadge'); if (el && S.draft) el.innerHTML = stateLabel(S.draft); var n = document.getElementById('rdanum'); if (n && S.draft) n.textContent = S.draft.numero; }

  /* ---------- tela principal do RDA ---------- */
  function renderRda() {
    var d = S.draft;
    if (!d || d.enc !== S.me.nome) return openDraft(today());
    applyHe(d);
    var w = dow(d.date);
    var feriado = isHoliday(d.date);
    var html = '';
    html += '<div class="rdahead"><div class="num" id="rdanum">' + esc(d.numero) + '</div><div class="who">' + esc(S.me.nome) + '</div>' +
      '<div class="meta">' + esc(d.disciplina) + ' · Supervisor: ' + esc(d.supervisor) + '</div>' +
      '<div style="margin-top:8px" id="stbadge">' + stateLabel(d) + '</div>' +
      '<div class="daybar"><button id="dprev">‹</button><div class="d">' + br(d.date) + '<small>' + DIAS[w] + (feriado ? ' · FERIADO' : '') + (d.date === today() ? ' · hoje' : '') + ' · ' + esc(d.periodo) + '</small></div><button id="dnext"' + (d.date >= today() ? ' disabled style="opacity:.3"' : '') + '>›</button></div></div>';

    html += '<button id="gohe" class="hebig"><span class="ic">⏱</span><span class="tx"><b>HORA EXTRA</b><small id="hestatus">Pedir extensão de horário ou escala</small></span><span class="go">›</span></button>';
    html += '<div id="pendbox"></div>';
    var fh = folgaHoje(S.me.nome, d.date);
    if (S.cover) html += '<div class="alert" style="background:#e3f2fd;border-color:#90caf9">🏖 Você está fazendo o RDA da equipe de <b>' + esc(S.me.nome) + '</b> (folga de campo). <button class="btn sm" id="covervolta" style="margin-top:8px">‹ Voltar para o meu RDA</button></div>';
    else if (fh) html += '<div class="alert" style="background:#e3f2fd;border-color:#90caf9">🏖 <b>' + esc(S.me.nome) + '</b> está de folga de campo de ' + br(fh.ini).slice(0, 5) + ' a ' + br(fh.fim).slice(0, 5) + '.' + (fh.subst ? ' Quem preenche o RDA: <b>' + esc(fh.subst) + '</b>.' : ' Neste período o RDA não é cobrado.') + '</div>';
    cobrindo(d.date).forEach(function (f) { html += '<button class="hebig" data-cover="' + esc(f.enc) + '" style="background:linear-gradient(135deg,#1565c0,#42a5f5);box-shadow:0 4px 14px #1565c055"><span class="ic">🏖</span><span class="tx"><b>FOLGA DE ' + esc((f.enc || '').split(' ')[0]) + '</b><small>Fazer RDA da equipe de ' + esc(f.enc) + ' (até ' + br(f.fim).slice(0, 5) + ')</small></span><span class="go">›</span></button>'; });
    html += cardClima(d) + cardEquipe(d) + cardProg(d) + (d.modelo === 'MURO' ? cardMuro(d) : cardAtividades(d)) + cardEquip(d) + cardParal(d) + cardAssin(d);
    html += '<div class="card"><button class="link" id="trocar">Trocar encarregado</button> · <button class="link" id="hist">Meus RDAs</button> · <button class="link" id="ajuda">❓ Ajuda</button></div>';
    html += '<div class="bottombar"><button class="btn ghost" id="bsave">💾 Salvar</button><button class="btn orange" id="bsend">📤 Enviar RDA</button></div>';
    $app.innerHTML = html;
    bindRda();
  }

  function cardClima(d) {
    var h = '<div class="card"><div class="card-h"><h2><span class="n">1</span>Condições do tempo</h2></div><div class="clima"><div></div>' +
      CLIMA.map(function (c) { return '<div class="hd">' + c[0] + '</div>'; }).join('');
    [['dia', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']].forEach(function (p) {
      h += '<div class="lb">' + p[1] + '</div>' + CLIMA.map(function (c) { return '<button data-p="' + p[0] + '" data-v="' + c[0] + '" class="' + (d.clima[p[0]] === c[0] ? 'sel' : '') + '"><i>' + c[1] + '</i>' + c[0].charAt(0) + c[0].slice(1).toLowerCase() + '</button>'; }).join('');
    });
    h += '</div>';
    var chuva = d.clima.dia === 'CHUVOSO' || d.clima.tarde === 'CHUVOSO' || d.clima.noite === 'CHUVOSO' || d.chuvaIni;
    h += '<div id="chuvabox" class="' + (chuva ? '' : 'hidden') + '"><label class="f">Horário da chuva</label><div class="row"><div><small class="muted">Início</small><input type="time" id="cini" value="' + esc(d.chuvaIni) + '"></div><div><small class="muted">Término</small><input type="time" id="cfim" value="' + esc(d.chuvaFim) + '"></div></div></div></div>';
    return h;
  }

  function cardEquipe(d) {
    var cnt = {}; d.team.forEach(function (t) { cnt[t.status] = (cnt[t.status] || 0) + 1; });
    var h = '<div class="card"><div class="card-h"><h2><span class="n">2</span>Equipe (' + d.team.length + ')</h2></div>';
    h += '<div class="teamsum">' + Object.keys(cnt).map(function (k) { return '<span style="color:' + stInfo(k).c + '">' + cnt[k] + ' ' + esc(k.toLowerCase()) + '</span>'; }).join('') + '</div>';
    h += '<p class="small muted" style="margin:0 0 6px">Toque no status para mudar. O horário entra sozinho; toque nele para ajustar.</p>';
    d.team.forEach(function (t, i) {
      var si = stInfo(t.status);
      h += '<div class="person"><div class="pinfo"><b>' + esc(t.nome) + '</b><small>' + esc(t.chapa) + ' · ' + esc(t.funcao) + '</small>' +
        (si.w ? '<div><button class="hrs' + (t.custom ? ' custom' : '') + '" data-h="' + i + '">🕒 ' + esc(t.inicio || '--:--') + ' – ' + esc(t.termino || '--:--') + (t.custom ? ' ✎' : '') + '</button></div>' : '') +
        '</div><button class="stbtn" data-s="' + i + '" style="background:' + si.c + '">' + esc(t.status) + '</button>' +
        (isMe(t.nome) ? '<span style="width:36px"></span>' : '<button class="rm" data-r="' + i + '" title="Remover da equipe">✕</button>') + '</div>';
    });
    h += '<div class="row" style="margin-top:10px"><button class="btn ghost" id="addp">＋ Adicionar pessoa</button><button class="btn ghost" id="allp">Todos presentes</button></div></div>';
    return h;
  }

  function weekItems(d) {
    var seg = monday(d.date);
    return (S.boot.programacao || []).filter(function (p) { return p.enc === S.me.nome && p.semana === seg; });
  }
  function localProgStatus() {
    // status de programação a partir dos RDAs deste celular (vale mesmo offline)
    return DB.all('drafts').then(function (all) {
      var m = {};
      all.forEach(function (x) { var d = x.value; if (d.enc !== S.me.nome) return; d.atividades.forEach(function (a) { if (a.progId) { var cur = m[a.progId]; var v = { st: a.concluida ? 'REALIZADO' : 'EM ANDAMENTO', d: d.date }; if (!cur || cur.st !== 'REALIZADO') m[a.progId] = v; } }); });
      return m;
    });
  }
  function cardProg(d) {
    var items = weekItems(d);
    var h = '<div class="card" id="progcard"><div class="card-h"><h2><span class="n">3</span>Programação da semana</h2></div>';
    if (!items.length) return h + '<p class="empty">Nenhuma atividade programada para você nesta semana.</p></div>';
    return h + '<div id="proglist"><p class="empty">Carregando…</p></div></div>';
  }
  function fillProg(d) {
    var items = weekItems(d); if (!items.length) return;
    localProgStatus().then(function (loc) {
      var done = 0;
      items = items.slice().sort(function (a, b) { return ((b.dia || {})[d.date] ? 1 : 0) - ((a.dia || {})[d.date] ? 1 : 0); });
      var rows = items.map(function (p) {
        var st = p.status || ''; var l = loc[p.id];
        if (l && (l.st === 'REALIZADO' || st !== 'REALIZADO')) st = l.st;
        if (st === 'REALIZADO') done++;
        var linked = d.atividades.some(function (a) { return a.progId === p.id; });
        var cls = st === 'REALIZADO' ? 'done' : st === 'EM ANDAMENTO' ? 'part' : '';
        var hoje = (p.dia || {})[d.date];
        return '<div class="pitem ' + cls + '"><div class="ic">' + (st === 'REALIZADO' ? '✓' : st === 'EM ANDAMENTO' ? '◐' : '○') + '</div><div class="tx">' +
          (hoje ? '<span class="tag" style="background:#fff1e6;color:#a34600">HOJE: ' + esc(fmtN(hoje)) + ' ' + esc(p.un || '') + '</span>' : '') + '<b>' + esc(p.atividade) + '</b><small>' +
          [p.area, p.qtd !== '' && p.qtd != null ? ('Semana: ' + fmtN(p.qtd) + ' ' + (p.un || '')) : '', p.real ? ('Feito: ' + fmtN(p.real) + ' ' + (p.un || '')) : '', p.dias].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
          (linked ? '<span class="tag">no RDA</span>' : (st === 'REALIZADO' ? '' : '<button class="btn sm" data-pg="' + esc(p.id) + '">Fiz hoje</button>')) + '</div>';
      });
      var pct = Math.round(done * 100 / items.length);
      var el = document.getElementById('proglist'); if (!el) return;
      var nHoje = items.filter(function (p) { return (p.dia || {})[d.date]; }).length;
      if (S.progAll == null) S.progAll = !nHoje;
      var vis = rows.filter(function (r, i) { return S.progAll || (items[i].dia || {})[d.date] || d.atividades.some(function (a) { return a.progId === items[i].id; }); });
      el.innerHTML = '<div class="small"><b>' + done + ' de ' + items.length + '</b> concluídas na semana (' + pct + '%)</div><div class="progbar"><div style="width:' + pct + '%"></div></div>' +
        '<div class="week"><button data-pv="0" class="' + (S.progAll ? '' : 'sel') + '">Para ' + (d.date === today() ? 'hoje' : br(d.date).slice(0, 5)) + '<small>' + nHoje + ' itens</small></button><button data-pv="1" class="' + (S.progAll ? 'sel' : '') + '">Semana toda<small>' + items.length + ' itens</small></button></div>' +
        (vis.join('') || '<p class="empty">Nada programado para este dia. Toque em “Semana toda”.</p>');
      [].forEach.call(el.querySelectorAll('[data-pv]'), function (b) { b.onclick = function () { S.progAll = b.dataset.pv === '1'; fillProg(d); }; });
      [].forEach.call(el.querySelectorAll('[data-pg]'), function (b) {
        b.onclick = function () {
          var p = items.filter(function (x) { return x.id === b.dataset.pg; })[0];
          var hq = (p.dia || {})[d.date];
          var a = { uid: uid(), desc: p.atividade, area: p.area || '', qtd: hq ? fmtN(hq) : '', progId: p.id, concluida: true, fotos: [] };
          if (d.modelo === 'MURO') { a.tipo = 0; a.dataIni = d.date; a.dataFim = d.date; }
          d.atividades.push(a); save(); renderRda();
          setTimeout(function () { var x = document.querySelector('[data-a="' + a.uid + '"]'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
          toast('Atividade adicionada ao RDA');
        };
      });
    });
  }

  function photosHtml(a) {
    return '<div class="photos" data-ph="' + a.uid + '">' + (a.fotos || []).map(function (pid) { return '<div class="ph" data-pid="' + pid + '"><img alt=""><button data-delph="' + pid + '">✕</button></div>'; }).join('') +
      '<label class="add"><i>📷</i>Foto<input type="file" accept="image/*" capture="environment" class="hidden" data-cam="' + a.uid + '"></label>' +
      '<label class="add"><i>🖼️</i>Galeria<input type="file" accept="image/*" multiple class="hidden" data-gal="' + a.uid + '"></label></div>';
  }

  function cardAtividades(d) {
    var h = '<div class="card"><div class="card-h"><h2><span class="n">4</span>Atividades do dia</h2></div>';
    if (!d.atividades.length) h += '<p class="empty">Nenhuma atividade lançada ainda.</p>';
    d.atividades.forEach(function (a, i) {
      h += '<div class="ativ" data-a="' + a.uid + '"><div class="ah"><b>Atividade ' + (i + 1) + '</b><button class="btn sm danger" data-dela="' + a.uid + '">Excluir</button></div>' +
        (a.progId ? '<div class="prog">📋 Da programação da semana</div>' : '') +
        '<textarea data-f="desc" placeholder="O que foi feito?">' + esc(a.desc) + '</textarea>' +
        refFields(a) +
        '<label class="f">Qtd montada</label><input data-f="qtd" value="' + esc(a.qtd) + '">' +
        (a.progId ? '<label class="chk"><input type="checkbox" data-f="concluida"' + (a.concluida ? ' checked' : '') + '> Atividade da programação concluída</label>' : '') +
        photosHtml(a) + '</div>';
    });
    h += '<button class="btn ghost block" id="adda">＋ Adicionar atividade</button></div>';
    return h;
  }

  /* ---------- Área / Projeto / TAG ---------- */
  // letras de disciplina dos documentos (ALM-D-XX-AAAA-XXX-<letra>-NNNN) que cada disciplina de encarregado usa
  var DISC_LETRAS = { CIVIL: 'CBAI', INFRAESTRUTURA: 'BCI', TUBULACAO: 'PHI', MECANICA: 'MSI', ELETRICA: 'EK', SOLDA: 'PMSI' };
  function minhasLetras() { var k = norm(S.me && S.me.disciplina || '').replace(/[^A-Z]/g, ''); return DISC_LETRAS[k] || ''; }
  function refsOk() { return S.refs && ((S.refs.areas || []).length || (S.refs.proj || []).length); }
  function areaNome(r) { return r[0] ? r[0] + ' - ' + r[1] : r[1]; }
  function refFields(a) {
    var chips = function (k, vals) {
      return (vals || []).map(function (v) { return '<span class="rchip">' + esc(v) + '<button data-rmref="' + k + '" data-u="' + a.uid + '" data-v="' + esc(v) + '">✕</button></span>'; }).join('');
    };
    return '<label class="f">Área</label><button class="pick" data-pk="area" data-u="' + a.uid + '">' + (a.area ? esc(a.area) : '<span class="muted">Toque para escolher a área</span>') + '</button>' +
      '<label class="f">Projeto (desenho)</label><div class="rbox">' + chips('projetos', a.projetos) + '<button class="pick sm" data-pk="projetos" data-u="' + a.uid + '">＋ Projeto</button></div>' +
      '<label class="f">TAG</label><div class="rbox">' + chips('tags', a.tags) + '<button class="pick sm" data-pk="tags" data-u="' + a.uid + '">＋ TAG</button></div>';
  }
  // tela de busca para escolher área, projeto ou TAG
  function pickRef(kind, a) {
    var R = S.refs || { areas: [], proj: [], tags: [] };
    var letras = minhasLetras();
    var st = { q: '', soDisc: !!letras, soArea: !!a.areaCod };
    var titulo = kind === 'area' ? 'Escolher área' : kind === 'projetos' ? 'Escolher projeto' : 'Escolher TAG';
    var b = sheet('<h3>' + titulo + '</h3><input id="rq" type="search" placeholder="Digite para buscar…" autocomplete="off" style="margin-bottom:8px">' +
      (kind !== 'area' ? '<div class="chips" id="rflt"></div>' : '') + '<div id="rsel"></div><div id="rlist" class="rlist"></div>' +
      '<button class="btn block" id="rok" style="margin-top:10px">Pronto</button>');
    var sel = kind === 'area' ? null : (a[kind] = a[kind] || []);
    function lista() {
      var q = norm(st.q).trim(), termos = q.split(/\s+/).filter(Boolean);
      var bate = function (txt) { var t = norm(txt); return termos.every(function (w) { return t.indexOf(w) >= 0; }); };
      var inicio = function (txt) { var t = ' ' + norm(txt).replace(/[^A-Z0-9]+/g, ' '); return termos.every(function (w) { return t.indexOf(' ' + w.replace(/[^A-Z0-9]+/g, ' ').trim()) >= 0; }); };
      var src, out = [];
      if (kind === 'area') {
        src = R.areas || [];
        src.forEach(function (r) { var nome = areaNome(r); if (bate(nome)) out.push({ v: nome, cod: r[0], t: nome, s: '' }); });
      } else if (kind === 'projetos') {
        src = R.proj || [];
        src.forEach(function (r) {
          var p = r[0].split('-'), letra = p[5], area = p[3];
          if (st.soDisc && letras && letras.indexOf(letra) < 0) return;
          if (st.soArea && a.areaCod && area !== a.areaCod && area !== '0000') return;
          if (!bate(r[0] + ' ' + r[1])) return;
          var tp = p[2], pri = /^(DS|IS|DF|FL|FP|DT|DI|DU)$/.test(tp) ? 0 : /^L/.test(tp) ? 1 : 2;
          out.push({ v: r[0], t: r[0] + (r[2] !== '' ? ' (R' + r[2] + ')' : ''), s: r[1], o: (a.areaCod && area === a.areaCod ? 0 : 10) + pri });
        });
      } else {
        src = R.tags || [];
        src.forEach(function (r) {
          if (st.soDisc && letras && letras.indexOf(r[3]) < 0) return;
          if (st.soArea && a.areaCod && r[4] !== a.areaCod) return;
          if (!bate(r[0] + ' ' + r[1])) return;
          out.push({ v: r[0], t: r[0], s: (r[2] ? r[2] + ' · ' : '') + r[1] });
        });
      }
      out.forEach(function (o, i) { o.k = (termos.length && !inicio(o.t + ' ' + o.s) ? 1e8 : 0) + (o.o || 0) * 1e5 + i; });
      out.sort(function (x, y) { return x.k - y.k; });
      return out;
    }
    function draw() {
      var fl = b.querySelector('#rflt');
      if (fl) fl.innerHTML = (letras ? '<button data-fl="disc" class="' + (st.soDisc ? 'sel' : '') + '">Só ' + esc(S.me.disciplina) + '</button>' : '') +
        (a.areaCod ? '<button data-fl="area" class="' + (st.soArea ? 'sel' : '') + '">Só área ' + esc(a.areaCod) + '</button>' : '');
      if (fl) [].forEach.call(fl.querySelectorAll('[data-fl]'), function (x) { x.onclick = function () { if (x.dataset.fl === 'disc') st.soDisc = !st.soDisc; else st.soArea = !st.soArea; draw(); }; });
      b.querySelector('#rsel').innerHTML = sel && sel.length ? '<div class="rbox" style="margin-bottom:6px">' + sel.map(function (v) { return '<span class="rchip">' + esc(v) + '</span>'; }).join('') + '</div>' : '';
      var all = lista(), max = 80, h = '';
      all.slice(0, max).forEach(function (o, i) {
        var on = sel ? sel.indexOf(o.v) >= 0 : a.area === o.v;
        h += '<button data-i="' + i + '" class="' + (on ? 'on' : '') + '"><b>' + (on ? '✓ ' : '') + esc(o.t) + '</b>' + (o.s ? '<small>' + esc(o.s) + '</small>' : '') + '</button>';
      });
      if (all.length > max) h += '<p class="small muted" style="padding:8px">Mostrando ' + max + ' de ' + all.length + '. Digite mais para filtrar.</p>';
      var livre = st.q.trim();
      if (livre && (kind !== 'projetos') && !all.some(function (o) { return norm(o.v) === norm(livre); })) h += '<button data-livre="1"><b>Usar "' + esc(livre) + '"</b><small>Não está na lista</small></button>';
      if (!all.length && !livre) h += '<p class="empty">' + (refsOk() ? 'Nada encontrado com esses filtros.' : 'A lista ainda não foi baixada. Conecte à internet uma vez para receber.') + '</p>';
      var L = b.querySelector('#rlist'); L.innerHTML = h;
      [].forEach.call(L.querySelectorAll('[data-i]'), function (x) {
        x.onclick = function () {
          var o = all[+x.dataset.i];
          if (kind === 'area') { a.area = o.v; a.areaCod = o.cod || ''; save(); closeSheet(); renderRda(); return; }
          var k = sel.indexOf(o.v); if (k >= 0) sel.splice(k, 1); else sel.push(o.v); save(); draw();
        };
      });
      var lv = L.querySelector('[data-livre]');
      if (lv) lv.onclick = function () {
        if (kind === 'area') { a.area = livre; a.areaCod = ''; save(); closeSheet(); renderRda(); return; }
        if (sel.indexOf(livre) < 0) sel.push(livre.toUpperCase()); save(); draw();
      };
    }
    var qi = b.querySelector('#rq'); qi.oninput = function () { st.q = qi.value; draw(); };
    b.querySelector('#rok').onclick = function () { closeSheet(); renderRda(); };
    draw(); setTimeout(function () { qi.focus(); }, 50);
  }

  function cardMuro(d) {
    var h = '<div class="card"><div class="card-h"><h2><span class="n">4</span>Muro de terra armada</h2></div><p class="small muted" style="margin-top:0">Toque na atividade que foi feita hoje e preencha.</p>';
    MURO_ATIVS.forEach(function (nome, ti) {
      var linhas = d.atividades.filter(function (a) { return a.tipo === ti + 1; });
      h += '<div class="ativ" style="padding:10px"><div class="ah"><b>' + (ti + 1) + '. ' + esc(nome) + '</b><button class="btn sm" data-mt="' + (ti + 1) + '">＋ Lançar</button></div>';
      linhas.forEach(function (a) { h += muroLinha(a, d); });
      h += '</div>';
    });
    var outras = d.atividades.filter(function (a) { return !a.tipo; });
    h += '<div class="ativ" style="padding:10px"><div class="ah"><b>Outras atividades</b><button class="btn sm" data-mt="0">＋ Lançar</button></div>';
    outras.forEach(function (a) { h += muroLinha(a, d); });
    h += '</div></div>';
    return h;
  }
  function muroLinha(a) {
    return '<div data-a="' + a.uid + '" style="border-top:1px solid var(--line);padding-top:8px;margin-top:8px">' +
      (a.progId ? '<div class="prog">📋 Da programação da semana</div>' : '') +
      (!a.tipo ? '<textarea data-f="desc" placeholder="Descrição da atividade">' + esc(a.desc) + '</textarea>' : '') +
      '<div class="grid2"><div><label class="f">Nº da fiada' + (a.tipo ? ' <b style="color:var(--bad)">*</b>' : '') + '</label><input data-f="fiada" inputmode="numeric" value="' + esc(a.fiada) + '"></div><div><label class="f">Qtd montada</label><input data-f="qtd" value="' + esc(a.qtd) + '"></div>' +
      '<div><label class="f">Data início</label><input type="date" data-f="dataIni" value="' + esc(a.dataIni) + '"></div><div><label class="f">Hora início</label><input type="time" data-f="horaIni" value="' + esc(a.horaIni) + '"></div>' +
      '<div><label class="f">Data término</label><input type="date" data-f="dataFim" value="' + esc(a.dataFim) + '"></div><div><label class="f">Hora término</label><input type="time" data-f="horaFim" value="' + esc(a.horaFim) + '"></div></div>' +
      (a.progId ? '<label class="chk"><input type="checkbox" data-f="concluida"' + (a.concluida ? ' checked' : '') + '> Atividade da programação concluída</label>' : '') +
      photosHtml(a) + '<button class="btn sm danger" style="margin-top:8px" data-dela="' + a.uid + '">Excluir esta linha</button></div>';
  }

  function cardEquip(d) {
    var h = '<div class="card"><div class="card-h"><h2><span class="n">5</span>Equipamentos utilizados</h2></div>';
    if (!d.equipamentos.length) h += '<p class="empty">Nenhum equipamento lançado.</p>';
    d.equipamentos.forEach(function (e, i) {
      h += '<div class="eqrow" data-e="' + i + '"><button class="x" data-dele="' + i + '">✕</button><label class="f" style="margin-top:0">Equipamento</label>' +
        '<div class="ac"><input data-ef="d" value="' + esc(e.d) + '" placeholder="Comece a digitar…" autocomplete="off"><div class="ac-list hidden"></div></div>' +
        '<div class="grid2"><div><label class="f">TAG</label><input data-ef="t" value="' + esc(e.t) + '"></div><div><label class="f">Quant.</label><input data-ef="q" inputmode="numeric" value="' + esc(e.q) + '"></div></div>' +
        '<label class="f">Área</label><input data-ef="a" value="' + esc(e.a) + '"></div>';
    });
    h += '<button class="btn ghost block" id="adde">＋ Adicionar equipamento</button></div>';
    return h;
  }

  function cardParal(d) {
    var h = '<div class="card"><div class="card-h"><h2><span class="n">6</span>' + (d.modelo === 'MURO' ? 'Atividade paralisada' : 'Paralisações e impactos do dia') + '</h2></div>' +
      '<p class="small muted" style="margin-top:0">Use quando alguma atividade programada não foi feita ou foi interrompida (chuva, falta de material, liberação…).</p>';
    d.paralisacoes.forEach(function (x, i) {
      h += '<div class="eqrow" data-pi="' + i + '"><button class="x" data-delp="' + i + '">✕</button><label class="f" style="margin-top:0">Motivo / impacto</label><textarea data-pf="motivo">' + esc(x.motivo) + '</textarea>' +
        (d.modelo !== 'MURO' ? '<label class="f">Atividade afetada</label><input data-pf="ativ" value="' + esc(x.ativ) + '" placeholder="Ex.: montagem de suportes">' : '') +
        '<div class="grid2"><div><label class="f">Hora início</label><input type="time" data-pf="horaIni" value="' + esc(x.horaIni) + '"></div><div><label class="f">Hora término</label><input type="time" data-pf="horaFim" value="' + esc(x.horaFim) + '"></div></div></div>';
    });
    h += '<button class="btn ghost block" id="addpar">＋ Registrar paralisação / impacto</button></div>';
    return h;
  }

  function cardAssin(d) {
    var outro = !!d.preenchidoPor || d.outroOn;
    var opts = d.team.filter(function (t) { return !isMe(t.nome); }).map(function (t) { return t.nome; });
    if (d.preenchidoPor && opts.indexOf(d.preenchidoPor) < 0) opts.unshift(d.preenchidoPor);
    return '<div class="card"><div class="card-h"><h2><span class="n">7</span>' + (outro ? 'Assinatura de quem preencheu' : 'Assinatura do encarregado') + '</h2></div>' +
      '<label class="chk" style="margin:0 0 10px"><input type="checkbox" id="outroOn"' + (outro ? ' checked' : '') + '> Outra pessoa está preenchendo (encarregado de folga)</label>' +
      (outro ? '<label class="f" style="margin-top:0">Quem está preenchendo</label><input id="preench" list="preenchl" value="' + esc(d.preenchidoPor || '') + '" placeholder="Nome de quem preenche"><datalist id="preenchl">' + opts.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><div style="height:10px"></div>' : '') +
      '<div class="sigbox" id="sigbox">' + (d.assinatura ? '<img id="sigimg" alt="assinatura">' : '<span class="muted">✍️ Toque aqui para assinar</span>') + '</div></div>';
  }

  /* ---------- eventos ---------- */
  function bindRda() {
    var d = S.draft;
    document.getElementById('dprev').onclick = function () { save(true).then(function () { openDraft(addDays(d.date, -1)); }); };
    document.getElementById('dnext').onclick = function () { if (d.date < today()) save(true).then(function () { openDraft(addDays(d.date, 1)); }); };
    document.getElementById('trocar').onclick = function () { save(true); S.me = null; S.draft = null; DB.del('kv', 'me'); render(); updateBell(); };
    document.getElementById('hist').onclick = showHist;
    document.getElementById('gohe').onclick = function () { save(true); S.view = 'he'; render(); window.scrollTo(0, 0); };
    heResumo(); drawPendentes();
    [].forEach.call(document.querySelectorAll('[data-cover]'), function (bt) {
      bt.onclick = function () {
        var alvo = S.boot.encarregados.filter(function (e) { return e.nome === bt.dataset.cover; })[0]; if (!alvo) return;
        save(true).then(function () { S.cover = { nome: S.me.nome, me: S.me }; S.me = alvo; S.draft = null; openDraft(d.date); window.scrollTo(0, 0); });
      };
    });
    var cv = document.getElementById('covervolta'); if (cv) cv.onclick = function () { save(true).then(function () { S.me = S.cover.me; S.cover = null; S.draft = null; openDraft(d.date); }); };
    document.getElementById('ajuda').onclick = function () { tour(true); };
    document.getElementById('bsave').onclick = function () { save(true).then(function () { toast('Salvo no celular ✓'); }); };
    document.getElementById('bsend').onclick = trySend;

    // clima
    [].forEach.call(document.querySelectorAll('.clima button'), function (b) {
      b.onclick = function () {
        var p = b.dataset.p; d.clima[p] = d.clima[p] === b.dataset.v ? '' : b.dataset.v; save();
        [].forEach.call(document.querySelectorAll('.clima button[data-p="' + p + '"]'), function (x) { x.classList.toggle('sel', d.clima[p] === x.dataset.v); });
        var ch = d.clima.dia === 'CHUVOSO' || d.clima.tarde === 'CHUVOSO' || d.clima.noite === 'CHUVOSO';
        document.getElementById('chuvabox').classList.toggle('hidden', !ch && !d.chuvaIni);
      };
    });
    document.getElementById('cini').onchange = function () { d.chuvaIni = this.value; save(); };
    document.getElementById('cfim').onchange = function () { d.chuvaFim = this.value; save(); };

    // equipe
    [].forEach.call(document.querySelectorAll('[data-s]'), function (b) { b.onclick = function () { pickStatus(+b.dataset.s); }; });
    [].forEach.call(document.querySelectorAll('[data-h]'), function (b) { b.onclick = function () { editHours(+b.dataset.h); }; });
    [].forEach.call(document.querySelectorAll('[data-r]'), function (b) { b.onclick = function () { removePerson(+b.dataset.r); }; });
    document.getElementById('addp').onclick = addPerson;
    document.getElementById('allp').onclick = function () {
      var h = horario(d.date);
      d.team.forEach(function (t) { t.status = 'PRESENTE'; if (!t.custom) { t.inicio = h.ini; t.termino = h.fim; } });
      save(); renderRda(); toast('Todos marcados como presentes');
    };

    fillProg(d);

    // atividades
    var adda = document.getElementById('adda');
    if (adda) adda.onclick = function () { var a = { uid: uid(), desc: '', area: '', qtd: '', fotos: [] }; d.atividades.push(a); save(); renderRda(); focusA(a.uid); };
    [].forEach.call(document.querySelectorAll('[data-mt]'), function (b) {
      b.onclick = function () {
        var t = +b.dataset.mt; var h = horario(d.date);
        var a = { uid: uid(), tipo: t, desc: t ? MURO_ATIVS[t - 1] : '', fiada: '', qtd: '', dataIni: d.date, horaIni: h.ini, dataFim: d.date, horaFim: h.fim, fotos: [] };
        d.atividades.push(a); save(); renderRda(); focusA(a.uid);
      };
    });
    [].forEach.call(document.querySelectorAll('[data-a]'), function (box) {
      var a = d.atividades.filter(function (x) { return x.uid === box.dataset.a; })[0]; if (!a) return;
      [].forEach.call(box.querySelectorAll('[data-f]'), function (inp) {
        var ev = inp.type === 'checkbox' ? 'change' : 'input';
        inp.addEventListener(ev, function () { a[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; save(); });
      });
    });
    [].forEach.call(document.querySelectorAll('[data-pk]'), function (b) {
      b.onclick = function () { var a = d.atividades.filter(function (x) { return x.uid === b.dataset.u; })[0]; if (a) pickRef(b.dataset.pk, a); };
    });
    [].forEach.call(document.querySelectorAll('[data-rmref]'), function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var a = d.atividades.filter(function (x) { return x.uid === b.dataset.u; })[0]; if (!a) return;
        var k = b.dataset.rmref; a[k] = (a[k] || []).filter(function (v) { return v !== b.dataset.v; }); save(); renderRda();
      };
    });
    [].forEach.call(document.querySelectorAll('[data-dela]'), function (b) {
      b.onclick = function () {
        if (!confirm('Excluir esta atividade e as fotos dela?')) return;
        d.atividades = d.atividades.filter(function (a) { return a.uid !== b.dataset.dela; }); save(); renderRda();
      };
    });
    [].forEach.call(document.querySelectorAll('.ph[data-pid]'), function (el) {
      DB.get('photos', el.dataset.pid).then(function (p) { if (p) el.querySelector('img').src = p.thumb || p.data; });
      el.querySelector('img').onclick = function () { DB.get('photos', el.dataset.pid).then(function (p) { if (p) sheet('<img src="' + p.data + '" style="width:100%;border-radius:10px"><button class="btn block" style="margin-top:10px" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Fechar</button>'); }); };
    });
    [].forEach.call(document.querySelectorAll('[data-delph]'), function (b) {
      b.onclick = function () {
        if (!confirm('Excluir esta foto?')) return;
        d.atividades.forEach(function (a) { a.fotos = (a.fotos || []).filter(function (x) { return x !== b.dataset.delph; }); });
        save(); renderRda();
      };
    });
    [].forEach.call(document.querySelectorAll('[data-cam],[data-gal]'), function (inp) {
      inp.onchange = function () { addPhotos(inp.dataset.cam || inp.dataset.gal, inp.files, !!inp.dataset.cam); inp.value = ''; };
    });

    // equipamentos
    document.getElementById('adde').onclick = function () { d.equipamentos.push({ d: '', t: '', q: '1', a: '' }); save(); renderRda(); var r = document.querySelectorAll('[data-e]'); var last = r[r.length - 1]; if (last) { last.scrollIntoView({ block: 'center' }); last.querySelector('input').focus(); } };
    [].forEach.call(document.querySelectorAll('[data-e]'), function (box) {
      var e = d.equipamentos[+box.dataset.e];
      [].forEach.call(box.querySelectorAll('[data-ef]'), function (inp) { inp.addEventListener('input', function () { e[inp.dataset.ef] = inp.value; save(); }); });
      autocomplete(box.querySelector('[data-ef="d"]'), box.querySelector('.ac-list'), function (it) { e.d = it.d; e.t = it.t; box.querySelector('[data-ef="d"]').value = it.d; box.querySelector('[data-ef="t"]').value = it.t; save(); });
    });
    [].forEach.call(document.querySelectorAll('[data-dele]'), function (b) { b.onclick = function () { d.equipamentos.splice(+b.dataset.dele, 1); save(); renderRda(); }; });

    // paralisações
    document.getElementById('addpar').onclick = function () { d.paralisacoes.push({ motivo: '', ativ: '', dataIni: d.date, horaIni: '', dataFim: d.date, horaFim: '' }); save(); renderRda(); var r = document.querySelectorAll('[data-pi]'); var l = r[r.length - 1]; if (l) { l.scrollIntoView({ block: 'center' }); l.querySelector('textarea').focus(); } };
    [].forEach.call(document.querySelectorAll('[data-pi]'), function (box) {
      var x = d.paralisacoes[+box.dataset.pi];
      [].forEach.call(box.querySelectorAll('[data-pf]'), function (inp) { inp.addEventListener('input', function () { x[inp.dataset.pf] = inp.value; save(); }); inp.addEventListener('change', function () { x[inp.dataset.pf] = inp.value; save(); }); });
    });
    [].forEach.call(document.querySelectorAll('[data-delp]'), function (b) { b.onclick = function () { d.paralisacoes.splice(+b.dataset.delp, 1); save(); renderRda(); }; });

    // assinatura
    document.getElementById('sigbox').onclick = signature;
    document.getElementById('outroOn').onchange = function () { d.outroOn = this.checked; if (!this.checked) d.preenchidoPor = ''; save(); renderRda(); };
    var pe = document.getElementById('preench'); if (pe) pe.oninput = function () { d.preenchidoPor = this.value.trim(); save(); };
    if (d.assinatura) DB.get('photos', d.assinatura).then(function (p) { var i = document.getElementById('sigimg'); if (p && i) i.src = p.data; });
  }
  function focusA(id) { setTimeout(function () { var x = document.querySelector('[data-a="' + id + '"]'); if (x) { x.scrollIntoView({ behavior: 'smooth', block: 'center' }); var t = x.querySelector('textarea,input'); if (t) t.focus(); } }, 60); }

  function pickStatus(i) {
    var d = S.draft, t = d.team[i];
    var b = sheet('<h3>' + esc(t.nome) + '</h3><div class="stgrid">' + statusList().map(function (s) { return '<button data-v="' + esc(s.s) + '" style="background:' + s.c + '" class="' + (s.s === t.status ? 'cur' : '') + '">' + esc(s.s) + '</button>'; }).join('') + '</div>');
    [].forEach.call(b.querySelectorAll('button[data-v]'), function (x) {
      x.onclick = function () {
        t.status = x.dataset.v; var w = stInfo(t.status).w, h = horario(d.date);
        if (w) { if (!t.inicio) { t.inicio = h.ini; t.termino = h.fim; t.custom = false; } } else { t.inicio = ''; t.termino = ''; t.custom = false; }
        save(); closeSheet(); renderRda();
      };
    });
  }
  function editHours(i) {
    var d = S.draft, t = d.team[i], h = horario(d.date);
    var b = sheet('<h3>Horário · ' + esc(t.nome) + '</h3><p class="small muted">Padrão do dia: ' + h.ini + ' às ' + h.fim + '</p><div class="row"><div><label class="f">Início</label><input type="time" id="hi" value="' + esc(t.inicio) + '"></div><div><label class="f">Término</label><input type="time" id="hf" value="' + esc(t.termino) + '"></div></div>' +
      '<label class="chk"><input type="checkbox" id="hall"> Aplicar para todos os presentes</label>' +
      '<div class="row" style="margin-top:14px"><button class="btn ghost" id="hpad">Voltar ao padrão</button><button class="btn" id="hok">Confirmar</button></div>');
    b.querySelector('#hpad').onclick = function () { b.querySelector('#hi').value = h.ini; b.querySelector('#hf').value = h.fim; };
    b.querySelector('#hok').onclick = function () {
      var ini = b.querySelector('#hi').value, fim = b.querySelector('#hf').value, all = b.querySelector('#hall').checked;
      (all ? d.team.filter(function (x) { return stInfo(x.status).w; }) : [t]).forEach(function (x) { x.inicio = ini; x.termino = fim; x.custom = !(ini === h.ini && fim === h.fim); });
      save(); closeSheet(); renderRda();
    };
  }
  function teamOp(changes) { return enqueue({ type: 'team', enc: S.me.nome, changes: changes }).then(function () { if (navigator.onLine) sync(); }); }
  function removePerson(i) {
    var d = S.draft, t = d.team[i];
    if (!confirm('Remover ' + t.nome + ' da sua equipe?\nEla(e) fica como "SEM EQUIPE" até alguém adicionar.')) return;
    d.team.splice(i, 1); save();
    applyTeamChanges(S.me.nome, [{ op: 'remove', chapa: t.chapa }]); DB.put('kv', 'boot', S.boot);
    teamOp([{ op: 'remove', chapa: t.chapa }]); renderRda();
  }
  function addPerson() {
    var d = S.draft;
    var b = sheet('<h3>Adicionar pessoa à equipe</h3><div class="search"><input id="pq" placeholder="Nome ou chapa"></div><div class="namelist" id="pl"></div>');
    var inp = b.querySelector('#pq');
    function draw() {
      var f = norm(inp.value);
      var list = S.boot.efetivo.filter(function (p) { return p.enc !== S.me.nome && (!f || norm(p.nome).indexOf(f) >= 0 || p.chapa.indexOf(f) >= 0); });
      list.sort(function (a, b) { return (a.enc === 'SEM EQUIPE' ? 0 : 1) - (b.enc === 'SEM EQUIPE' ? 0 : 1) || a.nome.localeCompare(b.nome); });
      b.querySelector('#pl').innerHTML = list.slice(0, 40).map(function (p) {
        return '<button data-c="' + esc(p.chapa) + '"><span><b>' + esc(p.nome) + '</b><small>' + esc(p.chapa) + ' · ' + esc(p.funcao) + '<br>Equipe atual: ' + esc(p.enc) + '</small></span><span class="tag">＋</span></button>';
      }).join('') || '<p class="empty">Ninguém encontrado</p>';
      [].forEach.call(b.querySelectorAll('#pl button'), function (x) {
        x.onclick = function () {
          var p = S.boot.efetivo.filter(function (e) { return e.chapa === x.dataset.c; })[0];
          if (p.enc !== 'SEM EQUIPE' && !confirm(p.nome + ' está na equipe de ' + p.enc + '.\nTransferir para a sua equipe?')) return;
          var h = horario(d.date);
          d.team.push({ chapa: p.chapa, nome: p.nome, funcao: p.funcao, status: 'PRESENTE', inicio: h.ini, termino: h.fim, custom: false });
          save(); applyTeamChanges(S.me.nome, [{ op: 'add', chapa: p.chapa }]); DB.put('kv', 'boot', S.boot);
          teamOp([{ op: 'add', chapa: p.chapa }]); closeSheet(); renderRda(); toast(p.nome.split(' ')[0] + ' entrou na sua equipe');
        };
      });
    }
    inp.oninput = draw; draw(); setTimeout(function () { inp.focus(); }, 100);
  }

  function autocomplete(inp, listEl, onPick) {
    function draw() {
      var f = norm(inp.value).trim();
      var eq = (S.boot.equipamentos || []);
      if (!f || !eq.length) { listEl.classList.add('hidden'); return; }
      var words = f.split(/\s+/);
      var m = eq.filter(function (e) { var s = norm(e.d + ' ' + e.t + ' ' + (e.p || '')); return words.every(function (w) { return s.indexOf(w) >= 0; }); }).slice(0, 12);
      if (!m.length) { listEl.classList.add('hidden'); return; }
      listEl.innerHTML = m.map(function (e, i) { return '<button type="button" data-i="' + i + '">' + esc(e.d) + '<small>' + esc([e.t, e.p].filter(Boolean).join(' · ')) + '</small></button>'; }).join('');
      listEl.classList.remove('hidden');
      [].forEach.call(listEl.querySelectorAll('button'), function (b) { b.onmousedown = b.ontouchstart = function (ev) { ev.preventDefault(); onPick(m[+b.dataset.i]); listEl.classList.add('hidden'); }; });
    }
    inp.addEventListener('input', draw);
    inp.addEventListener('focus', draw);
    inp.addEventListener('blur', function () { setTimeout(function () { listEl.classList.add('hidden'); }, 200); });
  }

  /* ---------- fotos (com carimbo de data/hora) ---------- */
  function addPhotos(aid, files, fromCam) {
    var d = S.draft; var a = d.atividades.filter(function (x) { return x.uid === aid; })[0]; if (!a || !files || !files.length) return;
    toast('Processando foto…', 1500);
    var arr = [].slice.call(files);
    arr.reduce(function (c, f) {
      return c.then(function () {
        var taken = fromCam ? new Date() : new Date(f.lastModified || Date.now());
        return stampPhoto(f, taken, d).then(function (res) {
          var id = 'ph_' + uid();
          a.fotos = a.fotos || []; a.fotos.push(id);
          return DB.put('photos', id, { data: res.data, thumb: res.thumb, takenAt: fmtDT(taken), rda: d.id });
        });
      });
    }, Promise.resolve()).then(function () { save(true); renderRda(); focusA(aid); }).catch(function (e) { alert('Não foi possível ler a foto: ' + e.message); });
  }
  function fmtDT(dt) { return p2(dt.getDate()) + '/' + p2(dt.getMonth() + 1) + '/' + dt.getFullYear() + ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes()); }
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('formato não suportado')); }; im.src = url;
    });
  }
  function stampPhoto(file, taken, d) {
    return loadImg(file).then(function (im) {
      var max = 1600, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d');
      x.drawImage(im, 0, 0, w, h);
      var fs = Math.max(16, Math.round(w / 34)), pad = Math.round(fs * .5);
      var l1 = fmtDT(taken); // só data e hora na foto
      x.font = 'bold ' + fs + 'px Arial'; var tw = x.measureText(l1).width;
      var bh = fs + pad * 2;
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, h - bh, tw + pad * 2, bh);
      x.fillStyle = '#ffd400'; x.fillText(l1, pad, h - pad * 1.15);
      var data = c.toDataURL('image/jpeg', .78);
      var t = document.createElement('canvas'), tk = 200 / Math.max(w, h); t.width = Math.round(w * tk); t.height = Math.round(h * tk);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      return { data: data, thumb: t.toDataURL('image/jpeg', .7) };
    });
  }

  /* ---------- assinatura ---------- */
  function signature() {
    var d = S.draft;
    sigPad(function (dataUrl) {
      var id = 'sig_' + uid();
      return DB.put('photos', id, { data: dataUrl, takenAt: fmtDT(new Date()), rda: d.id }).then(function () { d.assinatura = id; save(true); closeSheet(); renderRda(); });
    });
  }
  var SIG_FONTS = [["'Dancing Script', cursive", 'Clássica'], ["'Great Vibes', 'Snell Roundhand', cursive", 'Elegante'], ["'Caveat', 'Bradley Hand', cursive", 'Manuscrita']];
  function sigPad(onOk) {
    var nomeSug = S.me ? S.me.nome.split(' ').slice(0, 2).join(' ').toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); }) : '';
    var b = sheet('<h3>Assinatura</h3><div class="tabs" id="sigtabs"><button data-m="d" class="sel">✍️ Desenhar</button><button data-m="t">🔤 Digitar</button><button data-m="u">🖼️ Enviar foto</button></div>' +
      '<div id="sm-d"><canvas class="sigpad" id="pad"></canvas><p class="small muted">Assine com o dedo dentro do quadro.</p></div>' +
      '<div id="sm-t" class="hidden"><label class="f" style="margin-top:0">Seu nome</label><input id="signame" value="' + esc(nomeSug) + '"><div id="sigstyles" style="margin-top:10px"></div></div>' +
      '<div id="sm-u" class="hidden"><label class="btn ghost block">📷 Escolher foto da assinatura<input type="file" accept="image/*" id="sigfile" class="hidden"></label><p class="small muted">Assine num papel branco, tire a foto bem de perto e escolha aqui.</p><canvas id="sigprev" style="width:100%;height:140px;border:1.5px solid var(--line);border-radius:12px;background:#fff;margin-top:8px"></canvas></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn ghost" id="sclr">Limpar</button><button class="btn" id="sok">Confirmar</button></div>');
    var mode = 'd', estilo = 0, upData = null;
    var cv = b.querySelector('#pad'), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    var x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0b2a8b';
    var drawing = false, drawn = false, last = null;
    function pt(e) { var rr = cv.getBoundingClientRect(); return { x: e.clientX - rr.left, y: e.clientY - rr.top }; }
    cv.onpointerdown = function (e) { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = function (e) { if (!drawing) return; var p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; drawn = true; };
    cv.onpointerup = cv.onpointercancel = function () { drawing = false; };
    function drawStyles() {
      var nm = b.querySelector('#signame').value.trim() || 'Assinatura';
      b.querySelector('#sigstyles').innerHTML = SIG_FONTS.map(function (f, i) {
        return '<button data-st="' + i + '" style="display:block;width:100%;text-align:left;border:2px solid ' + (i === estilo ? 'var(--navy)' : 'var(--line)') + ';border-radius:12px;background:#fff;padding:8px 14px;margin-bottom:8px;color:#0b2a8b;font-size:34px;font-family:' + f[0].replace(/"/g, '') + '">' + esc(nm) + '<small style="display:block;font:12px system-ui;color:#5d6878">' + f[1] + '</small></button>';
      }).join('');
      [].forEach.call(b.querySelectorAll('[data-st]'), function (bt) { bt.onclick = function () { estilo = +bt.dataset.st; drawStyles(); }; });
    }
    b.querySelector('#signame').oninput = drawStyles;
    if (document.fonts && document.fonts.load) SIG_FONTS.forEach(function (f) { document.fonts.load('40px ' + f[0]).then(function () { if (mode === 't') drawStyles(); }).catch(function () { }); });
    [].forEach.call(b.querySelectorAll('#sigtabs button'), function (bt) {
      bt.onclick = function () {
        mode = bt.dataset.m;
        [].forEach.call(b.querySelectorAll('#sigtabs button'), function (o) { o.classList.toggle('sel', o === bt); });
        ['d', 't', 'u'].forEach(function (m) { b.querySelector('#sm-' + m).classList.toggle('hidden', m !== mode); });
        if (mode === 't') drawStyles();
      };
    });
    b.querySelector('#sigfile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      loadImg(f).then(function (im) {
        var w = 900, h = Math.round(w * im.naturalHeight / im.naturalWidth); if (h > 450) { h = 450; w = Math.round(h * im.naturalWidth / im.naturalHeight); }
        var c = document.createElement('canvas'); c.width = w; c.height = h; var cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h);
        // deixa o fundo claro transparente (fica bonito no PDF)
        var id = cx.getImageData(0, 0, w, h), dd = id.data;
        for (var i = 0; i < dd.length; i += 4) { var l = (dd[i] + dd[i + 1] + dd[i + 2]) / 3; if (l > 175) dd[i + 3] = 0; else { dd[i] = Math.min(dd[i], 40); dd[i + 1] = Math.min(dd[i + 1], 50); dd[i + 2] = Math.max(dd[i + 2], 110); } }
        cx.putImageData(id, 0, 0);
        upData = c.toDataURL('image/png');
        var pv = b.querySelector('#sigprev'), pr = pv.getBoundingClientRect(); pv.width = pr.width * dpr; pv.height = pr.height * dpr;
        var px = pv.getContext('2d'), k = Math.min(pv.width / w, pv.height / h); px.drawImage(c, (pv.width - w * k) / 2, (pv.height - h * k) / 2, w * k, h * k);
      }).catch(function () { toast('Não consegui ler a foto'); });
    };
    b.querySelector('#sclr').onclick = function () {
      if (mode === 'd') { x.clearRect(0, 0, cv.width, cv.height); drawn = false; }
      else if (mode === 'u') { upData = null; var pv = b.querySelector('#sigprev'); pv.getContext('2d').clearRect(0, 0, pv.width, pv.height); }
      else { b.querySelector('#signame').value = ''; drawStyles(); }
    };
    b.querySelector('#sok').onclick = function () {
      if (mode === 'd') { if (!drawn) { toast('Assine no quadro'); return; } return onOk(cv.toDataURL('image/png')); }
      if (mode === 'u') { if (!upData) { toast('Escolha a foto da assinatura'); return; } return onOk(upData); }
      var nm = b.querySelector('#signame').value.trim(); if (!nm) { toast('Digite seu nome'); return; }
      var c = document.createElement('canvas'); c.width = 900; c.height = 260; var cx = c.getContext('2d');
      var fs = 120; cx.font = fs + 'px ' + SIG_FONTS[estilo][0];
      while (cx.measureText(nm).width > 840 && fs > 40) { fs -= 6; cx.font = fs + 'px ' + SIG_FONTS[estilo][0]; }
      cx.fillStyle = '#0b2a8b'; cx.textBaseline = 'middle'; cx.textAlign = 'center'; cx.fillText(nm, 450, 135);
      onOk(c.toDataURL('image/png'));
    };
  }

  /* ---------- envio ---------- */
  function trySend() {
    var d = S.draft, falta = [];
    if (!d.clima.dia && !d.clima.tarde) falta.push('Condições do tempo');
    if (!d.atividades.length && !d.paralisacoes.length) falta.push('Pelo menos uma atividade ou paralisação');
    if (d.atividades.some(function (a) { return !a.desc && !a.tipo; })) falta.push('Descrição em todas as atividades');
    if (d.modelo === 'MURO') d.atividades.forEach(function (a) { if (a.tipo && !String(a.fiada || '').trim()) falta.push('Nº da fiada em: ' + MURO_ATIVS[a.tipo - 1]); });
    if ((d.outroOn || d.preenchidoPor) && !String(d.preenchidoPor || '').trim()) falta.push('Nome de quem está preenchendo');
    if (!d.assinatura) falta.push('Assinatura');
    if (falta.length) { sheet('<h3>Falta preencher</h3><div class="alert">' + falta.map(function (f) { return '• ' + esc(f); }).join('<br>') + '</div><button class="btn block" id="okf">Voltar e completar</button>').querySelector('#okf').onclick = closeSheet; return; }
    d.state = 'fila'; save(true).then(function () {
      return DB.all('queue').then(function (q) {
        var exists = q.some(function (it) { return it.value.type === 'rda' && it.value.draftId === d.id; });
        return exists ? countPending() : enqueue({ type: 'rda', draftId: d.id });
      });
    }).then(function () {
      updateHeadState();
      if (navigator.onLine) { toast('Enviando…'); sync().then(function () { toast(S.draft.state === 'enviado' ? 'RDA enviado ✓' : 'Ficou guardado. Envia sozinho quando tiver internet.', 3500); }); }
      else toast('Sem internet: o RDA ficou guardado e será enviado automaticamente.', 4000);
    });
  }

  function showHist() {
    DB.all('drafts').then(function (all) {
      var mine = all.map(function (x) { return x.value; }).filter(function (d) { return d.enc === S.me.nome; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var srv = (S.boot.enviados || {});
      var b = sheet('<h3>Meus RDAs</h3><div class="hist">' + (mine.map(function (d) {
        var st = d.state === 'enviado' || srv[d.date] ? '✓ enviado' : d.state === 'fila' ? '⏳ na fila' : 'rascunho';
        return '<button data-d="' + d.date + '"><span><b>' + br(d.date) + '</b> <small class="muted">' + esc(d.numero) + '</small></span><span class="small">' + st + '</span></button>';
      }).join('') || '<p class="empty">Nenhum RDA neste celular</p>') + '</div><label class="f">Abrir outra data</label><input type="date" id="od" max="' + today() + '"><button class="btn block" style="margin-top:10px" id="odgo">Abrir</button>');
      [].forEach.call(b.querySelectorAll('[data-d]'), function (x) { x.onclick = function () { closeSheet(); openDraft(x.dataset.d); }; });
      b.querySelector('#odgo').onclick = function () { var v = b.querySelector('#od').value; if (v) { closeSheet(); openDraft(v); } };
    });
  }


  /* ---------------- HORAS EXTRAS ---------------- */
  function cfg() { return (S.boot && S.boot.config) || { SABADO_ESCALA: 'SIM', HE_PRAZO: '13:00', HE_SEXTA_MAX: '17:30', HE_SEMANA_MAX: '18:30', HE_FORA_PRAZO: 'AVISAR' }; }
  function diaUtil(dd) { var w = dow(dd); return !(w === 0 || isHoliday(dd) || (w === 6 && cfg().SABADO_ESCALA === 'SIM')); }
  function heTipo(dd) { return diaUtil(dd) ? 'EXTENSÃO' : 'ESCALA'; }
  function hePrazo(dd, tipo) { // retorna data/hora limite "yyyy-mm-dd HH:MM"
    var lim = cfg().HE_PRAZO || '13:00';
    if (tipo === 'EXTENSÃO') return dd + ' ' + lim;
    var p = addDays(dd, -1), n = 0; while (!diaUtil(p) && n++ < 15) p = addDays(p, -1);
    return p + ' ' + lim;
  }
  function nowStr() { var d = new Date(); return today() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function heKey() { return 'he:' + S.me.nome; }
  function heLocal() { return DB.get('kv', heKey()).then(function (l) { return l || []; }); }
  function heSaveLocal(h) { return heLocal().then(function (l) { var i = l.findIndex(function (x) { return x.id === h.id; }); if (i >= 0) l[i] = h; else l.push(h); return DB.put('kv', heKey(), l); }); }
  function heMerged() {
    return heLocal().then(function (loc) {
      var srv = {}; (S.boot.horasExtras || []).forEach(function (x) { srv[x.id] = x; });
      loc.forEach(function (h) { var s2 = srv[h.id]; if (s2 && h.state === 'enviado') { h.status = s2.status; h.obsAdmin = s2.obs; } });
      (S.boot.horasExtras || []).forEach(function (x) { if (!loc.some(function (h) { return h.id === x.id; })) loc.push({ id: x.id, tipo: x.tipo, date: x.date, ini: x.ini, fim: x.fim, status: x.status, obsAdmin: x.obs, state: 'enviado', pessoas: x.pessoas.map(function (c) { return { chapa: c }; }), remoto: true }); });
      return loc.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    });
  }
  function applyHe(d) { // hora extra aprovada entra no RDA do dia
    var ap = (S.boot.horasExtras || []).filter(function (x) { return x.date === d.date && x.status === 'APROVADO'; });
    d.heAplicado = d.heAplicado || [];
    var mudou = false;
    ap.forEach(function (x) {
      if (d.heAplicado.indexOf(x.id) >= 0) return;
      d.team.forEach(function (t) {
        var dentro = x.pessoas.indexOf(t.chapa) >= 0;
        if (x.tipo === 'ESCALA') {
          if (dentro) { t.status = 'PRESENTE'; t.inicio = x.ini; t.termino = x.fim; t.custom = true; t.he = true; }
          else if (!t.he) { t.status = 'FOLGA'; t.inicio = ''; t.termino = ''; t.custom = false; }
        } else if (dentro && stInfo(t.status).w) { t.termino = x.fim; t.custom = true; t.he = true; }
      });
      d.heAplicado.push(x.id); mudou = true;
    });
    if (mudou) { save(true); setTimeout(function () { toast('Hora extra aprovada aplicada no RDA ✓', 3000); }, 300); }
  }
  function heBadge(h) {
    if (h.state !== 'enviado') return h.state === 'fila' ? '<span class="tag" style="background:#fff4e5;color:#a34600">⏳ aguardando internet</span>' : '<span class="tag">rascunho</span>';
    var st = h.status || 'PENDENTE', c = st === 'APROVADO' ? ['#e8f5ec', '#11602a', '✓ Aprovado'] : st === 'REPROVADO' ? ['#fde7e5', '#d93025', '✗ Reprovado'] : ['#eef1f6', '#0b2a5b', '… Aguardando aprovação'];
    return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '">' + c[2] + '</span>';
  }
  function renderHe() {
    $app.innerHTML = '<div class="rdahead"><div class="num">HORA EXTRA</div><div class="who">' + esc(S.me.nome) + '</div><div class="meta">Extensão: pedir até as ' + esc(cfg().HE_PRAZO) + ' do dia · Escala (dia não útil): até as ' + esc(cfg().HE_PRAZO) + ' do último dia útil antes</div></div>' +
      '<button class="btn big orange" id="henovo" style="margin-bottom:14px">＋ Novo pedido de hora extra</button><div class="card"><div class="card-h"><h2>Meus pedidos</h2></div><div id="helist"><p class="empty">Carregando…</p></div></div>' +
      '<div class="bottombar"><button class="btn ghost" id="hevolta">‹ Voltar ao RDA</button></div>';
    document.getElementById('hevolta').onclick = function () { S.view = null; render(); };
    document.getElementById('henovo').onclick = function () { S.he = null; S.view = 'heform'; render(); };
    heMerged().then(function (l) {
      document.getElementById('helist').innerHTML = l.map(function (h) {
        return '<div class="rdaline" data-he="' + esc(h.id) + '"><div class="tx"><b>' + br(h.date) + ' · ' + esc(h.tipo) + '</b><small>' + esc(h.ini) + ' às ' + esc(h.fim) + ' · ' + (h.pessoas || []).length + ' pessoa(s)' + (h.obsAdmin ? ' · Obs: ' + esc(h.obsAdmin) : '') + '</small><div style="margin-top:4px">' + heBadge(h) + '</div></div>' + (h.remoto ? '' : '<button class="btn sm ghost">Abrir</button>') + '</div>';
      }).join('') || '<p class="empty">Nenhum pedido ainda</p>';
      [].forEach.call(document.querySelectorAll('[data-he] button'), function (b) {
        b.onclick = function () { var id = b.closest('[data-he]').dataset.he; heLocal().then(function (loc) { S.he = loc.filter(function (x) { return x.id === id; })[0]; S.view = 'heform'; render(); }); };
      });
    });
  }
  function heMax(dd) { return dow(dd) === 5 ? (cfg().HE_SEXTA_MAX || '17:30') : (cfg().HE_SEMANA_MAX || '18:30'); }
  function heDefaults(dd, tipo) {
    var h = horario(dd);
    if (tipo === 'ESCALA') return { ini: '06:30', fim: '15:30' };
    var f = h.fim.split(':'), mx = heMax(dd), fim = p2(+f[0] + 2) + ':' + f[1];
    if (mx && fim > mx) fim = mx;
    return { ini: h.fim, fim: fim };
  }
  function renderHeForm() {
    if (!S.he) {
      var dd = today(); if (nowStr() > dd + ' ' + (cfg().HE_PRAZO || '13:00')) dd = addDays(dd, 1);
      var tp = heTipo(dd), df = heDefaults(dd, tp);
      S.he = { id: 'HE-' + uid(), enc: S.me.nome, curto: S.me.curto, disciplina: S.me.disciplina, supervisor: S.me.supervisor, date: dd, tipo: tp, ini: df.ini, fim: df.fim, turno: 'DIURNO', area: '', motivo: '', sel: {}, declaro: false, assinatura: '', state: 'rascunho' };
    }
    var h = S.he, team = myTeam(), prazo = hePrazo(h.date, h.tipo), noPrazo = nowStr() <= prazo || h.state === 'enviado';
    h.sel = h.sel || {}; if (h.pessoas && !Object.keys(h.sel).length) h.pessoas.forEach(function (x) { h.sel[x.chapa] = true; });
    var nsel = Object.keys(h.sel).filter(function (k) { return h.sel[k]; }).length;
    var html = '<div class="rdahead"><div class="num">PEDIDO DE HORA EXTRA</div><div class="who">' + (h.tipo === 'ESCALA' ? 'Escala – dia não útil' : 'Extensão de horário') + '</div><div class="meta">Prazo para pedir: até ' + br(prazo.slice(0, 10)) + ' às ' + prazo.slice(11) + '</div>' +
      (h.state === 'enviado' ? '<div style="margin-top:8px">' + heBadge(h) + '</div>' : '') + '</div>';
    if (!noPrazo) html += '<div class="alert bad"><b>Fora do prazo.</b> ' + (cfg().HE_FORA_PRAZO === 'BLOQUEAR' ? 'Não é possível enviar este pedido.' : 'Você pode enviar, mas o pedido vai marcado como FORA DO PRAZO para aprovação.') + '</div>';
    html += '<div class="card"><label class="f" style="margin-top:0">Data da hora extra</label><input type="date" id="hdate" min="' + today() + '" value="' + h.date + '">' +
      '<div class="grid2"><div><label class="f">Início</label><input type="time" id="hini" value="' + esc(h.ini) + '"></div><div><label class="f">Término</label><input type="time" id="hfim" value="' + esc(h.fim) + '"></div></div>' +
      (h.tipo === 'EXTENSÃO' ? '<p class="small muted">' + (dow(h.date) === 5 ? 'Sexta-feira' : 'Segunda a quinta') + ': extensão até no máximo ' + esc(heMax(h.date)) + '.</p>' : '') +
      '<label class="f">Área</label><input id="harea" value="' + esc(h.area) + '"><label class="f">Atividade que será realizada <b style="color:var(--bad)">*</b></label><textarea id="hmot" placeholder="Descreva a atividade que será feita nas horas extras">' + esc(h.motivo) + '</textarea></div>';
    html += '<div class="card"><div class="card-h"><h2 id="hqt">Quem vai ficar (' + nsel + ')</h2><button class="btn sm ghost" id="hall">Marcar todos</button></div>' +
      team.map(function (p) { var on = !!h.sel[p.chapa]; return '<label class="person" style="cursor:pointer"><input type="checkbox" data-hs="' + esc(p.chapa) + '"' + (on ? ' checked' : '') + ' style="width:30px;height:30px;min-height:0;flex:0 0 30px"><div class="pinfo"><b>' + esc(p.nome) + '</b><small>' + esc(p.chapa) + ' · ' + esc(p.funcao) + '</small></div></label>'; }).join('') + '</div>';
    html += '<div class="card"><div class="card-h"><h2>Confirmação</h2></div><label class="chk" style="align-items:flex-start"><input type="checkbox" id="hdecl"' + (h.declaro ? ' checked' : '') + '> <span>Declaro que combinei a hora extra com cada pessoa marcada e que todas concordaram.</span></label>' +
      '<div class="sigbox" id="hsig" style="margin-top:10px">' + (h.assinatura ? '<img id="hsigimg" alt="">' : '<span class="muted">✍️ Assinatura do encarregado</span>') + '</div></div>';
    html += '<div class="bottombar"><button class="btn ghost" id="hback">‹ Voltar</button><button class="btn orange" id="hsend"' + (!noPrazo && cfg().HE_FORA_PRAZO === 'BLOQUEAR' ? ' disabled' : '') + '>📤 Enviar pedido</button></div>';
    $app.innerHTML = html;
    var keep = function () {
      if (h.state === 'enviado') h.state = 'alterado'; heSaveLocal(h);
      clearTimeout(S.hePing); S.hePing = setTimeout(function () { if (navigator.onLine && h.state !== 'enviado') api('heDraftPing', { id: h.id, enc: h.enc, date: h.date }).catch(function () { }); }, 3000);
    };
    document.getElementById('hdate').onchange = function () { h.date = this.value || today(); h.tipo = heTipo(h.date); var df = heDefaults(h.date, h.tipo); h.ini = df.ini; h.fim = df.fim; keep(); renderHeForm(); };
    document.getElementById('hini').onchange = function () { h.ini = this.value; keep(); };
    document.getElementById('hfim').onchange = function () {
      var mx = heMax(h.date);
      if (h.tipo === 'EXTENSÃO' && this.value > mx) { this.value = mx; toast('Extensão vai até no máximo ' + mx); }
      h.fim = this.value; keep();
    };
    document.getElementById('harea').oninput = function () { h.area = this.value; keep(); };
    document.getElementById('hmot').oninput = function () { h.motivo = this.value; keep(); };
    [].forEach.call(document.querySelectorAll('[data-hs]'), function (c) { c.onchange = function () { h.sel[c.dataset.hs] = c.checked; keep(); var n = Object.keys(h.sel).filter(function (k) { return h.sel[k]; }).length; var t = document.getElementById('hqt'); if (t) t.textContent = 'Quem vai ficar (' + n + ')'; }; });
    document.getElementById('hall').onclick = function () { team.forEach(function (p) { h.sel[p.chapa] = true; }); keep(); renderHeForm(); };
    document.getElementById('hdecl').onchange = function () { h.declaro = this.checked; keep(); };
    document.getElementById('hsig').onclick = function () { sigPad(function (u) { var id = 'sig_' + uid(); return DB.put('photos', id, { data: u, takenAt: fmtDT(new Date()), rda: h.id }).then(function () { h.assinatura = id; keep(); closeSheet(); renderHeForm(); }); }); };
    if (h.assinatura) DB.get('photos', h.assinatura).then(function (p) { var i = document.getElementById('hsigimg'); if (p && i) i.src = p.data; });
    document.getElementById('hback').onclick = function () { S.view = 'he'; render(); };
    document.getElementById('hsend').onclick = function () {
      var falta = [], ps = team.filter(function (p) { return h.sel[p.chapa]; });
      if (!ps.length) falta.push('Marque quem vai ficar');
      if (!h.ini || !h.fim || h.fim <= h.ini) falta.push('Horário de início e término');
      if (!String(h.motivo).trim()) falta.push('Atividade que será realizada');
      if (!h.declaro) falta.push('Marque a declaração');
      if (!h.assinatura) falta.push('Assinatura');
      if (falta.length) { sheet('<h3>Falta preencher</h3><div class="alert">' + falta.map(esc).join('<br>') + '</div><button class="btn block" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Voltar</button>'); return; }
      var np = nowStr() <= prazo;
      if (!np && cfg().HE_FORA_PRAZO === 'BLOQUEAR') return toast('Fora do prazo');
      if (!np && !confirm('Este pedido está FORA DO PRAZO. Enviar mesmo assim?')) return;
      h.pessoas = ps.map(function (p) { return { chapa: p.chapa, nome: p.nome, funcao: p.funcao, mo: p.mo || '' }; });
      h.equipe = team.map(function (p) { return { chapa: p.chapa, nome: p.nome, funcao: p.funcao }; });
      h.pedidoEm = h.pedidoEm && h.state !== 'rascunho' ? h.pedidoEm : nowStr(); h.prazo = prazo; h.noPrazo = h.pedidoEm <= prazo;
      h.confirmacao = 'Declaração do encarregado'; h.state = 'fila';
      heSaveLocal(h).then(function () { return enqueue({ type: 'he', heId: h.id }); }).then(function () {
        S.view = 'he'; render();
        if (navigator.onLine) sync().then(function () { renderHe(); toast('Pedido enviado ✓ Aguarde a aprovação.'); }); else toast('Sem internet: o pedido fica guardado e vai sozinho.', 3500);
      });
    };
  }
  function sendHe(id) {
    return heLocal().then(function (l) {
      var h = l.filter(function (x) { return x.id === id; })[0]; if (!h) return;
      var up = h.assinatura ? DB.get('photos', h.assinatura).then(function (ph) {
        if (!ph || ph.fileId) return ph;
        return api('uploadPhoto', { id: h.assinatura, kind: 'assinatura', rdaId: h.id, date: h.date, enc: h.enc, disc: h.disciplina, fileName: h.date + ' - ' + norm(h.disciplina) + ' - ' + norm(h.curto) + ' - HORA EXTRA - ASSINATURA.png', takenAt: ph.takenAt, data: ph.data })
          .then(function (r) { ph.fileId = r.fileId; return DB.put('photos', h.assinatura, ph).then(function () { return ph; }); });
      }) : Promise.resolve(null);
      return up.then(function (ph) {
        var pl = JSON.parse(JSON.stringify(h)); pl.assinaturaFileId = ph ? ph.fileId : ''; delete pl.sel; delete pl.state;
        return api('heSubmit', { he: pl });
      }).then(function () { h.state = 'enviado'; h.status = 'PENDENTE'; return heSaveLocal(h); });
    });
  }


  /* ---------------- avisos, notificações, ajuda, instalação ---------------- */
  function folgaHoje(enc, d) { return ((S.boot && S.boot.folgas) || []).filter(function (f) { return f.enc === enc && d >= f.ini && d <= f.fim; })[0] || null; }
  function cobrindo(d) { if (S.cover) return []; return ((S.boot && S.boot.folgas) || []).filter(function (f) { return f.tipo === 'ENCARREGADO' && f.subst === S.me.nome && d >= f.ini && d <= f.fim; }); }
  function heResumo() {
    var el = document.getElementById('hestatus'); if (!el) return;
    heMerged().then(function (l) {
      var prox = l.filter(function (h) { return h.date >= today(); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      if (!prox) return;
      var st = prox.state !== 'enviado' ? (prox.state === 'fila' ? '⏳ aguardando internet' : '✎ rascunho não enviado') : (prox.status === 'APROVADO' ? '✓ aprovado' : prox.status === 'REPROVADO' ? '✗ reprovado' : '… aguardando aprovação');
      el.textContent = (prox.tipo === 'ESCALA' ? 'Escala ' : 'Extensão ') + br(prox.date).slice(0, 5) + ': ' + st;
    });
  }
  function drawPendentes() {
    var el = document.getElementById('pendbox'); if (!el) return;
    var p = (S.boot && S.boot.pendentes) || [];
    if (!p.length || S.cover) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="alert bad"><b>⚠ RDA pendente</b><br>Prazo vencido: ' + p.map(function (x) { return '<button class="link" data-pd="' + x.date + '">' + br(x.date).slice(0, 5) + '</button>'; }).join(', ') + '<br><small>Toque na data para abrir e enviar.</small></div>';
    [].forEach.call(el.querySelectorAll('[data-pd]'), function (b) { b.onclick = function () { save(true).then(function () { openDraft(b.dataset.pd); }); }; });
  }
  function refreshInbox() {
    if (!navigator.onLine || !S.me || !CFG.API_URL) return Promise.resolve();
    return api('inbox', { enc: S.me.nome }, 20000).then(function (r) {
      S.inbox = r.mensagens || []; if (S.boot) S.boot.pendentes = r.pendentes || [];
      return DB.put('kv', 'inbox:' + S.me.nome, S.inbox).then(updateBell).then(drawPendentes);
    }).catch(function () { });
  }
  function updateBell() {
    var bell = document.getElementById('bell'); if (!bell) return;
    if (!S.me || location.hash === '#admin') { bell.classList.add('hidden'); return; }
    bell.classList.remove('hidden');
    return DB.get('kv', 'lidoAte:' + S.me.nome).then(function (t) {
      var n = (S.inbox || []).filter(function (m) { return !t || m.em > t; }).length;
      var c = document.getElementById('bellcount'); c.textContent = n; c.classList.toggle('hidden', !n);
    });
  }
  function showInbox() {
    var msgs = S.inbox || [];
    var push = ('Notification' in window) ? Notification.permission : 'unsupported';
    var b = sheet('<h3>🔔 Avisos</h3>' + (push !== 'granted' ? '<div class="alert">As notificações estão desligadas neste celular. <button class="btn sm orange" id="ativnotif" style="margin-top:8px">Ativar notificações</button></div>' : '') +
      (msgs.map(function (m) {
        var cor = m.tipo === 'ATRASO' ? '#d93025' : m.tipo === 'AVISO' ? '#0b2a5b' : m.tipo === 'HORA EXTRA' ? '#1e8e3e' : '#e8710a';
        return '<div style="border-left:4px solid ' + cor + ';background:#f6f8fb;border-radius:10px;padding:10px 12px;margin-bottom:8px"><b>' + esc(m.titulo) + '</b><div class="small" style="white-space:pre-line;margin:4px 0">' + esc(m.texto) + '</div><small class="muted">' + esc(m.por) + ' · ' + esc(br(m.em.slice(0, 10)).slice(0, 5)) + ' ' + esc(m.em.slice(11, 16)) + '</small></div>';
      }).join('') || '<p class="empty">Nenhum aviso por enquanto.</p>') + '<button class="btn block ghost" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Fechar</button>');
    var an = b.querySelector('#ativnotif'); if (an) an.onclick = function () { ativarNotificacoes().then(function (ok) { if (ok) closeSheet(); }); };
    if (msgs.length) DB.put('kv', 'lidoAte:' + S.me.nome, msgs[0].em).then(updateBell);
  }
  document.getElementById('bell').onclick = showInbox;

  function b64ToU8(b64) { var p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')), o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  // dest: nome do encarregado, ou 'ADMIN' (com senha)
  function ativarNotificacoes(admin) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (isIOS() && !isStandalone()) { instalarApp(); toast('No iPhone, instale o app na tela inicial primeiro', 4000); }
      else toast('Este navegador não aceita notificações', 3500);
      return Promise.resolve(false);
    }
    var vapid = (S.boot && S.boot.vapid) || S.vapidAdmin;
    if (!vapid) { toast('Conecte na internet e tente de novo'); return Promise.resolve(false); }
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { toast('Notificações bloqueadas. Libere nas configurações do navegador.', 4500); return false; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (old) {
          return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) });
        });
      }).then(function (sub) {
        var j = sub.toJSON();
        if (admin) return admin(j);
        return DB.put('kv', 'pushEnc', S.me.nome).then(function () { return api('pushSubscribe', { enc: S.me.nome, sub: j }); });
      }).then(function () { toast('Notificações ativadas ✓', 3000); return true; });
    }).catch(function (e) { toast('Não foi possível ativar: ' + e.message, 4000); return false; });
  }
  window.RDA_PUSH = { ativar: ativarNotificacoes, setVapid: function (v) { S.vapidAdmin = v; } };

  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
  function instalarApp() {
    if (isStandalone()) { toast('O app já está instalado ✓'); return; }
    if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; }); return; }
    if (isIOS()) {
      sheet('<h3>📲 Instalar no iPhone</h3><ol style="line-height:1.7;padding-left:20px"><li>Abra este link no <b>Safari</b>.</li><li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima ⬆️).</li><li>Role e toque em <b>"Adicionar à Tela de Início"</b>.</li><li>Toque em <b>Adicionar</b>. O ícone do RDA aparece na tela.</li><li>Abra pelo ícone e ative as notificações.</li></ol><button class="btn block" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Entendi</button>');
    } else {
      sheet('<h3>📲 Instalar no celular</h3><ol style="line-height:1.7;padding-left:20px"><li>Abra este link no <b>Chrome</b>.</li><li>Toque nos <b>três pontinhos ⋮</b> no canto de cima.</li><li>Toque em <b>"Instalar app"</b> ou <b>"Adicionar à tela inicial"</b>.</li><li>Confirme. O ícone do RDA aparece na tela.</li></ol><button class="btn block" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Entendi</button>');
    }
  }
  window.RDA_INSTALL = instalarApp;

  var TOUR = [
    ['👋', 'Bem-vindo ao RDA digital', 'Aqui você faz o RDA do dia pelo celular, mesmo <b>sem internet</b> no campo. Quando o celular pegar sinal, tudo é enviado sozinho.'],
    ['👷', 'Sua equipe já vem pronta', 'Ao escolher seu nome, sua equipe aparece com o status do dia anterior. Toque no <b>status</b> só de quem mudou (falta, atestado…). O horário entra sozinho; toque nele se houve extensão.'],
    ['📋', 'Atividades e fotos', 'Toque em <b>"Fiz hoje"</b> na programação da semana ou em <b>"+ Adicionar atividade"</b>. Escolha a área, o projeto e o TAG, e tire as fotos como evidência.'],
    ['✍️', 'Assine e envie', 'Preencha o tempo, equipamentos e paralisações, assine (desenhando, digitando ou com foto) e toque em <b>📤 Enviar RDA</b>. Prazo: até <b>12:00 do próximo dia de trabalho</b>.'],
    ['⏱', 'Hora extra', 'O botão laranja <b>HORA EXTRA</b> fica no topo. Extensão: peça até as 13:00 do dia. Sábado, domingo e feriado: envie a escala até as 13:00 do último dia útil antes.'],
    ['🔔', 'Ative as notificações', 'Assim você recebe lembretes de RDA atrasado, respostas da hora extra e avisos da obra. <br><button class="btn orange block" id="tnotif" style="margin-top:10px">Ativar notificações</button>'],
    ['📲', 'Instale no celular', 'Deixe o RDA com ícone na tela, como um aplicativo. No iPhone isso é necessário para as notificações.<br><button class="btn block" id="tinst" style="margin-top:10px">Instalar no celular</button>']
  ];
  function tour(force) {
    return DB.get('kv', 'tour1').then(function (v) {
      if (v && !force) return;
      var i = 0;
      function step() {
        var t = TOUR[i];
        var b = sheet('<div style="text-align:center;font-size:54px;line-height:1.1;margin:6px 0">' + t[0] + '</div><h3 style="text-align:center">' + t[1] + '</h3><div style="font-size:17px;line-height:1.5">' + t[2] + '</div>' +
          '<div style="display:flex;justify-content:center;gap:6px;margin:14px 0">' + TOUR.map(function (_, k) { return '<span style="width:9px;height:9px;border-radius:50%;background:' + (k === i ? 'var(--navy)' : '#c9d1dd') + '"></span>'; }).join('') + '</div>' +
          '<div class="row"><button class="btn ghost" id="tskip">' + (i ? '‹ Voltar' : 'Pular') + '</button><button class="btn" id="tnext">' + (i === TOUR.length - 1 ? 'Começar ✓' : 'Próximo ›') + '</button></div>');
        b.querySelector('#tnext').onclick = function () { if (i === TOUR.length - 1) { closeSheet(); DB.put('kv', 'tour1', 1); } else { i++; step(); } };
        b.querySelector('#tskip').onclick = function () { if (i) { i--; step(); } else { closeSheet(); DB.put('kv', 'tour1', 1); } };
        var tn = b.querySelector('#tnotif'); if (tn) tn.onclick = function () { if (!S.me) { toast('Escolha seu nome primeiro; depois ative em 🔔'); return; } ativarNotificacoes(); };
        var ti = b.querySelector('#tinst'); if (ti) ti.onclick = instalarApp;
      }
      step();
    });
  }
  // atualiza a inscrição (o celular pode trocar o endereço de notificação)
  function revalidarPush() {
    if (!S.me || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted' || !navigator.onLine) return;
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (sub) api('pushSubscribe', { enc: S.me.nome, sub: sub.toJSON() }).catch(function () { }); else if (S.boot && S.boot.vapid) ativarNotificacoes();
    }).catch(function () { });
  }

  /* ---------------- início ---------------- */
  function start() {
    setPill();
    Promise.all([DB.get('kv', 'key'), DB.get('kv', 'boot'), DB.get('kv', 'me'), DB.get('kv', 'refs')]).then(function (r) {
      S.key = r[0] || ''; S.boot = r[1] || null; S.refs = r[3] || null;
      if (S.boot && r[2]) S.me = S.boot.encarregados.filter(function (e) { return e.nome === r[2]; })[0] || null;
      if (location.hash === '#admin') { render(); return; }
      if (S.boot) { applyLocalTeamOps().then(function () { render(); countPending(); sync(); if (S.me) DB.get('kv', 'inbox:' + S.me.nome).then(function (m) { S.inbox = m || []; updateBell(); }); tour(); revalidarPush(); }); }
      else { render(); if (S.key) refreshBoot().then(render); }
    });
  }
  window.RDA_APP = { render: render, today: today, horario: horario };
  start();
})();

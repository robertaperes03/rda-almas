/* Tela da administradora: controle de recebimento, PDF, planilha e importações */
(function () {
  'use strict';
  var U = function () { return window.RDA_UTIL; };
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } };
  var A = { pass: lsGet('rda_admin_tok') || '', user: (function () { try { return JSON.parse(lsGet('rda_admin_user') || 'null'); } catch (e) { return null; } })(), tab: 'entregas', date: null, dias: 7, todos: false, de: null, ate: null, list: null };
  var DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  var DIAS_EXT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var ABREV = { 'SEM ESCALA': 'S/E', 'DOMINGO / DSR': 'DSR', 'FERIADO': 'FER', 'FOLGA DE CAMPO': 'F.C', 'SEM ATIVIDADE': 'S/A', 'PARALISAÇÃO': 'PAR', 'PARALISAÇÃO CLIMÁTICA': 'CHU', 'AGUARDANDO LIBERAÇÃO': 'AG.L', 'FOLGA': 'FOL', 'FÉRIAS': 'FÉR', 'ATESTADO / MÉDICO': 'ATE', 'FALTA JUSTIFICADA': 'F.J', 'NÃO TEM RDA': 'N/T', 'ENTREGUE EM PAPEL': 'PAP' };
  function p2(n) { return ('0' + n).slice(-2); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dow(s) { return new Date(s + 'T12:00:00').getDay(); }
  function diff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function esc(s) { return U().esc(s); }
  function br(s) { return U().br(s); }
  function api(action, data, t) {
    return window.RDA_API(action, Object.assign({ admin: A.pass }, data || {}), t).catch(function (e) {
      if (e.auth && A.pass && action !== 'admin_login') { sair(true); done(e.message); }
      throw e;
    });
  }
  function sair(semServidor) {
    if (A.pass && !semServidor) window.RDA_API('admin_logout', { admin: A.pass }).catch(function () { });
    A.pass = ''; A.user = null; lsSet('rda_admin_tok', null); lsSet('rda_admin_user', null); A.tab = 'entregas';
    if ($root) render();
  }
  var ABAS = [['entregas', '📊 Recebimento'], ['exportar', '📄 RDAs e exportação'], ['importar', '⬆️ Importar'], ['he', '⏱ Horas extras'], ['avisos', '🔔 Avisos'], ['msg', '✉️ Mensagens'], ['folgas', '🏖 Folgas'], ['feriados', '📅 Feriados'], ['cadastro', '🗂 Cadastro base']];
  function podeAba(t) { var u = A.user; return !!u && (u.mestre || (u.abas || []).indexOf(t) >= 0); }
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
    if (!e.cobra && !e.papel && !ov) sit = 'NÃO TEM RDA';
    else if (!ov && !r && j.inicio && d < j.inicio && sit === 'TRABALHO NORMAL') sit = 'ENTREGUE EM PAPEL';
    var cobra = (j.listaSituacoes.filter(function (x) { return x[0] === sit; })[0] || [sit, true])[1];
    var prazo = prazoDe(e, d, j), agora = j.agora || (today() + ' 23:59');
    var out = { rda: r, sit: sit, obs: ov ? ov.o : (fo ? 'Folga de campo ' + br(fo.ini).slice(0, 5) + '–' + br(fo.fim).slice(0, 5) + (fo.subst ? ', RDA por ' + fo.subst : '') : ''), cobra: cobra || !!r, prevista: prazo.slice(0, 10), prazo: prazo, numero: r ? r.numero : numero(e, d) };
    if (!r && ov && ov.s === 'ENTREGUE EM PAPEL' && e.papel) { out.pap = true; out.cobra = true; out.status = 'Concluído'; out.atraso = 0; out.obs = ov.o || 'RDA em papel recebido'; return out; } // RDA em papel recebido conta como entregue
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
    if (!A.pass || !A.user) return login();
    A.date = A.date || today(); A.de = A.de || today(); A.ate = A.ate || today();
    var minhas = ABAS.filter(function (x) { return podeAba(x[0]); });
    if (A.user.legado) minhas = [];
    var extra = A.user.mestre ? [['usuarios', '👤 Usuários']] : [['conta', '🔑 Minha senha']];
    if (!minhas.concat(extra).some(function (x) { return x[0] === A.tab; })) A.tab = (minhas[0] || extra[0])[0];
    $root.innerHTML = '<div class="tabs">' + minhas.concat(extra).map(function (x) { return '<button data-t="' + x[0] + '">' + x[1] + '</button>'; }).join('') + (minhas.length ? '<button data-t="ajuda">❓</button>' : '') + '<button data-t="sair">Sair</button></div>' +
      '<p class="small muted" style="margin:-4px 0 8px">Conectado como <b>' + esc(A.user.legado ? 'acesso antigo (senha única)' : A.user.nome + ' (' + A.user.login + ')') + '</b></p><div id="adm"></div>';
    [].forEach.call($root.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('sel', b.dataset.t === A.tab);
      b.onclick = function () { if (b.dataset.t === 'sair') { sair(); return; } A.tab = b.dataset.t; render(); };
    });
    if (A.tab === 'ajuda') { A.tab = 'entregas'; tourAdmin(true); }
    if (A.tab === 'usuarios') usuarios(); else if (A.tab === 'conta') minhaConta(); else if (A.tab === 'entregas') entregas(); else if (A.tab === 'exportar') exportar(); else if (A.tab === 'feriados') feriados(); else if (A.tab === 'he') horasExtras(); else if (A.tab === 'avisos') avisos(); else if (A.tab === 'msg') mensagens(); else if (A.tab === 'folgas') folgas(); else if (A.tab === 'cadastro') cadastro(); else importar();
  }

  function login() {
    $root.innerHTML = '<h1>Administração</h1><div class="card"><label class="f">Usuário</label><input id="lg" autocapitalize="none" autocomplete="username" spellcheck="false"><label class="f">Senha</label><input type="password" id="pw" autocomplete="current-password"><button class="btn big" style="margin-top:12px" id="go">Entrar</button><p class="small muted hidden" id="lgdica" style="margin-bottom:0">Primeiro acesso: deixe o <b>usuário em branco</b> e use a senha antiga da administração para criar o seu usuário mestre.</p></div>';
    window.RDA_API('adminTemMestre', {}).then(function (r) { if (!r.mestre) document.getElementById('lgdica').classList.remove('hidden'); }).catch(function () { });
    var go = function () {
      var lg = document.getElementById('lg').value.trim(), pw = document.getElementById('pw').value; if (!pw) return;
      busy('Verificando…');
      window.RDA_API('admin_login', { login: lg, senha: pw }).then(function (r) {
        A.pass = r.token; A.user = r.user; lsSet('rda_admin_tok', r.token); lsSet('rda_admin_user', JSON.stringify(r.user));
        if (r.vapid) sessionStorage.setItem('rda_vapid', r.vapid);
        done(r.user.legado ? 'Crie agora o seu usuário mestre' : 'Bem-vindo(a), ' + r.user.nome.split(' ')[0] + '!');
        A.tab = r.user.legado ? 'usuarios' : 'entregas'; render(); if (!r.user.legado) setTimeout(function () { tourAdmin(); }, 500);
      }).catch(function (e) { done(e.message); });
    };
    document.getElementById('go').onclick = go;
    document.getElementById('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  /* ---------- usuários do ADM (só o mestre vê) ---------- */
  var NOME_ABA = {}; ABAS.forEach(function (x) { NOME_ABA[x[0]] = x[1]; });
  function usuarios() {
    var el = document.getElementById('adm');
    if (A.user.legado) {
      el.innerHTML = '<div class="card"><div class="card-h"><h2>Crie o seu usuário mestre</h2></div><p class="small muted" style="margin-top:0">O usuário mestre vê tudo e é o único que cria, edita e exclui os usuários do ADM. Depois de criado, a senha antiga para de funcionar e cada pessoa entra com o próprio usuário.</p>' +
        '<label class="f">Seu nome</label><input id="unome"><label class="f">Usuário (para entrar)</label><input id="ulogin" autocapitalize="none" spellcheck="false" placeholder="ex.: roberta"><label class="f">E-mail para receber o resumo <span class="muted">(opcional)</span></label><input type="email" id="uemail" autocapitalize="none" spellcheck="false"><label class="f">Senha (mínimo 6 caracteres)</label><input type="password" id="us1" autocomplete="new-password"><label class="f">Repita a senha</label><input type="password" id="us2" autocomplete="new-password">' +
        '<div class="alert hidden" id="ux"></div><button class="btn big" id="usok" style="margin-top:12px">Criar usuário mestre</button></div>';
      document.getElementById('usok').onclick = function () {
        var x = document.getElementById('ux'), s1 = document.getElementById('us1').value, s2 = document.getElementById('us2').value;
        var err = function (m) { x.classList.remove('hidden'); x.textContent = m; };
        if (s1 !== s2) return err('As senhas não são iguais');
        var bt = this; bt.disabled = true;
        api('admin_userSave', { u: { nome: document.getElementById('unome').value, login: document.getElementById('ulogin').value, email: document.getElementById('uemail').value }, senha: s1 }).then(function () {
          done('Usuário mestre criado ✓ Entre com ele agora.'); sair();
        }).catch(function (e) { bt.disabled = false; err(e.message); });
      };
      return;
    }
    el.innerHTML = '<div class="card"><p class="empty">Carregando…</p></div>';
    api('admin_users', {}).then(function (j) {
      A.usrs = j.users;
      el.innerHTML = '<div class="card"><div class="card-h"><h2>Usuários do ADM</h2><button class="btn sm" id="unovo">＋ Novo usuário</button></div><p class="small muted" style="margin-top:0">Cada pessoa entra com o próprio usuário e só vê as abas liberadas. Só você (mestre) vê esta tela.</p>' +
        j.users.map(function (u) {
          return '<div class="rdaline" data-u="' + esc(u.login) + '" style="cursor:pointer"><div class="tx"><b>' + esc(u.nome) + (u.mestre ? ' <span class="tag">Mestre</span>' : '') + (u.ativo ? '' : ' <span class="tag" style="background:#fdecea;color:#b71c1c">Inativo</span>') + '</b><small>' + esc(u.login) + ' · ' +
            (u.mestre ? 'todas as abas' : (u.abas.length ? u.abas.map(function (a) { return NOME_ABA[a] || a; }).join(', ') : 'nenhuma aba')) + (u.email ? ' · ✉️ ' + esc(u.email) : ' · sem e-mail') + (u.ultimo ? ' · último acesso ' + br(u.ultimo.slice(0, 10)) + ' ' + u.ultimo.slice(11, 16) : '') + '</small></div><span class="go">›</span></div>';
        }).join('') + '</div>';
      document.getElementById('unovo').onclick = function () { userForm(null); };
      [].forEach.call(el.querySelectorAll('[data-u]'), function (d) { d.onclick = function () { userForm(A.usrs.filter(function (u) { return u.login === d.dataset.u; })[0]); }; });
    }).catch(function (e) { el.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  function userForm(u) {
    var novo = !u; u = u || { login: '', nome: '', abas: [], ativo: true, mestre: false };
    var b = sheetUI('<h3>' + (novo ? 'Novo usuário' : 'Editar usuário') + '</h3>' +
      '<label class="f">Nome</label><input id="fn" value="' + esc(u.nome) + '"><label class="f">Usuário (para entrar)</label><input id="fl" autocapitalize="none" spellcheck="false" value="' + esc(u.login) + '" placeholder="ex.: jose.erivan">' +
      '<label class="f">E-mail para notificações <span class="muted">(opcional)</span></label><input type="email" id="fe" autocapitalize="none" spellcheck="false" value="' + esc(u.email || '') + '"><p class="small muted" style="margin:4px 0 0">Recebe de hora em hora, quando houver novidade, o resumo só dos assuntos das abas liberadas.</p>' +
      '<label class="f">' + (novo ? 'Senha (mínimo 6 caracteres)' : 'Nova senha <span class="muted">(deixe em branco para manter)</span>') + '</label><input type="password" id="fs" autocomplete="new-password">' +
      (u.mestre ? '<p class="small muted">Usuário mestre: vê todas as abas e não pode ser desativado nem excluído.</p>' :
        '<label class="f">Abas liberadas</label>' + ABAS.map(function (x) { return '<label class="chk" style="margin:4px 0"><input type="checkbox" data-ab="' + x[0] + '"' + (u.abas.indexOf(x[0]) >= 0 ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') +
        '<label class="chk" style="margin-top:10px"><input type="checkbox" id="fa"' + (u.ativo ? ' checked' : '') + '> <b>Ativo</b> (desmarque para bloquear o acesso sem excluir)</label>') +
      '<div class="alert hidden" id="fx"></div><button class="btn block" id="fok" style="margin-top:12px">Salvar</button>' +
      (novo || u.mestre ? '' : '<button class="btn block danger" id="fdel" style="margin-top:8px">Excluir usuário</button>') +
      '<button class="btn block ghost" id="fno" style="margin-top:8px">Cancelar</button>');
    var x = b.querySelector('#fx'), err = function (m) { x.classList.remove('hidden'); x.textContent = m; };
    b.querySelector('#fno').onclick = closeUI;
    b.querySelector('#fok').onclick = function () {
      var bt = this, abas = [].filter.call(b.querySelectorAll('[data-ab]'), function (c) { return c.checked; }).map(function (c) { return c.dataset.ab; });
      var fa = b.querySelector('#fa');
      if (!u.mestre && !abas.length) return err('Marque pelo menos uma aba');
      bt.disabled = true;
      api('admin_userSave', { orig: novo ? '' : u.login, u: { nome: b.querySelector('#fn').value, login: b.querySelector('#fl').value, email: b.querySelector('#fe').value, abas: abas, ativo: fa ? fa.checked : true }, senha: b.querySelector('#fs').value }).then(function (r) {
        if (u.mestre && r.login !== A.user.login) { A.user.login = r.login; lsSet('rda_admin_user', JSON.stringify(A.user)); }
        closeUI(); done('Usuário salvo ✓'); usuarios();
      }).catch(function (e) { bt.disabled = false; err(e.message); });
    };
    var del = b.querySelector('#fdel');
    if (del) del.onclick = function () {
      if (del.dataset.conf !== '1') { del.dataset.conf = '1'; del.textContent = 'Toque de novo para confirmar'; return; }
      del.disabled = true;
      api('admin_userDel', { login: u.login }).then(function () { closeUI(); done('Usuário excluído'); usuarios(); }).catch(function (e) { del.disabled = false; err(e.message); });
    };
  }
  function minhaConta() {
    var el = document.getElementById('adm');
    el.innerHTML = '<div class="card"><div class="card-h"><h2>Trocar minha senha</h2></div><label class="f">Senha atual</label><input type="password" id="ma" autocomplete="current-password"><label class="f">Nova senha (mínimo 6 caracteres)</label><input type="password" id="mn1" autocomplete="new-password"><label class="f">Repita a nova senha</label><input type="password" id="mn2" autocomplete="new-password"><div class="alert hidden" id="mx"></div><button class="btn block" id="mok" style="margin-top:12px">Trocar senha</button></div>';
    document.getElementById('mok').onclick = function () {
      var x = document.getElementById('mx'), n1 = document.getElementById('mn1').value;
      if (n1 !== document.getElementById('mn2').value) { x.classList.remove('hidden'); x.textContent = 'As senhas novas não são iguais'; return; }
      var bt = this; bt.disabled = true;
      api('admin_myPass', { atual: document.getElementById('ma').value, nova: n1 }).then(function () { done('Senha trocada ✓'); minhaConta(); })
        .catch(function (e) { bt.disabled = false; x.classList.remove('hidden'); x.textContent = e.message; });
    };
  }

  /* ---------- Recebimento ---------- */
  // período escolhido por datas (De / Até), com atalhos; no máximo 62 dias
  function periodoUI(de, ate) {
    return '<div class="grid2"><div><label class="f" style="margin-top:0">De</label><input type="date" id="pde2" value="' + de + '"></div><div><label class="f" style="margin-top:0">Até</label><input type="date" id="pate2" value="' + ate + '"></div></div>' +
      '<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:6px"><button class="btn sm ghost" data-pr="0">Só o dia</button><button class="btn sm ghost" data-pr="6">7 dias</button><button class="btn sm ghost" data-pr="14">15 dias</button><button class="btn sm ghost" data-pr="30">31 dias</button></div>';
  }
  function periodoBind(get, set, redraw) {
    var fix = function (de, ate) { if (de > ate) { var t = de; de = ate; ate = t; } if (diffDias(de, ate) > 61) de = addDays(ate, -61); set(de, ate); redraw(); };
    document.getElementById('pde2').onchange = function () { fix(this.value || get()[0], get()[1]); };
    document.getElementById('pate2').onchange = function () { fix(get()[0], this.value || get()[1]); };
    [].forEach.call(document.querySelectorAll('[data-pr]'), function (b) { b.onclick = function () { var ate = get()[1]; fix(addDays(ate, -(+b.dataset.pr)), ate); }; });
  }
  function diffDias(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function diasEntre(a, b) { var o = []; for (var d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; }
  function entregas() {
    var el = document.getElementById('adm');
    A.dIni = A.dIni || addDays(A.date, -6);
    el.innerHTML = '<div class="card">' + periodoUI(A.dIni, A.date) +
      '<label class="chk"><input type="checkbox" id="todos"' + (A.todos ? ' checked' : '') + '> Mostrar também quem não entrega RDA</label><div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm ghost" id="quem">👷 Quem faz RDA</button><button class="btn sm" id="qimg">🖼 Imagem do quadro (para cobrar)</button></div></div><div id="ent"><p class="empty">Carregando…</p></div>';
    periodoBind(function () { return [A.dIni, A.date]; }, function (de, ate) { A.dIni = de; A.date = ate; }, entregas);
    document.getElementById('todos').onchange = function () { A.todos = this.checked; entregas(); };
    document.getElementById('quem').onclick = quemFaz;
    document.getElementById('qimg').onclick = function () { done('Aguarde o quadro carregar'); };
    var de = A.dIni;
    loadControle(de, A.date).then(function (j) {
      var days = diasEntre(A.dIni, A.date);
      var encs = j.encarregados.filter(function (e) { return A.todos || e.cobra || e.papel; });
      var hoje = encs.map(function (e) { return { e: e, c: controle(j, e, A.date) }; });
      var prevDia = hoje.filter(function (x) { return x.c.cobra; }).length, entDia = hoje.filter(function (x) { return x.c.rda || x.c.via || x.c.pap; }).length;
      var prevP = 0, entP = 0, porEnc = {};
      encs.forEach(function (e) { var s = porEnc[e.nome] = { p: 0, e: 0, at: 0 }; days.forEach(function (d) { var c = controle(j, e, d); if (c.cobra) { s.p++; prevP++; } if (c.rda || c.via || c.pap) { s.e++; entP++; if (c.atraso) s.at++; } }); });
      var h = '<div class="kpis"><div><b>' + entDia + '/' + prevDia + '</b><small>entregues em ' + br(A.date).slice(0, 5) + '</small></div><div><b>' + entP + '/' + prevP + '</b><small>no período</small></div><div><b>' + Math.round(entP * 100 / Math.max(1, prevP)) + '%</b><small>aderência</small></div></div>';
      var pend = [];
      encs.forEach(function (e) { days.forEach(function (d) { var c = controle(j, e, d); if (c.status === 'Pendente') pend.push({ e: e, d: d, c: c }); }); });
      var line = function (x) {
        return '<div class="rdaline"><div class="tx"><b>' + esc(x.e.curto || x.e.nome) + ' · ' + br(x.d) + '</b><small>' + esc(x.c.numero) + ' · prazo ' + br(x.c.prevista).slice(0, 5) + ' 12:00' + (x.c.atraso ? ' · <b style="color:var(--bad)">' + x.c.atraso + ' dia(s) de atraso</b>' : '') + '</small></div>' + (x.e.papel ? '<button class="btn sm ok" data-pap="' + esc(x.e.nome) + '|' + x.d + '">✓ Recebi</button>' : '') + '<button class="btn sm ghost" data-sit="' + esc(x.e.nome) + '|' + x.d + '">Situação</button></div>';
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
          if (c.pap) return '<td class="ok" data-sit="' + key + '" title="Recebido">✓</td>';
          if (c.status === 'Pendente') return '<td class="pend" data-sit="' + key + '" title="' + esc(c.sit) + '">✗</td>';
          if (c.status === 'No prazo') return '<td data-sit="' + key + '" style="background:#fff8e1;color:#a36b00;font-weight:700" title="Prazo ' + esc(br(c.prazo.slice(0, 10)) + ' 12:00') + '">…</td>';
          return '<td class="na" data-sit="' + key + '" title="' + esc(c.sit + (c.obs ? ' – ' + c.obs : '')) + '"><small>' + esc(ABREV[c.sit] || c.sit.slice(0, 3)) + '</small></td>';
        }).join('') + '</tr>';
      });
      h += '</tbody></table></div><p class="small muted">✓ entregue (toque para o PDF; laranja = entregue com atraso; azul = consta no RDA de outro encarregado) · … ainda no prazo (até 12:00 do próximo dia de atividade) · ✗ atrasado · siglas = situação que não cobra RDA (DSR, FER, F.C = folga de campo, PAR, CHU, N/T = não tem RDA, PAP = entregue em papel, antes da cobrança pelo app…). Toque num dia sem RDA para mudar a situação.</p></div>';
      document.getElementById('ent').innerHTML = h;
      document.getElementById('qimg').onclick = function () { quadroImagem(j, encs, days, pend); };
      [].forEach.call(document.querySelectorAll('[data-pap]'), function (bt) { bt.onclick = function (ev) { ev.stopPropagation(); var k = bt.dataset.pap.split('|'); busy('Salvando…'); api('admin_setSituacao', { enc: k[0], date: k[1], situacao: 'ENTREGUE EM PAPEL', obs: 'RDA em papel recebido' }).then(function () { done('Recebido em papel ✓'); entregas(); }).catch(function (er) { done('Erro: ' + er.message); }); }; });
      [].forEach.call(document.querySelectorAll('td.ok'), function (td) { td.onclick = function () { pdfOne(td.dataset.id); }; });
      [].forEach.call(document.querySelectorAll('[data-sit]'), function (td) { td.onclick = function () { var k = td.dataset.sit.split('|'); situacao(j, k[0], k[1]); }; });
    }).catch(function (e) { document.getElementById('ent').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  // imagem do mapa de recebimento para mandar no grupo cobrando quem está pendente
  function quadroImagem(j, encs, days, pend) {
    var S2 = 2, nmW = 250, enW = 90, dW = days.length === 1 ? 230 : 62, rH = 40, top = 118, W = nmW + enW + dW * days.length + 40;
    var pendTxt = {}; pend.forEach(function (x) { (pendTxt[x.e.curto || x.e.nome] = pendTxt[x.e.curto || x.e.nome] || []).push(br(x.d).slice(0, 5)); });
    var pk = Object.keys(pendTxt).sort(), pendLines = [];
    var cv = document.createElement('canvas'), g = cv.getContext('2d');
    g.font = '15px Arial';
    var cur = 'Pendentes: ';
    pk.forEach(function (k) { var t = k + ' (' + pendTxt[k].join(', ') + ')'; var nxt = cur + (cur === 'Pendentes: ' || cur === '' ? '' : ' · ') + t; if (g.measureText(nxt).width > W - 40 && cur && cur !== 'Pendentes: ') { pendLines.push(cur); cur = t; } else cur = nxt; });
    pendLines.push(pk.length ? cur : 'Ninguém pendente ✓');
    var H = top + 34 + encs.length * rH + 30 + pendLines.length * 22 + 70;
    cv.width = W * S2; cv.height = H * S2; g = cv.getContext('2d'); g.scale(S2, S2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b2a5b'; g.fillRect(0, 0, W, 64);
    g.fillStyle = '#fff'; g.font = 'bold 21px Arial'; g.textBaseline = 'middle';
    g.fillText('Recebimento de RDA – ' + (days.length === 1 ? DIAS_EXT[dow(days[0])] + ', ' + br(days[0]) : br(days[0]).slice(0, 5) + ' a ' + br(days[days.length - 1])), 20, 25);
    g.font = '13px Arial'; g.fillText('PABH 059 25 · Projeto Almas – Britagem · gerado em ' + br(today()) + ' ' + new Date().toTimeString().slice(0, 5), 20, 48);
    var prev = 0, ent = 0; encs.forEach(function (e) { days.forEach(function (d) { var c = controle(j, e, d); if (c.cobra) prev++; if (c.rda || c.via || c.pap) ent++; }); });
    g.fillStyle = '#202124'; g.font = 'bold 15px Arial';
    g.fillText('Entregues: ' + ent + ' de ' + prev + '  ·  Aderência: ' + Math.round(ent * 100 / Math.max(1, prev)) + '%  ·  Pendentes: ' + pend.length, 20, 90);
    var x0 = 20, y = top;
    var cell = function (x, y2, w, txt, bg, fg, bold, al) {
      g.fillStyle = bg; g.fillRect(x, y2, w, rH); g.strokeStyle = '#dadce0'; g.lineWidth = 1; g.strokeRect(x + .5, y2 + .5, w, rH);
      g.fillStyle = fg; g.font = (bold ? 'bold ' : '') + '14px Arial'; g.textAlign = al || 'center'; g.fillText(txt, al === 'left' ? x + 10 : x + w / 2, y2 + rH / 2); g.textAlign = 'left';
    };
    cell(x0, y, nmW, 'Encarregado', '#eef1f6', '#0b2a5b', true, 'left'); cell(x0 + nmW, y, enW, 'Entregue', '#eef1f6', '#0b2a5b', true);
    days.forEach(function (d, i) { cell(x0 + nmW + enW + i * dW, y, dW, (days.length === 1 ? DIAS[dow(d)] + ' ' : '') + br(d).slice(0, 5), '#eef1f6', '#0b2a5b', true); });
    y += rH;
    encs.forEach(function (e) {
      var pe = 0, en = 0;
      days.forEach(function (d) { var c = controle(j, e, d); if (c.cobra) pe++; if (c.rda || c.via || c.pap) en++; });
      cell(x0, y, nmW, e.curto || e.nome, '#fff', '#202124', true, 'left');
      cell(x0 + nmW, y, enW, en + '/' + pe, '#fff', en < pe ? '#d93025' : '#1e8e3e', true);
      days.forEach(function (d, i) {
        var c = controle(j, e, d), x = x0 + nmW + enW + i * dW, one = days.length === 1;
        if (c.via) cell(x, y, dW, one ? '✓ no RDA de ' + (c.via.enc || '').split(' ')[0] : '✓', '#e3f2fd', '#0b4f9c', true);
        else if (c.rda) cell(x, y, dW, c.atraso ? '✓ +' + c.atraso + 'd' : (one ? '✓ Entregue' : '✓'), c.atraso ? '#fff1e6' : '#e6f4ea', c.atraso ? '#a34600' : '#1e8e3e', true);
        else if (c.pap) cell(x, y, dW, one ? '✓ Entregue' : '✓', '#e6f4ea', '#1e8e3e', true);
        else if (c.status === 'Pendente') cell(x, y, dW, one ? '✗ PENDENTE' : '✗', '#fde7e5', '#d93025', true);
        else if (c.status === 'No prazo') cell(x, y, dW, one ? '… no prazo' : '…', '#fff8e1', '#a36b00', true);
        else cell(x, y, dW, ABREV[c.sit] || c.sit.slice(0, 3), '#f8f9fa', '#80868b', false);
      });
      y += rH;
    });
    y += 26; g.font = 'bold 15px Arial'; g.fillStyle = pk.length ? '#d93025' : '#1e8e3e';
    pendLines.forEach(function (l) { g.fillText(l, 20, y); y += 22; g.font = '15px Arial'; });
    g.font = '12px Arial'; g.fillStyle = '#5f6368';
    g.fillText('✓ entregue · ✓ +Nd entregue com atraso · … no prazo', 20, y + 14);
    g.fillText('✗ pendente (prazo: 12:00 do próximo dia de atividade) · DSR / FER / S/E / F.C / S/A = não cobra', 20, y + 32);
    cv.toBlob(function (blob) {
      var nome = 'Recebimento RDA ' + (days.length === 1 ? br(days[0]).replace(/\//g, '-') : br(days[0]).slice(0, 5).replace('/', '-') + ' a ' + br(days[days.length - 1]).replace(/\//g, '-')) + '.png';
      var f = null; try { f = new File([blob], nome, { type: 'image/png' }); } catch (e) { }
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: nome }).catch(function () { download(blob, nome); });
      else download(blob, nome);
      done('Imagem pronta ✓');
    }, 'image/png');
  }
  function situacao(j, enc, d) {
    var e = j.encarregados.filter(function (x) { return x.nome === enc; })[0];
    var c = controle(j, e, d);
    var b = sheetUI('<h3>' + esc(e.curto || e.nome) + ' · ' + br(d) + '</h3>' + (e.papel && !c.rda ? '<button class="btn block ok" data-v="ENTREGUE EM PAPEL" style="margin-bottom:10px">✓ Recebi o RDA</button>' : '') + '<p class="small muted">Situação operacional (igual à aba MASTER do seu controle). Em verde: cobra RDA.</p><div class="stgrid">' +
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
      '<div class="row" style="margin-top:12px"><button class="btn ok" id="xls">📊 Planilha (.xlsx)</button><button class="btn" id="pdfall">📄 PDF de todos</button></div><button class="btn block" id="pdfarm" style="margin-top:8px;background:#00695c">🔩 Montagem de armação (PDF)</button><button class="btn block ghost" id="quadro" style="margin-top:8px">👥 Quadro de equipes – último status (.xlsx)</button><button class="btn block ghost" id="branco" style="margin-top:8px">🖨 Em branco para imprimir (RDA e escala de hora extra)</button></div><div class="card" id="lst"><p class="empty">Carregando…</p></div>';
    document.getElementById('de').onchange = function () { A.de = this.value; if (A.ate < A.de) A.ate = A.de; exportar(); };
    document.getElementById('ate').onchange = function () { A.ate = this.value; exportar(); };
    document.getElementById('xls').onclick = planilha;
    document.getElementById('pdfall').onclick = function () { pdfMany(A.list || []); };
    document.getElementById('quadro').onclick = quadroEquipes;
    document.getElementById('branco').onclick = rdaBranco;
    document.getElementById('pdfarm').onclick = function () { pdfMany((A.list || []).filter(function (r) { return r.armacao; }), true); };
    api('admin_list', { de: A.de, ate: A.ate }).then(function (j) {
      A.list = j.rdas.sort(function (a, b) { return (a.date + a.disciplina + a.enc).localeCompare(b.date + b.disciplina + b.enc); });
      document.getElementById('lst').innerHTML = '<div class="card-h"><h2>' + A.list.length + ' RDA(s)</h2></div>' + (A.list.map(function (r) {
        return '<div class="rdaline"><div class="tx"><b>' + esc(r.numero) + '</b><small>' + br(r.date) + ' · ' + esc(r.enc) + ' · ' + r.presentes + '/' + r.equipe + ' presentes · ' + r.atividades + ' ativ. · ' + r.fotos + ' fotos' + (r.versao > 1 ? ' · reenviado (v' + r.versao + ')' : '') + (r.armacao ? ' · 🔩 ' + r.armacao + ' linha(s) de armação' : '') + '</small></div>' + (r.armacao ? '<button class="btn sm" style="background:#00695c" data-arm="' + esc(r.id) + '">🔩</button>' : '') + '<button class="btn sm ghost" title="Mudar data ou excluir" data-mv="' + esc(r.id) + '">✏️</button>' + '<button class="btn sm" data-id="' + esc(r.id) + '">PDF</button></div>';
      }).join('') || '<p class="empty">Nenhum RDA no período</p>');
      [].forEach.call(document.querySelectorAll('#lst [data-id]'), function (b) { b.onclick = function () { pdfOne(b.dataset.id); }; });
      [].forEach.call(document.querySelectorAll('#lst [data-arm]'), function (b) { b.onclick = function () { pdfOne(b.dataset.arm, true); }; });
      [].forEach.call(document.querySelectorAll('#lst [data-mv]'), function (b) { b.onclick = function () { mudaData(A.list.filter(function (r) { return r.id === b.dataset.mv; })[0]); }; });
    }).catch(function (e) { document.getElementById('lst').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }

  // corrige a data de um RDA enviado com a data errada
  function mudaData(r) {
    if (!r) return;
    var b = sheetUI('<h3>✏️ Corrigir RDA</h3><p><b>' + esc(r.numero) + '</b><br><small class="muted">' + esc(r.enc) + ' · enviado com a data <b>' + br(r.date) + '</b></small></p>' +
      '<h4 style="margin:14px 0 4px">📅 Mudar a data</h4><label class="f">Data correta</label><input type="date" id="mvd" max="' + today() + '">' +
      '<p class="small muted">Tudo vai para a data nova: equipe, atividades, fotos, armação e recebimento. O número do RDA é recalculado e o celular do encarregado se ajusta sozinho na próxima vez que abrir o app, liberando a data antiga para um RDA novo.</p>' +
      '<div class="alert" id="mvx" style="display:none"></div>' +
      '<button class="btn block" id="mvok">Mudar data</button>' +
      '<h4 style="margin:22px 0 4px">🗑 Excluir o RDA</h4><p class="small muted">Use para RDA enviado por engano ou repetido. Uma cópia fica guardada na aba RDA_EXCLUIDOS da planilha. No celular do encarregado o dia volta como <b>rascunho</b>, com o conteúdo, para corrigir e enviar de novo se precisar.</p>' +
      '<button class="btn block danger" id="dlok">Excluir este RDA</button>' +
      '<button class="btn block ghost" id="mvno" style="margin-top:14px">Cancelar</button>');
    b.querySelector('#mvno').onclick = closeUI;
    b.querySelector('#dlok').onclick = function () {
      var bt = this;
      if (bt.dataset.conf !== '1') { bt.dataset.conf = '1'; bt.textContent = 'Toque de novo para confirmar a exclusão'; return; }
      bt.disabled = true; bt.textContent = 'Excluindo…';
      api('admin_delRda', { id: r.id }).then(function (j) { closeUI(); done('RDA ' + j.numero + ' (' + br(j.data) + ') excluído'); exportar(); })
        .catch(function (e) { bt.disabled = false; bt.dataset.conf = ''; bt.textContent = 'Excluir este RDA'; var x = b.querySelector('#mvx'); x.style.display = ''; x.textContent = e.message; });
    };
    b.querySelector('#mvok').onclick = function () {
      var d = b.querySelector('#mvd').value, x = b.querySelector('#mvx');
      if (!d) { x.style.display = ''; x.textContent = 'Escolha a data correta.'; return; }
      if (d === r.date) { x.style.display = ''; x.textContent = 'O RDA já está nessa data.'; return; }
      var bt = this; bt.disabled = true; bt.textContent = 'Mudando…';
      api('admin_moveRda', { id: r.id, data: d }).then(function (j) {
        closeUI(); done('RDA movido para ' + br(j.para) + ' · novo nº ' + j.numero);
        if (A.de > d) A.de = d; exportar();
      }).catch(function (e) { bt.disabled = false; bt.textContent = 'Mudar data'; x.style.display = ''; x.textContent = e.message; });
    };
  }

  function fetchFull(id, semFotos) {
    return api('admin_get', { id: id }).then(function (j) {
      var r = j.rda, fotos = [], jobs = [];
      if (semFotos) return { rda: r, assinatura: j.assinatura, fotos: [] };
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
  function pdfOne(id, arm) {
    busy('Gerando PDF…');
    prepPdf().then(function (logo) {
      return fetchFull(id, arm).then(function (f) {
        return window.newPdfDoc().then(function (doc) {
          if (arm) { window.buildArmacaoPdf(f.rda, { logo: logo }, doc); return doc.save(f.rda.date + ' - ' + f.rda.numero + ' - MONTAGEM DE ARMACAO.pdf'); }
          window.buildRdaPdf(f.rda, { logo: logo, assinatura: f.assinatura, fotos: f.fotos }, doc);
          return doc.save(f.rda.date + ' - ' + f.rda.numero + '.pdf');
        });
      });
    }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
  }
  function pdfMany(list, arm) {
    if (!list.length) return done(arm ? 'Nenhuma montagem de armação no período' : 'Nenhum RDA no período');
    prepPdf().then(function (logo) {
      return window.newPdfDoc().then(function (doc) {
        var i = 0;
        return list.reduce(function (c, r) {
          return c.then(function () {
            busy('Gerando PDF ' + (++i) + ' de ' + list.length + '…');
            return fetchFull(r.id, arm).then(function (f) { if (arm) window.buildArmacaoPdf(f.rda, { logo: logo }, doc); else window.buildRdaPdf(f.rda, { logo: logo, assinatura: f.assinatura, fotos: f.fotos }, doc); });
          });
        }, Promise.resolve()).then(function () { busy('Finalizando arquivo…'); return doc.save((arm ? 'Montagem de armação ' : 'RDAs ') + A.de + (A.ate !== A.de ? ' a ' + A.ate : '') + '.pdf'); });
      });
    }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
  }
  // RDA em branco (nome, disciplina, supervisor e equipe atual impressos) para quem preenche à mão
  function norm(t) { return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  function rdaBranco() {
    busy('Carregando encarregados e equipes…');
    api('admin_quadro', {}, 120000).then(function (j) {
      document.getElementById('toast').classList.add('hidden');
      var encs = j.encarregados || {}, eq = {};
      j.pessoas.forEach(function (p) { if (p.enc && p.enc !== j.livre && p.enc !== 'DESLIGADO') (eq[p.enc] = eq[p.enc] || []).push(p); });
      var nomes = Object.keys(encs).filter(function (n) { return encs[n].ativo !== false; }).sort(function (a, c) { return (encs[c].papel ? 1 : 0) - (encs[a].papel ? 1 : 0) || a.localeCompare(c); });
      var b = sheetUI('<h3>🖨 Em branco para imprimir</h3><p class="small muted">Para o encarregado que ainda preenche no papel. Sai com <b>nome, supervisor e a equipe atual</b> já impressos (o encarregado em primeiro) e o resto em branco, numa folha só.</p>' +
        '<label class="f">O que imprimir</label><select id="rbt"><option value="rda">RDA em branco</option><option value="he">Escala / permissão de hora extra em branco</option><option value="ambos">Os dois</option></select>' +
        '<label class="f">Buscar encarregado</label><input id="rbq" placeholder="Digite parte do nome">' +
        '<div id="rbl" style="max-height:46vh;overflow:auto;margin-top:6px"></div>' +
        '<label class="f">Folhas por encarregado</label><input type="number" id="rbn" min="1" max="31" value="1"><p class="small muted" style="margin-top:4px">Ex.: 6 para levar a semana toda impressa.</p>' +
        '<button class="btn block" id="rbok" style="margin-top:10px">Gerar PDF</button><button class="btn block ghost" id="rbno" style="margin-top:8px">Cancelar</button>');
      var sel = {}; nomes.forEach(function (n) { if (encs[n].papel) sel[n] = true; });
      var lista = function () {
        var q = norm(b.querySelector('#rbq').value);
        b.querySelector('#rbl').innerHTML = nomes.filter(function (n) { return !q || norm(n).indexOf(q) >= 0; }).map(function (n) {
          return '<label class="person" style="cursor:pointer;padding:6px 0"><input type="checkbox" data-rb="' + esc(n) + '"' + (sel[n] ? ' checked' : '') + ' style="width:24px;height:24px;min-height:0;flex:0 0 24px"><div class="pinfo"><b style="font-size:15px">' + esc(n) + (encs[n].papel ? ' <span class="tag" style="background:#fff4e5;color:#a34600">📝 papel</span>' : '') + '</b><small>' + esc(encs[n].disciplina || '') + ' · ' + (eq[n] || []).length + ' pessoa(s)</small></div></label>';
        }).join('') || '<p class="empty">Nenhum encarregado</p>';
        [].forEach.call(b.querySelectorAll('[data-rb]'), function (c) { c.onchange = function () { sel[c.dataset.rb] = c.checked; }; });
      };
      b.querySelector('#rbq').oninput = lista; lista();
      b.querySelector('#rbno').onclick = closeUI;
      b.querySelector('#rbok').onclick = function () {
        var tipo = b.querySelector('#rbt').value, es = nomes.filter(function (n) { return sel[n]; }), cop = Math.max(1, Math.min(31, parseInt(b.querySelector('#rbn').value, 10) || 1));
        if (!es.length) return done('Marque pelo menos um encarregado');
        closeUI(); busy('Gerando PDF…');
        var agora = new Date(), hoje = ('0' + agora.getDate()).slice(-2) + '/' + ('0' + (agora.getMonth() + 1)).slice(-2) + '/' + agora.getFullYear();
        prepPdf().then(function (logo) {
          return window.newPdfDoc().then(function (doc) {
            es.forEach(function (n) {
              var e = encs[n], tk = norm(n).split(/\s+/);
              // o encarregado vem sempre em primeiro (nome igual ou com todos os nomes do cadastro); depois quem tem função de encarregado; depois A-Z
              var rank = function (p) { var pn = norm(p.nome); if (pn === norm(n) || tk.every(function (w) { return (' ' + pn + ' ').indexOf(' ' + w + ' ') >= 0; })) return 0; return /ENCARREG/.test(norm(p.funcao)) ? 1 : 2; };
              var team = (eq[n] || []).slice().sort(function (a, c) { return rank(a) - rank(c) || String(a.nome).localeCompare(c.nome); })
                .map(function (p) { return { chapa: p.chapa, nome: p.nome, funcao: p.funcao }; });
              var r = { branco: true, impressoEm: hoje, date: '', enc: n, disciplina: e.disciplina || '', supervisor: e.supervisor || '', modelo: e.modelo || 'PADRAO', team: team, clima: {} };
              var hp = { branco: true, impressoEm: hoje, enc: n, supervisor: e.supervisor || '', equipe: team, pessoas: [] };
              for (var k = 0; k < cop; k++) {
                if (tipo !== 'he') window.buildRdaPdf(JSON.parse(JSON.stringify(r)), { logo: logo }, doc);
                if (tipo !== 'rda') window.buildPermissaoPdf(hp, { logo: logo }, doc);
              }
            });
            return doc.save((tipo === 'he' ? 'Escala HE em branco - ' : tipo === 'ambos' ? 'RDA e escala HE em branco - ' : 'RDA em branco - ') + (es.length === 1 ? es[0] : es.length + ' encarregados') + '.pdf');
          });
        }).then(function () { done('PDF pronto ✓'); }).catch(function (e) { done('Erro: ' + e.message); });
      };
    }).catch(function (e) { done('Erro: ' + e.message); });
  }
  // todo o efetivo, por encarregado, com o último status informado no RDA
  function quadroEquipes() {
    busy('Montando quadro de equipes…');
    Promise.all([loadScript('jszip.min.js').then(function () { return loadScript('xlsxw.js'); }), api('admin_quadro', {}, 120000)]).then(function (x) {
      var j = x[1], ps = j.pessoas.slice(), SEM = 'SEM RDA';
      var st = function (p) { return p.status || SEM; };
      ps.sort(function (a, b) { return (a.enc === j.livre) - (b.enc === j.livre) || String(a.enc).localeCompare(b.enc) || String(a.nome).localeCompare(b.nome); });
      var cab = ['ENCARREGADO', 'DISCIPLINA', 'CHAPA', 'NOME', 'FUNÇÃO', 'TIPO MO', 'ÚLTIMO STATUS', 'DATA DO ÚLTIMO RDA', 'Nº DO ÚLTIMO RDA', 'OBSERVAÇÃO'];
      var linha = function (p) { return [p.enc, p.disciplina, p.chapa, p.nome, p.funcao, p.mo, st(p), p.data ? br(p.data) : '', p.num, p.encRda && p.encRda !== p.enc ? 'Último RDA na equipe de ' + p.encRda : '']; };
      var grupos = {}, ordem = [];
      ps.forEach(function (p) { if (!grupos[p.enc]) { grupos[p.enc] = []; ordem.push(p.enc); } grupos[p.enc].push(p); });
      var conta = {}; ps.forEach(function (p) { conta[st(p)] = (conta[st(p)] || 0) + 1; });
      var sts = Object.keys(conta).sort(function (a, b) { return (a === SEM) - (b === SEM) || conta[b] - conta[a]; });
      var res = [['ENCARREGADO', 'DISCIPLINA', 'TOTAL', 'MOD', 'MOI'].concat(sts)];
      var tot = ['TOTAL', '', 0, 0, 0].concat(sts.map(function () { return 0; }));
      ordem.forEach(function (e) {
        var g = grupos[e], r = [e, (j.encarregados[e] || {}).disciplina || (g[0] || {}).disciplina || '', g.length,
          g.filter(function (p) { return /MOD/i.test(p.mo); }).length, g.filter(function (p) { return /MOI/i.test(p.mo); }).length];
        sts.forEach(function (s) { r.push(g.filter(function (p) { return st(p) === s; }).length || ''); });
        r.forEach(function (v, i) { if (i >= 2) tot[i] += Number(v) || 0; });
        res.push(r);
      });
      res.push(tot);
      var sheets = [{ name: 'Geral', rows: [cab].concat(ps.map(linha)) }, { name: 'Resumo por status', rows: res }];
      var usados = {};
      ordem.forEach(function (e) {
        var nm = String(e).replace(/[\[\]:*?\/\\]/g, ' ').trim().substr(0, 28) || 'Sem nome', k = nm, i = 2;
        while (usados[k.toUpperCase()]) k = nm.substr(0, 26) + ' ' + i++;
        usados[k.toUpperCase()] = 1;
        var g = grupos[e], rows = [cab.slice(1)].concat(g.map(function (p) { return linha(p).slice(1); }));
        rows.push([]); rows.push(['RESUMO', '', '', 'TOTAL', g.length]);
        var c = {}; g.forEach(function (p) { c[st(p)] = (c[st(p)] || 0) + 1; });
        Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).forEach(function (s) { rows.push(['', '', '', s, c[s]]); });
        sheets.push({ name: k, rows: rows });
      });
      return window.makeXlsx(sheets).then(function (blob) { download(blob, 'Quadro de equipes - ultimo status ' + today() + '.xlsx'); done('Quadro de equipes pronto ✓ (' + ps.length + ' pessoas)'); });
    }).catch(function (e) { done('Erro: ' + e.message); });
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
          if (!e.cobra && !e.papel && !c.rda) return;
          ctl.push([c.via ? c.via.numero : c.numero, e.disciplina, e.curto || e.nome, br(d), DIAS_EXT[dow(d)], br(c.prevista) + ' 12:00', c.entrega ? br(c.entrega) : '', c.status, c.atraso, c.sit, c.cobra ? 'SIM' : 'NÃO', c.obs || '']);
        });
      }
      sheets.push({ name: 'Controle de recebimento', rows: ctl });
      var nomes = { RDA: 'RDAs', RDA_EFETIVO: 'Efetivo', RDA_ATIVIDADES: 'Atividades', RDA_EQUIPAMENTOS: 'Equipamentos', RDA_PARALISACOES: 'Paralisações', RDA_ARMACAO: 'Armação', RDA_FOTOS: 'Fotos', HORA_EXTRA: 'Horas extras', HORA_EXTRA_PESSOAS: 'Horas extras - pessoas' };
      Object.keys(nomes).forEach(function (k) { var tb = t[k]; if (tb) sheets.push({ name: nomes[k], rows: [tb.header].concat(tb.rows) }); });
      return window.makeXlsx(sheets).then(function (blob) { download(blob, 'RDA - Registros ' + A.de + (A.ate !== A.de ? ' a ' + A.ate : '') + '.xlsx'); done('Planilha pronta ✓'); });
    }).catch(function (e) { done('Erro: ' + e.message); });
  }

  /* ---------- Importar programação semanal e posição de frota ---------- */
  function importar() {
    var el = document.getElementById('adm');
    el.innerHTML = '<div class="card"><div class="card-h"><h2>Efetivo diário nominal (RH)</h2></div><p class="small muted" style="margin-top:0">Escolha o arquivo do dia (Efetivo Diario Nominal - ALMAS…xlsx, aba PAREX). Quem é novo entra em <b>Sem equipe</b> para o encarregado puxar. Férias, atestado, afastado INSS e folga de campo do dia já vêm marcados no RDA daquele dia. Demitidos, transferidos e funções diferentes ficam para você decidir em <b>🗂 Cadastro base › Efetivo</b>.</p>' +
      '<label class="btn block">👷 Escolher efetivo nominal…<input type="file" id="fefe" accept=".xlsx" class="hidden"></label><div id="refe"></div></div>' +
      '<div class="card"><div class="card-h"><h2>Programação semanal</h2></div><p class="small muted" style="margin-top:0">Escolha o arquivo da programação da semana (.xlsx, mesmo modelo de sempre). Os encarregados passam a ver a programação no celular.</p>' +
      '<label class="btn block">📋 Escolher programação…<input type="file" id="fprog" accept=".xlsx" class="hidden"></label><div id="rprog"></div></div>' +
      '<div class="card"><div class="card-h"><h2>Posição de frota (equipamentos)</h2></div><p class="small muted" style="margin-top:0">Escolha a planilha de posição de frota. A lista da aba CADASTRO vira a sugestão de equipamentos no RDA (o que você cadastrou ou editou em Cadastro base › Equipamentos é mantido). Ficam de fora os que estão como DESM (desmobilizado) na aba POSIÇÃO DE FROTA - ANALÍTICA na última data marcada até hoje.</p>' +
      '<label class="btn block ghost">🚜 Escolher posição de frota…<input type="file" id="ffrota" accept=".xlsx" class="hidden"></label><div id="rfrota"></div></div>' +
      '<div class="card"><div class="card-h"><h2>Projetos (lista do Greendocs)</h2></div><p class="small muted" style="margin-top:0">Quando sair revisão nova, exporte do Greendocs e escolha aqui a planilha (colunas Nome, Título Complementar e Revisão). Pode escolher as duas listas juntas (Projetos e PIM/CODEME). A lista do app é substituída por estas.</p>' +
      '<label class="btn block ghost">📐 Escolher lista(s) do Greendocs…<input type="file" id="fgd" accept=".xlsx" multiple class="hidden"></label><div id="rgd"></div></div>' +
      '<div class="card"><div class="card-h"><h2>TAGs</h2></div><p class="small muted" style="margin-top:0">Escolha uma ou mais planilhas com as colunas <b>TAG</b>, DESCRIÇÃO, TIPO, DOCUMENTO, DISCIPLINA e ÁREA (só a TAG é obrigatória; a ordem das colunas não importa). Só entram as TAGs <b>novas</b>; as que já existem no app não são alteradas.</p>' +
      '<label class="btn block ghost">🏷 Escolher planilha(s) de TAGs…<input type="file" id="ftag" accept=".xlsx" multiple class="hidden"></label><div id="rtag"></div></div>';
    document.getElementById('fefe').onchange = function () { var f = this.files[0]; if (f) importEfetivo(f); this.value = ''; };
    efePend();
    document.getElementById('fprog').onchange = function () { var f = this.files[0]; if (f) importProg(f); this.value = ''; };
    document.getElementById('ffrota').onchange = function () { var f = this.files[0]; if (f) importFrota(f); this.value = ''; };
    document.getElementById('fgd').onchange = function () { var f = [].slice.call(this.files); if (f.length) importGreendocs(f); this.value = ''; };
    document.getElementById('ftag').onchange = function () { var f = [].slice.call(this.files); if (f.length) importTags(f); this.value = ''; };
  }
  function importEfetivo(file) {
    var out = document.getElementById('refe'); out.innerHTML = '<p class="empty">Lendo arquivo…</p>';
    libsXlsx().then(function () { return window.readXlsx(file); }).then(function (book) {
      var res = null, nomes = Object.keys(book).sort(function (a, b) { return (H(a) === 'PAREX' ? 0 : 1) - (H(b) === 'PAREX' ? 0 : 1); });
      nomes.some(function (name) {
        var rows = book[name];
        for (var i = 0; i < Math.min(rows.length, 15); i++) {
          var hdr = (rows[i] || []).map(function (x) { return typeof x === 'number' ? x : H(x); });
          var cC = hdr.indexOf('CHAPA'), cN = hdr.indexOf('NOME');
          if (cC < 0 || cN < 0) continue;
          var f = function (pre) { for (var c = 0; c < hdr.length; c++) if (typeof hdr[c] === 'string' && hdr[c].indexOf(pre) === 0) return c; return -1; };
          var cF = f('FUNC'), cM = f('MAO DE OBRA'), cS = f('SETOR'), dcols = {};
          hdr.forEach(function (v, c) { if (typeof v === 'number' && v > 40000 && v < 60000) dcols[c] = window.xlsDate(v); });
          var cols = Object.keys(dcols).map(Number);
          if (!cols.length) continue;
          var pessoas = [], ult = '';
          for (var r = i + 1; r < rows.length; r++) {
            var row = rows[r] || [], ch = String(row[cC] == null ? '' : row[cC]).replace(/\.0$/, '').trim(), nm = String(row[cN] || '').replace(/\s+/g, ' ').trim();
            if (!/^\d+$/.test(ch) || !nm) continue;
            pessoas.push({ chapa: ch, nome: nm.toUpperCase(), funcao: String(row[cF] || '').replace(/\s+/g, ' ').trim(), mo: String(row[cM] || '').trim(), setor: String(row[cS] || '').trim(), row: row });
            cols.forEach(function (c) { if (row[c] != null && String(row[c]).trim() && dcols[c] > ult) ult = dcols[c]; });
          }
          if (!pessoas.length || !ult) continue;
          var de = addDays(ult, -13), dias = {};
          cols.forEach(function (c) { var d = dcols[c]; if (d < de || d > ult) return; var m = {}; pessoas.forEach(function (p) { var v = p.row[c]; if (v != null && String(v).trim()) m[p.chapa] = String(v).trim(); }); if (Object.keys(m).length) dias[d] = m; });
          pessoas.forEach(function (p) { delete p.row; });
          res = { data: ult, pessoas: pessoas, dias: dias, arquivo: file.name };
          return true;
        }
        return false;
      });
      if (!res) throw new Error('Não encontrei a tabela do efetivo (colunas CHAPA / NOME e as datas) neste arquivo.');
      out.innerHTML = '<p class="empty">Enviando ' + res.pessoas.length + ' pessoas (último dia preenchido: ' + br(res.data) + ')…</p>';
      return api('admin_efeImport', res, 180000).then(function (r) {
        var c = r.contagem || {}, ord = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
        out.innerHTML = '<div class="alert ok">✓ Efetivo de <b>' + br(r.data) + '</b> importado: ' + r.pessoas + ' pessoas.<br>' +
          '<b>' + r.novos.length + '</b> nova(s) em Sem equipe · status de ' + r.dias + ' dia(s) guardados.<br>' +
          '<span class="small">No dia: ' + ord.map(function (k) { return esc(k.toLowerCase()) + ' ' + c[k]; }).join(' · ') + '</span></div>' +
          (r.novos.length ? '<details class="small"><summary>Ver os novos (' + r.novos.length + ')</summary>' + r.novos.map(function (n) { return esc(n.chapa) + ' – ' + esc(n.nome) + ' <span class="muted">(' + esc(n.funcao) + ')</span>'; }).join('<br>') + '</details>' : '');
        var nd = (r.desligados || []).length, nf = (r.divergentes || []).length;
        if (nd || nf) out.innerHTML += '<div class="alert" style="margin-top:8px">Para decidir: ' + (nd ? '<b>' + nd + '</b> demitido(s)/transferido(s) ainda em equipe' : '') + (nd && nf ? ' e ' : '') + (nf ? '<b>' + nf + '</b> função(ões) diferente(s)' : '') + '.' + (podeAba('cadastro') ? ' <button class="btn sm" id="irefe" style="margin-top:6px">Abrir Cadastro base › Efetivo</button>' : ' Peça a quem tem acesso ao Cadastro base.') + '</div>';
        var ir = document.getElementById('irefe'); if (ir) ir.onclick = function () { A.cad = 'efe'; A.tab = 'cadastro'; render(); };
      });
    }).catch(function (e) { out.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  function divergUI(lista) {
    var el = document.getElementById('ffun'); if (!el) return;
    if (!lista || !lista.length) { el.innerHTML = ''; return; }
    var moTxt = function (a, b) { return a !== b && b ? ' <span class="muted">(MO: ' + esc(a || '–') + ' → ' + esc(b) + ')</span>' : ''; };
    el.innerHTML = '<div class="alert" style="margin-top:10px"><b>' + lista.length + ' função(ões) diferente(s) entre a planilha e o app.</b> Para cada pessoa escolha: <b>Manter a do app</b>, <b>Usar a da planilha</b> ou <b>Editar</b> e escrever a função do jeito que você quer.</div>' +
      lista.map(function (x, i) {
        return '<div style="border-bottom:1px solid #e5e8ee;padding:8px 0"><div class="small"><b>' + esc(x.nome) + '</b> · ' + esc(x.chapa) + ' <span class="muted">· equipe: ' + esc(x.enc) + '</span></div>' +
          '<div class="small" style="margin:4px 0">No app: <b>' + esc(x.app || '–') + '</b><br>Na planilha: <b style="color:#0b2a5b">' + esc(x.planilha || '–') + '</b>' + moTxt(x.moApp, x.moPla) + '</div>' +
          '<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-fm="' + i + '">Manter a do app</button><button class="btn sm" data-fp="' + i + '">Usar a da planilha</button><button class="btn sm ghost" data-fe="' + i + '">✏️ Editar</button></div>' +
          '<div class="row hidden" id="fed' + i + '" style="gap:6px;margin-top:6px"><input id="fei' + i + '" value="' + esc(x.planilha || x.app) + '" style="flex:1"><button class="btn sm" data-fs="' + i + '">Salvar</button></div></div>';
      }).join('') + (lista.length > 1 ? '<button class="btn sm" id="fpall" style="margin-top:8px">Usar a da planilha em todas</button>' : '');
    var go = function (itens) { busy('Salvando…'); api('admin_efeFuncao', { itens: itens }).then(function (r) { done('Feito ✓'); divergUI(r.divergentes); cadEfeRecarrega(); }).catch(function (e) { done('Erro: ' + e.message); }); };
    el.querySelectorAll('[data-fm]').forEach(function (b) { b.onclick = function () { go([{ chapa: lista[+b.dataset.fm].chapa, acao: 'manter' }]); }; });
    el.querySelectorAll('[data-fp]').forEach(function (b) { b.onclick = function () { go([{ chapa: lista[+b.dataset.fp].chapa, acao: 'planilha' }]); }; });
    el.querySelectorAll('[data-fe]').forEach(function (b) { b.onclick = function () { var r = document.getElementById('fed' + b.dataset.fe); r.classList.remove('hidden'); document.getElementById('fei' + b.dataset.fe).focus(); }; });
    el.querySelectorAll('[data-fs]').forEach(function (b) { b.onclick = function () { var v = document.getElementById('fei' + b.dataset.fs).value.trim(); if (!v) return done('Escreva a função'); go([{ chapa: lista[+b.dataset.fs].chapa, acao: 'editar', funcao: v }]); }; });
    var all = document.getElementById('fpall'); if (all) all.onclick = function () { if (confirm('Usar a função da planilha nas ' + lista.length + ' pessoas?')) go(lista.map(function (x) { return { chapa: x.chapa, acao: 'planilha' }; })); };
  }
  function efePend() {
    api('admin_efeInfo').then(function (r) {
      var out = document.getElementById('refe'); if (!out || out.innerHTML) return;
      if (r.ultima) out.innerHTML = '<p class="small muted">Último efetivo importado: <b>' + br(r.ultima) + '</b> (em ' + esc(String(r.importadoEm).slice(0, 16).split(' ').map(function (x, i) { return i ? x : br(x); }).join(' ')) + ').' +
        (r.desligados || r.divergentes ? ' Pendente em Cadastro base › Efetivo: ' + (r.desligados ? r.desligados + ' desligado(s)' : '') + (r.desligados && r.divergentes ? ' e ' : '') + (r.divergentes ? r.divergentes + ' função(ões)' : '') + '.' : '') + '</p>';
    }).catch(function () { });
  }
  function desligadosUI(lista) {
    var el = document.getElementById('pefe'); if (!el) return;
    if (!lista || !lista.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="alert" style="margin-top:10px"><b>' + lista.length + ' pessoa(s) desligada(s) na planilha que ainda estão no app.</b> Decida uma por uma: <b>Tirar da equipe</b> (sai do RDA e da hora extra; o histórico fica guardado) ou <b>Manter</b>.</div>' +
      lista.map(function (x, i) {
        return '<div class="row" style="justify-content:space-between;border-bottom:1px solid #e5e8ee;padding:6px 0;gap:8px"><div class="small"><b>' + esc(x.nome) + '</b><br>' + esc(x.chapa) + ' · ' + esc(x.funcao) + '<br><span style="color:#c62828"><b>' + esc(x.status) + '</b> em ' + br(x.data) + '</span> · equipe: ' + esc(x.enc) + '</div>' +
          '<div class="row" style="gap:6px;flex-shrink:0"><button class="btn sm" data-dl="' + i + '">Tirar da equipe</button><button class="btn sm ghost" data-dm="' + i + '">Manter</button></div></div>';
      }).join('') + (lista.length > 1 ? '<button class="btn sm" id="dlall" style="margin-top:8px">Tirar todos da equipe</button>' : '');
    var go = function (itens) { busy('Salvando…'); api('admin_efeDeslig', { itens: itens }).then(function (r) { done('Feito ✓'); desligadosUI(r.desligados); cadEfeRecarrega(); }).catch(function (e) { done('Erro: ' + e.message); }); };
    el.querySelectorAll('[data-dl]').forEach(function (b) { b.onclick = function () { var x = lista[+b.dataset.dl]; go([{ chapa: x.chapa, status: x.status, acao: 'tirar' }]); }; });
    el.querySelectorAll('[data-dm]').forEach(function (b) { b.onclick = function () { var x = lista[+b.dataset.dm]; go([{ chapa: x.chapa, status: x.status, acao: 'manter' }]); }; });
    var all = document.getElementById('dlall'); if (all) all.onclick = function () { if (confirm('Tirar as ' + lista.length + ' pessoas da equipe?')) go(lista.map(function (x) { return { chapa: x.chapa, status: x.status, acao: 'tirar' }; })); };
  }
  function importTags(files) {
    var out = document.getElementById('rtag'); out.innerHTML = '<p class="empty">Lendo arquivo(s)…</p>';
    var itens = [], semTag = [];
    var acha = function (hdr, nomes) { for (var i = 0; i < hdr.length; i++) for (var j = 0; j < nomes.length; j++) if (hdr[i] === nomes[j] || hdr[i].indexOf(nomes[j] + ' ') === 0 || hdr[i].indexOf(nomes[j] + '(') === 0) return i; return -1; };
    libsXlsx().then(function () {
      return files.reduce(function (c, file) {
        return c.then(function () {
          return window.readXlsx(file).then(function (book) {
            var achou = false;
            Object.keys(book).forEach(function (name) {
              var rows = book[name];
              for (var i = 0; i < Math.min(rows.length, 20); i++) {
                var hdr = (rows[i] || []).map(H), cT = acha(hdr, ['TAG', 'MARCA']);
                if (cT < 0) continue;
                var cD = acha(hdr, ['DESCRICAO', 'DESCRIÇÃO', 'PECA']), cTi = acha(hdr, ['TIPO']), cDo = acha(hdr, ['DOCUMENTO', 'DOCUMENTO ORIGEM', 'DOC', 'DIAGRAMA DE MONTAGEM', 'PROJETO']), cDi = acha(hdr, ['DISCIPLINA', 'DISC']), cA = acha(hdr, ['AREA']);
                var v = function (row, c) { return c < 0 || row[c] == null ? '' : String(row[c]).replace(/\s+/g, ' ').trim(); };
                for (var r = i + 1; r < rows.length; r++) {
                  var row = rows[r] || [], tag = v(row, cT);
                  if (!tag) continue;
                  itens.push([tag, v(row, cD), v(row, cTi), v(row, cDo), v(row, cDi), v(row, cA)]);
                }
                achou = true; break;
              }
            });
            if (!achou) semTag.push(file.name);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      if (!itens.length) throw new Error(semTag.length ? 'Não achei a coluna TAG em: ' + semTag.join(', ') : 'Nenhuma TAG encontrada.');
      out.innerHTML = '<p class="empty">Enviando ' + itens.length + ' linhas…</p>';
      return api('admin_addTags', { itens: itens }, 120000).then(function (r) {
        out.innerHTML = '<div class="alert ok">✓ <b>' + r.novas + ' TAG(s) nova(s)</b> incluída(s). ' + (r.existentes ? r.existentes + ' já existiam e não foram alteradas. ' : '') + (r.repetidas ? r.repetidas + ' repetida(s) na planilha. ' : '') + 'Total no app: ' + r.total + '. Os celulares recebem na próxima sincronização.</div>' +
          (semTag.length ? '<div class="alert">Arquivo(s) sem coluna TAG (ignorados): ' + esc(semTag.join(', ')) + '</div>' : '');
      });
    }).catch(function (e) { out.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
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
      return api('admin_setEquip', { itens: itens }).then(function (r) { out.innerHTML = '<div class="alert ok">✓ ' + r.itens + ' equipamentos atualizados' + (nDesm ? ' (' + nDesm + ' desmobilizado(s) na aba ANALÍTICA ficaram de fora)' : '') + (r.manuais ? '. ' + r.manuais + ' cadastrado(s)/editado(s) no Cadastro base foram mantidos' : '') + '. Os celulares recebem a lista na próxima sincronização.</div>'; });
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
  // lista nominal de hora extra em Excel (uma linha por pessoa)
  function heXlsx(pedidos, arquivo, aba) {
    busy('Montando planilha…');
    loadScript('jszip.min.js').then(function () { return loadScript('xlsxw.js'); }).then(function () {
      var ps = pedidos.slice().sort(function (a, b) { return (a.date + (a.disciplina || '') + a.enc).localeCompare(b.date + (b.disciplina || '') + b.enc); });
      var rows = [['ITEM', 'DATA', 'TIPO', 'CHAPA', 'NOME', 'FUNÇÃO', 'TIPO MO', 'ENCARREGADO (LÍDER)', 'DISCIPLINA', 'INÍCIO', 'TÉRMINO', 'ÁREA', 'ATIVIDADE', 'EQUIPE', 'STATUS', 'PEDIDO NO PRAZO', 'OBS. DA ADMINISTRAÇÃO', 'ID DO PEDIDO']], i = 0, res = {};
      ps.forEach(function (h) {
        var daEquipe = {}; (h.equipe || []).forEach(function (x) { daEquipe[x.chapa] = 1; });
        (h.pessoas || []).forEach(function (x) {
          i++; res[h.status || 'PENDENTE'] = (res[h.status || 'PENDENTE'] || 0) + 1;
          rows.push([i, br(h.date), h.tipo || '', x.chapa, x.nome, x.funcao || '', x.mo || '', h.curto || h.enc, h.disciplina || '', x.ini || h.ini || '', x.fim || h.fim || '', h.area || '', h.motivo || '',
            (h.equipe && h.equipe.length && !daEquipe[x.chapa]) ? 'Adicionado (fora da equipe)' : 'Própria equipe', h.status || 'PENDENTE', h.noPrazo === false ? 'NÃO' : 'SIM', h.obsAdmin || '', h.id || '']);
        });
      });
      var resumo = [['STATUS', 'PESSOAS']].concat(Object.keys(res).map(function (k) { return [k, res[k]]; })).concat([['TOTAL', i]]);
      return window.makeXlsx([{ name: aba, rows: rows }, { name: 'Resumo', rows: resumo }]).then(function (blob) { download(blob, arquivo); done('Planilha pronta ✓ (' + i + ' pessoas)'); });
    }).catch(function (e) { done('Erro: ' + e.message); });
  }

  // a administração corrige um pedido de hora extra já enviado; o encarregado recebe a notificação com o que mudou
  function heEditar(x) {
    var pes = {}, ordem = [];
    var add = function (p) { var k = String(p.chapa); if (!pes[k]) { pes[k] = { chapa: p.chapa, nome: p.nome, funcao: p.funcao || '', mo: p.mo || '' }; ordem.push(k); } };
    (x.pessoas || []).forEach(add); (x.equipe || []).forEach(add);
    var sel = {}; (x.pessoas || []).forEach(function (p) { sel[String(p.chapa)] = true; });
    var b = sheetUI('<h3>✏️ Corrigir hora extra</h3><p class="small muted">' + esc(x.enc) + ' · pedido em ' + esc(String(x.pedidoEm || '').slice(0, 16)) + '. O encarregado recebe uma notificação com o que mudou. A situação (aprovado/pendente) não muda.</p>' +
      '<div class="grid2"><div><label class="f">Data da atividade</label><input type="date" id="ed_d" value="' + esc(x.date) + '"></div><div><label class="f">Tipo</label><select id="ed_t"><option value="EXTENSÃO"' + (x.tipo !== 'ESCALA' ? ' selected' : '') + '>Extensão de horário</option><option value="ESCALA"' + (x.tipo === 'ESCALA' ? ' selected' : '') + '>Escala (dia não útil)</option></select></div></div>' +
      '<div class="grid2"><div><label class="f">Início</label><input type="time" id="ed_i" value="' + esc(x.ini || '') + '"></div><div><label class="f">Término</label><input type="time" id="ed_f" value="' + esc(x.fim || '') + '"></div></div>' +
      '<div class="grid2"><div><label class="f">Turno</label><select id="ed_tu"><option' + (x.turno !== 'NOTURNO' ? ' selected' : '') + '>DIURNO</option><option' + (x.turno === 'NOTURNO' ? ' selected' : '') + '>NOTURNO</option></select></div><div><label class="f">Área</label><input id="ed_a" value="' + esc(x.area || '') + '"></div></div>' +
      '<label class="f">Atividade</label><textarea id="ed_m" rows="3">' + esc(x.motivo || '') + '</textarea>' +
      '<label class="f">Pessoas (<span id="ed_n"></span>)</label><div id="ed_p" style="max-height:34vh;overflow:auto"></div>' +
      '<input id="ed_q" placeholder="＋ Adicionar outra pessoa (nome ou chapa)" style="margin-top:6px"><div id="ed_r"></div>' +
      '<label class="f">Recado para o encarregado (opcional)</label><input id="ed_msg" placeholder="Ex.: estava com a data de hoje, era para amanhã">' +
      '<button class="btn block" id="ed_ok" style="margin-top:12px">Salvar correção e avisar o encarregado</button><button class="btn block ghost" id="ed_no" style="margin-top:8px">Cancelar</button>');
    var desenha = function () {
      b.querySelector('#ed_p').innerHTML = ordem.map(function (k) { var p = pes[k]; return '<label class="person" style="cursor:pointer;padding:5px 0"><input type="checkbox" data-pc="' + esc(k) + '"' + (sel[k] ? ' checked' : '') + ' style="width:24px;height:24px;min-height:0;flex:0 0 24px"><div class="pinfo"><b style="font-size:14px">' + esc(p.nome) + '</b><small>' + esc(k + ' · ' + p.funcao) + '</small></div></label>'; }).join('');
      b.querySelector('#ed_n').textContent = Object.keys(sel).filter(function (k) { return sel[k]; }).length + ' marcada(s)';
      [].forEach.call(b.querySelectorAll('[data-pc]'), function (c) { c.onchange = function () { sel[c.dataset.pc] = c.checked; b.querySelector('#ed_n').textContent = Object.keys(sel).filter(function (k) { return sel[k]; }).length + ' marcada(s)'; }; });
    };
    desenha();
    var efe = null;
    b.querySelector('#ed_q').oninput = function () {
      var q = norm(this.value), r = b.querySelector('#ed_r');
      if (q.length < 2) { r.innerHTML = ''; return; }
      var mostra = function () {
        r.innerHTML = efe.filter(function (p) { return p.enc !== 'DESLIGADO' && (norm(p.nome).indexOf(q) >= 0 || String(p.chapa).indexOf(q) === 0); }).slice(0, 8).map(function (p) { return '<div class="rdaline" data-ad="' + esc(p.chapa) + '" style="cursor:pointer"><div class="tx"><b>' + esc(p.nome) + '</b><small>' + esc(p.chapa + ' · ' + (p.funcao || '') + ' · ' + (p.enc || '')) + '</small></div><span class="link">＋</span></div>'; }).join('') || '<p class="small muted">Ninguém encontrado</p>';
        [].forEach.call(r.querySelectorAll('[data-ad]'), function (d) { d.onclick = function () { var p = efe.filter(function (y) { return String(y.chapa) === d.dataset.ad; })[0]; add(p); sel[String(p.chapa)] = true; b.querySelector('#ed_q').value = ''; r.innerHTML = ''; desenha(); }; });
      };
      if (efe) return mostra();
      r.innerHTML = '<p class="small muted">Carregando efetivo…</p>';
      api('admin_quadro', {}, 120000).then(function (j) { efe = j.pessoas; mostra(); }).catch(function (e) { r.innerHTML = '<p class="small muted">Erro: ' + esc(e.message) + '</p>'; });
    };
    b.querySelector('#ed_no').onclick = closeUI;
    b.querySelector('#ed_ok').onclick = function () {
      var n = { date: b.querySelector('#ed_d').value, tipo: b.querySelector('#ed_t').value, ini: b.querySelector('#ed_i').value, fim: b.querySelector('#ed_f').value, turno: b.querySelector('#ed_tu').value,
        area: b.querySelector('#ed_a').value.trim(), motivo: b.querySelector('#ed_m').value.trim(), pessoas: ordem.filter(function (k) { return sel[k]; }).map(function (k) { return pes[k]; }) };
      if (!n.date) return done('Informe a data');
      if (!n.ini || !n.fim || n.fim <= n.ini) return done('Horário inválido');
      if (!n.pessoas.length) return done('Marque pelo menos uma pessoa');
      closeUI(); busy('Salvando correção…');
      api('admin_heEdit', { id: x.id, he: n, msg: b.querySelector('#ed_msg').value.trim() }).then(function (r) {
        done(r.semMudanca ? 'Nada mudou' : 'Corrigido ✓ O encarregado foi avisado.'); A.heDate = n.date; horasExtras();
      }).catch(function (e) { done('Erro: ' + e.message); });
    };
  }

  // quadro de escalas e extensões recebidas: ✓ quando chegou (pelo app ou em papel), em branco quando não veio. Não existe "pendente".
  function heQuadro() {
    var el = document.getElementById('adm');
    A.heQDate = A.heQDate || today(); A.heQIni = A.heQIni || addDays(A.heQDate, -6);
    el.innerHTML = '<div class="card">' + periodoUI(A.heQIni, A.heQDate) +
      '<div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sm ghost" id="qvolta">‹ Pedidos do dia</button><button class="btn sm" id="qimg2">🖼 Imagem do quadro</button></div></div><div id="qbox"><p class="empty">Carregando…</p></div>';
    periodoBind(function () { return [A.heQIni, A.heQDate]; }, function (de, ate) { A.heQIni = de; A.heQDate = ate; }, heQuadro);
    document.getElementById('qvolta').onclick = function () { A.heView = ''; horasExtras(); };
    document.getElementById('qimg2').onclick = function () { done('Aguarde o quadro carregar'); };
    var days = diasEntre(A.heQIni, A.heQDate);
    api('admin_heList', { de: days[0], ate: days[days.length - 1] }, 120000).then(function (j) {
      var encs = (j.encs || []).slice().sort(function (a, b) { return (a.disciplina + a.nome).localeCompare(b.disciplina + b.nome); });
      var cel = function (e, d) {
        var ped = j.pedidos.filter(function (h) { return h.date === d && resolve(h.enc) === e.nome; });
        var pap = (j.papel || []).filter(function (x) { return x.date === d && x.enc === e.nome; });
        return { ped: ped, pap: pap, ok: ped.length + pap.length > 0 };
      };
      var resolve = function (n) { return n; };
      var tp = function (t) { return t === 'ESCALA' ? 'ESC' : 'EXT'; };
      var tot = 0;
      var h = '<div class="card"><div class="card-h"><h2>Escalas e extensões entregues</h2></div><div class="tablewrap"><table class="ctl"><thead><tr><th>Encarregado</th><th>Entregues</th>' + days.map(function (d) { return '<th>' + DIAS[dow(d)] + '<br>' + br(d).slice(0, 5) + '</th>'; }).join('') + '</tr></thead><tbody>';
      encs.forEach(function (e) {
        var n = 0; days.forEach(function (d) { if (cel(e, d).ok) n++; }); tot += n;
        h += '<tr><td class="nm">' + esc(e.curto || e.nome) + '<br><small class="muted">' + esc(e.disciplina) + '</small></td><td><b>' + n + '</b></td>' + days.map(function (d) {
          var c = cel(e, d), k = esc(e.nome) + '|' + d;
          if (!c.ok) return '<td data-hq="' + k + '"></td>';
          return '<td class="ok" data-hq="' + k + '" title="Entregue">✓</td>';
        }).join('') + '</tr>';
      });
      h += '</tbody></table></div><p class="small muted">✓ entregue · em branco = não entregou. Toque no dia para ver o pedido ou, para quem entrega em papel, marcar como entregue.</p></div>';
      document.getElementById('qbox').innerHTML = '<div class="kpis"><div><b>' + tot + '</b><small>entregues no período</small></div><div><b>' + encs.length + '</b><small>encarregados</small></div></div>' + h;
      [].forEach.call(document.querySelectorAll('[data-hq]'), function (td) {
        td.onclick = function () {
          var k = td.dataset.hq.split('|'), e = encs.filter(function (x) { return x.nome === k[0]; })[0], d = k[1], c = cel(e, d);
          var b = sheetUI('<h3>' + esc(e.curto || e.nome) + ' · ' + br(d) + '</h3>' +
            (c.ped.length ? c.ped.map(function (x) { return '<div class="rdaline"><div class="tx"><b>' + (x.tipo === 'ESCALA' ? 'Escala' : 'Extensão') + ' · ' + esc(x.ini) + ' às ' + esc(x.fim) + '</b><small>' + (x.pessoas || []).length + ' pessoa(s) · ' + esc(String(x.status || '').toLowerCase()) + ' · pelo app</small></div></div>'; }).join('') : '') +
            c.pap.map(function (x) { return '<div class="rdaline"><div class="tx"><b>✓ Entregue</b><small>marcado em ' + esc(x.em) + '</small></div><button class="btn sm danger" data-rm="' + esc(x.tipo) + '">Desmarcar</button></div>'; }).join('') +
            (c.ped.length ? '<button class="btn block ghost" id="hqver" style="margin-top:8px">Abrir os pedidos deste dia</button>' : '') +
            (e.papel && !c.pap.length ? '<button class="btn block ok" data-pp2="EXTENSÃO" style="margin-top:10px">✓ Marcar como entregue</button>' : (c.ok ? '' : '<p class="empty">Não entregou para este dia.</p>')) +
            '<button class="btn block ghost" style="margin-top:10px" id="hqno">Fechar</button>');
          b.querySelector('#hqno').onclick = closeUI;
          var ver = b.querySelector('#hqver'); if (ver) ver.onclick = function () { closeUI(); A.heView = ''; A.heDate = d; horasExtras(); };
          var salva = function (tipo, rm) { busy('Salvando…'); api('admin_hePapel', { enc: e.nome, date: d, tipo: tipo, remove: rm }).then(function () { closeUI(); done(rm ? 'Desmarcado' : 'Recebido ✓'); heQuadro(); }).catch(function (er) { done('Erro: ' + er.message); }); };
          [].forEach.call(b.querySelectorAll('[data-pp2]'), function (x) { x.onclick = function () { salva(x.dataset.pp2, false); }; });
          [].forEach.call(b.querySelectorAll('[data-rm]'), function (x) { x.onclick = function () { salva(x.dataset.rm, true); }; });
        };
      });
      document.getElementById('qimg2').onclick = function () {
        desenhaQuadro({
          titulo: 'Escalas e extensões entregues – ' + (days.length === 1 ? DIAS_EXT[dow(days[0])] + ', ' + br(days[0]) : br(days[0]).slice(0, 5) + ' a ' + br(days[days.length - 1])),
          resumo: 'Entregues no período: ' + tot, col2: 'Entregues', days: days,
          linhas: encs.map(function (e) {
            var n = 0, cs = days.map(function (d) {
              var c = cel(e, d); if (c.ok) n++;
              if (!c.ok) return { t: '', bg: '#fff', fg: '#202124' };
              return { t: days.length === 1 ? '✓ Entregue' : '✓', bg: '#e6f4ea', fg: '#1e8e3e', bold: true };
            });
            return { nome: e.curto || e.nome, tot: String(n), totCor: n ? '#1e8e3e' : '#80868b', cells: cs };
          }),
          rodape: [], legenda: ['✓ entregue · em branco = não entregou'],
          arquivo: 'Escalas e extensoes ' + (days.length === 1 ? br(days[0]).replace(/\//g, '-') : br(days[0]).slice(0, 5).replace('/', '-') + ' a ' + br(days[days.length - 1]).replace(/\//g, '-')) + '.png'
        });
      };
    }).catch(function (e) { document.getElementById('qbox').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; });
  }
  // desenha um quadro (tabela encarregado × dias) numa imagem PNG para compartilhar
  function desenhaQuadro(o) {
    var S2 = 2, nmW = 250, enW = 100, one = o.days.length === 1, dW = one ? 300 : 70, rH = 40, top = 118, W = nmW + enW + dW * o.days.length + 40;
    var H = top + 34 + o.linhas.length * rH + 26 + o.rodape.length * 22 + o.legenda.length * 18 + 40;
    var cv = document.createElement('canvas'); cv.width = W * S2; cv.height = H * S2; var g = cv.getContext('2d'); g.scale(S2, S2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#0b2a5b'; g.fillRect(0, 0, W, 64);
    g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = 'bold 21px Arial'; g.fillText(o.titulo, 20, 25);
    g.font = '13px Arial'; g.fillText('PABH 059 25 · Projeto Almas – Britagem · gerado em ' + br(today()) + ' ' + new Date().toTimeString().slice(0, 5), 20, 48);
    g.fillStyle = '#202124'; g.font = 'bold 15px Arial'; g.fillText(o.resumo, 20, 90);
    var x0 = 20, y = top;
    var cell = function (x, y2, w, txt, bg, fg, bold, al) {
      g.fillStyle = bg; g.fillRect(x, y2, w, rH); g.strokeStyle = '#dadce0'; g.lineWidth = 1; g.strokeRect(x + .5, y2 + .5, w, rH);
      g.fillStyle = fg; g.font = (bold ? 'bold ' : '') + (txt.length > 9 && !one && al !== 'left' ? '11px' : '14px') + ' Arial'; g.textAlign = al || 'center'; g.fillText(txt, al === 'left' ? x + 10 : x + w / 2, y2 + rH / 2, w - 8); g.textAlign = 'left';
    };
    cell(x0, y, nmW, 'Encarregado', '#eef1f6', '#0b2a5b', true, 'left'); cell(x0 + nmW, y, enW, o.col2, '#eef1f6', '#0b2a5b', true);
    o.days.forEach(function (d, i) { cell(x0 + nmW + enW + i * dW, y, dW, (one ? DIAS[dow(d)] + ' ' : '') + br(d).slice(0, 5), '#eef1f6', '#0b2a5b', true); });
    y += rH;
    o.linhas.forEach(function (l) {
      cell(x0, y, nmW, l.nome, '#fff', '#202124', true, 'left'); cell(x0 + nmW, y, enW, l.tot, '#fff', l.totCor || '#202124', true);
      l.cells.forEach(function (c, i) { cell(x0 + nmW + enW + i * dW, y, dW, c.t, c.bg, c.fg, c.bold); });
      y += rH;
    });
    y += 26; g.font = '15px Arial'; g.fillStyle = '#202124';
    o.rodape.forEach(function (l) { g.fillText(l, 20, y); y += 22; });
    g.font = '12px Arial'; g.fillStyle = '#5f6368';
    o.legenda.forEach(function (l) { g.fillText(l, 20, y); y += 18; });
    cv.toBlob(function (blob) {
      var f = null; try { f = new File([blob], o.arquivo, { type: 'image/png' }); } catch (e) { }
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: o.arquivo }).catch(function () { download(blob, o.arquivo); });
      else download(blob, o.arquivo);
      done('Imagem pronta ✓');
    }, 'image/png');
  }

  function horasExtras() {
    var el = document.getElementById('adm');
    A.heDate = A.heDate || addDays(today(), 1);
    if (A.heView === 'quadro') return heQuadro();
    el.innerHTML = '<div class="card"><div class="row" style="align-items:end"><div><label class="f" style="margin-top:0">Dia da hora extra</label><input type="date" id="hd" value="' + A.heDate + '"></div><button class="btn" id="hdref" style="flex:0 0 auto">Atualizar</button></div><button class="btn sm ghost" id="hequad" style="margin-top:10px">🗓 Quadro de escalas e extensões entregues</button><div id="hepend"></div></div><div id="helst"><p class="empty">Carregando…</p></div><div id="hecfg"></div>';
    document.getElementById('hd').onchange = function () { A.heDate = this.value; horasExtras(); };
    document.getElementById('hdref').onclick = horasExtras;
    document.getElementById('hequad').onclick = function () { A.heView = 'quadro'; horasExtras(); };
    api('admin_heList', { de: addDays(today(), -15), ate: addDays(today(), 30) }).then(function (j) {
      var all = j.pedidos, dia = all.filter(function (h) { return h.date === A.heDate; }).sort(function (a, b) { return (a.disciplina + a.enc).localeCompare(b.disciplina + b.enc); });
      var pend = all.filter(function (h) { return h.status === 'PENDENTE' && h.date !== A.heDate; });
      var dias = {}; pend.forEach(function (h) { dias[h.date] = (dias[h.date] || 0) + 1; });
      document.getElementById('hepend').innerHTML = Object.keys(dias).length ? '<div class="alert" style="margin:12px 0 0">Aguardando sua aprovação em outros dias: ' + Object.keys(dias).sort().map(function (d) { return '<button class="link" data-gd="' + d + '">' + br(d).slice(0, 5) + ' (' + dias[d] + ')</button>'; }).join(' · ') + '</div>' : '';
      [].forEach.call(document.querySelectorAll('[data-gd]'), function (b) { b.onclick = function () { A.heDate = b.dataset.gd; horasExtras(); }; });
      var nPes = dia.reduce(function (a, h) { return a + (h.status !== 'REPROVADO' ? (h.pessoas || []).length : 0); }, 0);
      var h = '<div class="kpis"><div><b>' + dia.length + '</b><small>pedidos</small></div><div><b>' + dia.filter(function (x) { return x.status === 'PENDENTE'; }).length + '</b><small>a aprovar</small></div><div><b>' + nPes + '</b><small>pessoas</small></div></div>';
      h += '<div class="card"><div class="card-h"><h2>' + DIAS_EXT[dow(A.heDate)] + ', ' + br(A.heDate) + '</h2></div>' +
        '<div class="row" style="flex-wrap:wrap;margin-bottom:8px"><button class="btn sm ok" id="apall">✓ Aprovar todos pendentes</button><button class="btn sm" id="pdfperm">📄 Permissões do dia (extensão e escala)</button><button class="btn sm ghost" id="pdfesc">📄 Lista nominal do dia</button><button class="btn sm ghost" id="xlsesc">📊 Lista nominal do dia (Excel)</button><button class="btn sm ghost" id="xlsper">📊 Lista nominal por período (Excel)</button></div>';
      h += dia.map(function (x) {
        var stc = x.status === 'APROVADO' ? 'background:#e8f5ec;color:#11602a' : x.status === 'REPROVADO' ? 'background:#fde7e5;color:#d93025' : 'background:#eef1f6;color:#0b2a5b';
        return '<div class="ativ"><div class="ah"><b>' + esc(x.enc) + '</b><span class="tag" style="' + stc + '">' + esc(x.status) + '</span></div>' +
          '<div class="small">' + esc(x.tipo === 'ESCALA' ? 'Escala (dia não útil)' : 'Extensão de horário') + ' · <b>' + esc(x.ini) + ' às ' + esc(x.fim) + '</b> · ' + (x.pessoas || []).length + ' pessoa(s)' + (x.area ? ' · ' + esc(x.area) : '') + '</div>' +
          '<div class="small muted">Pedido em ' + esc(String(x.pedidoEm || '').slice(0, 16)) + ' · ' + (x.noPrazo ? 'no prazo' : '<b style="color:var(--bad)">FORA DO PRAZO</b>') + '</div>' +
          '<div class="small" style="margin:6px 0">' + esc(x.motivo || '') + '</div><details><summary class="link">Ver pessoas</summary><div class="small">' + (x.pessoas || []).map(function (p) { return esc(p.chapa + ' – ' + p.nome + ' (' + (p.funcao || '') + ')'); }).join('<br>') + '</div></details>' +
          (x.obsAdmin ? '<div class="small muted">Obs.: ' + esc(x.obsAdmin) + '</div>' : '') +
          '<div class="row" style="margin-top:8px"><button class="btn sm ok" data-ap="' + esc(x.id) + '">Aprovar</button><button class="btn sm danger" data-rp="' + esc(x.id) + '">Reprovar</button><button class="btn sm ghost" data-pp="' + esc(x.id) + '">PDF</button><button class="btn sm ghost" data-ed="' + esc(x.id) + '">✏️ Editar</button></div>' +
          (x.editadoEm ? '<div class="small muted" style="margin-top:4px">✏️ Corrigido por ' + esc(x.editadoPor || 'administração') + ' em ' + esc(br(String(x.editadoEm).slice(0, 10)).slice(0, 5) + ' ' + String(x.editadoEm).slice(11, 16)) + '</div>' : '') + '</div>';
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
      [].forEach.call(document.querySelectorAll('#helst [data-ed]'), function (b) { b.onclick = function () { heEditar(dia.filter(function (y) { return y.id === b.dataset.ed; })[0]); }; });
      [].forEach.call(document.querySelectorAll('[data-pp]'), function (b) { b.onclick = function () { var x = dia.filter(function (y) { return y.id === b.dataset.pp; })[0]; permPdf([x], A.heDate + ' - Permissão HE - ' + (x.curto || x.enc) + '.pdf'); }; });
      document.getElementById('pdfperm').onclick = function () { permPdf(dia.filter(function (x) { return x.status !== 'REPROVADO'; }), A.heDate + ' - Permissões de hora extra.pdf'); };
      document.getElementById('xlsesc').onclick = function () {
        var ap = dia.filter(function (x) { return x.status === 'APROVADO'; });
        if (!ap.length) return done('Nenhum pedido aprovado neste dia');
        heXlsx(ap, A.heDate + ' - Lista nominal de hora extra.xlsx', 'Lista nominal ' + br(A.heDate).slice(0, 5).replace('/', '-'));
      };
      document.getElementById('xlsper').onclick = function () {
        var b = sheetUI('<h3>📊 Lista nominal por período</h3><p class="small muted">Traz todos os pedidos (aprovados, pendentes e reprovados) com a coluna Status.</p><div class="grid2"><div><label class="f">De</label><input type="date" id="pde" value="' + addDays(A.heDate, -6) + '"></div><div><label class="f">Até</label><input type="date" id="pate" value="' + A.heDate + '"></div></div><button class="btn block" id="pok" style="margin-top:12px">Baixar planilha</button><button class="btn block ghost" id="pno" style="margin-top:8px">Cancelar</button>');
        b.querySelector('#pno').onclick = closeUI;
        b.querySelector('#pok').onclick = function () {
          var de = b.querySelector('#pde').value, ate = b.querySelector('#pate').value;
          if (!de || !ate || ate < de) return done('Confira as datas');
          closeUI(); busy('Buscando pedidos…');
          api('admin_heList', { de: de, ate: ate }, 120000).then(function (r) {
            if (!r.pedidos.length) return done('Nenhum pedido no período');
            heXlsx(r.pedidos, 'Lista nominal de hora extra ' + de + ' a ' + ate + '.xlsx', 'Lista nominal');
          }).catch(function (e) { done('Erro: ' + e.message); });
        };
      };
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
  var CADS = [['enc', '👷 Encarregados'], ['efe', '👥 Efetivo'], ['eqp', '🚜 Equipamentos'], ['area', '📍 Áreas']];
  function cadastro() {
    var el = document.getElementById('adm');
    A.cad = A.cad || 'enc';
    el.innerHTML = '<div class="chips" style="margin:0 0 10px">' + CADS.map(function (c) { return '<button data-cad="' + c[0] + '" class="' + (A.cad === c[0] ? 'sel' : '') + '">' + c[1] + '</button>'; }).join('') + '</div><div id="cadbox"><p class="empty">Carregando…</p></div>';
    [].forEach.call(el.querySelectorAll('[data-cad]'), function (b) { b.onclick = function () { A.cad = b.dataset.cad; cadastro(); }; });
    if (A.cad === 'area') cadAreas(); else if (A.cad === 'efe') cadEfe(); else if (A.cad === 'eqp') cadEqp(); else cadEnc();
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
        (e.modelo === 'MURO' ? '<span class="tag">Muro</span>' : '') + (e.armacao ? '<span class="tag" style="background:#e0f2f1;color:#00695c">🔩 Armação</span>' : '') + (e.ativo ? (e.cobra ? '<span class="tag" style="background:#e6f4ea;color:#1e8e3e">Cobra RDA</span>' : e.papel ? '<span class="tag" style="background:#fff4e5;color:#a34600">📝 RDA em papel</span>' : '<span class="tag">Não cobra</span>') : '') + '<span class="muted">›</span></div>';
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
    var novo = !e; e = e || { nome: '', curto: '', disciplina: '', supervisor: '', modelo: 'PADRAO', ativo: true, cobra: true, armacao: false, equipe: 0 };
    var b = sheetUI('<h3>' + (novo ? 'Novo encarregado' : 'Editar encarregado') + '</h3>' +
      '<label class="f" style="margin-top:0">Nome completo</label><input id="cn" value="' + esc(e.nome) + '" autocapitalize="characters">' +
      '<label class="f">Nome curto</label><input id="cc" value="' + esc(e.curto) + '" autocapitalize="characters" placeholder="Ex.: ' + esc((e.nome || 'MARCIO JOEL').split(' ').slice(0, 2).join(' ')) + '"><p class="small muted" style="margin:4px 0 0">Vai no número do RDA: RDA-' + esc(e.cod || 'CIV') + '-<b>NOME CURTO</b>-0001' + (novo ? '' : '. Mudar o nome curto muda o número dos próximos RDAs.') + '</p>' +
      '<label class="f">Disciplina</label><input id="cd" list="cdl" value="' + esc(e.disciplina) + '" autocapitalize="characters" placeholder="Escolha ou digite"><datalist id="cdl">' + j.disciplinas.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f">Supervisor</label><input id="cs" list="csl" value="' + esc(e.supervisor) + '" autocapitalize="characters" placeholder="Escolha ou digite"><datalist id="csl">' + j.supervisores.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f">Modelo de RDA</label><select id="cm"><option value="PADRAO"' + (e.modelo !== 'MURO' ? ' selected' : '') + '>Padrão</option><option value="MURO"' + (e.modelo === 'MURO' ? ' selected' : '') + '>Muro (fiadas)</option></select>' +
      '<label class="f">Como faz o RDA</label><select id="cb"><option value="APP"' + (e.cobra ? ' selected' : '') + '>📱 Pelo app (cobra RDA e recebe alertas)</option><option value="PAPEL"' + (e.papel ? ' selected' : '') + '>📝 Em papel / manual (controle de entrega, sem alertas no app)</option><option value="NAO"' + (!e.cobra && !e.papel ? ' selected' : '') + '>Não faz RDA</option></select>' +
      '<label class="person" style="cursor:pointer;margin-top:10px"><input type="checkbox" id="carm"' + (e.armacao ? ' checked' : '') + ' style="width:28px;height:28px;min-height:0;flex:0 0 28px"><div class="pinfo"><b>🔩 Relatório de montagem de armação</b><small>Mostra o botão MONTAGEM DE ARMAÇÃO no RDA deste encarregado</small></div></label>' +
      '<div class="row" style="margin-top:14px">' + (novo ? '' : '<button class="btn ' + (e.ativo ? 'danger' : 'ghost') + '" id="cat">' + (e.ativo ? 'Desativar' : 'Reativar') + '</button>') + '<button class="btn" id="cok">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var val = function () {
      return { nome: b.querySelector('#cn').value, curto: b.querySelector('#cc').value, disciplina: b.querySelector('#cd').value, supervisor: b.querySelector('#cs').value, modelo: b.querySelector('#cm').value, cobra: b.querySelector('#cb').value === 'APP', papel: b.querySelector('#cb').value === 'PAPEL', armacao: b.querySelector('#carm').checked, ativo: e.ativo };
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
  /* ----- efetivo ----- */
  function cadEfeRecarrega() { if (document.getElementById('efelist')) api('admin_efeList').then(function (r) { A.efeCad = r; cadEfeLista(); }).catch(function () { }); }
  function cadEfe() {
    var box = document.getElementById('cadbox');
    Promise.all([api('admin_efeList'), api('admin_efePend')]).then(function (x) {
      A.efeCad = x[0];
      box.innerHTML = '<div id="pefe"></div><div id="ffun"></div><div id="efelist"></div>';
      desligadosUI(x[1].desligados); divergUI(x[1].divergentes); cadEfeLista();
    }).catch(cadErro);
  }
  function cadEfeLista() {
    var j = A.efeCad, el = document.getElementById('efelist'); if (!el || !j) return;
    var f = A.efeBusca || '';
    var ok = function (p) { return !f || U().norm(p.nome + ' ' + p.chapa + ' ' + p.funcao + ' ' + p.enc).indexOf(U().norm(f)) >= 0; };
    var lista = j.pessoas.filter(ok), grupos = {};
    lista.forEach(function (p) { (grupos[p.enc] = grupos[p.enc] || []).push(p); });
    var ordem = Object.keys(grupos).sort(function (a, b) { var r = function (k) { return k === 'SEM EQUIPE' ? 0 : k === 'DESLIGADO' ? 2 : 1; }; return r(a) - r(b) || a.localeCompare(b); });
    var ativos = j.pessoas.filter(function (p) { return p.enc !== 'DESLIGADO'; }).length;
    var h = '<div class="card"><div class="row" style="align-items:center"><input id="pbusca" placeholder="🔍 Procurar nome, chapa, função ou equipe" value="' + esc(f) + '"><button class="btn" id="pnovo" style="flex:0 0 auto">＋ Nova</button></div>' +
      '<p class="small muted" style="margin-bottom:0">' + ativos + ' pessoas no efetivo do app. Toque num nome para editar a função, o tipo de MO ou a equipe, ou para desligar. Mudanças chegam no celular na próxima sincronização.</p></div>';
    ordem.forEach(function (k) {
      var g = grupos[k].sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      h += '<details class="card"' + (f || k === 'SEM EQUIPE' ? ' open' : '') + '><summary style="cursor:pointer"><b>' + esc(k === 'DESLIGADO' ? 'Desligados (fora do app)' : k) + '</b> <span class="muted small">(' + g.length + ')</span></summary>' +
        g.map(function (p) { return '<div class="rdaline" data-pc="' + esc(p.chapa) + '" style="cursor:pointer"><div class="tx"><b>' + esc(p.nome) + '</b><small>' + esc(p.chapa) + ' · ' + esc(p.funcao || '–') + (p.mo ? ' · ' + esc(p.mo) : '') + '</small></div><span class="muted">›</span></div>'; }).join('') + '</details>';
    });
    if (!lista.length) h += '<p class="empty">Ninguém encontrado</p>';
    el.innerHTML = h;
    var pb = document.getElementById('pbusca');
    pb.oninput = function () { A.efeBusca = pb.value; var pos = pb.selectionStart; cadEfeLista(); var n = document.getElementById('pbusca'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('pnovo').onclick = function () { efeForm(null); };
    [].forEach.call(el.querySelectorAll('[data-pc]'), function (r) { r.onclick = function () { efeForm(j.pessoas.filter(function (p) { return p.chapa === r.dataset.pc; })[0]); }; });
  }
  function efeForm(p) {
    var j = A.efeCad, nova = !p; p = p || { chapa: '', nome: '', funcao: '', disciplina: '', enc: 'SEM EQUIPE', mo: 'MOD' };
    var deslig = p.enc === 'DESLIGADO';
    var encs = ['SEM EQUIPE'].concat(j.encarregados); if (!deslig && encs.indexOf(p.enc) < 0) encs.push(p.enc);
    var b = sheetUI('<h3>' + (nova ? 'Nova pessoa no efetivo' : 'Editar pessoa') + '</h3>' +
      '<label class="f" style="margin-top:0">Chapa</label><input id="pc" value="' + esc(p.chapa) + '" inputmode="numeric"' + (nova ? '' : ' disabled') + '>' +
      '<label class="f">Nome</label><input id="pn" value="' + esc(p.nome) + '" autocapitalize="characters">' +
      '<label class="f">Função</label><input id="pf" value="' + esc(p.funcao) + '" autocapitalize="characters">' +
      '<label class="f">Tipo de MO</label><select id="pm"><option' + (p.mo === 'MOD' ? ' selected' : '') + '>MOD</option><option' + (p.mo === 'MOI' ? ' selected' : '') + '>MOI</option></select>' +
      '<label class="f">Disciplina</label><input id="pd" list="pdl" value="' + esc(p.disciplina) + '" autocapitalize="characters"><datalist id="pdl">' + (j.disciplinas || []).map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      (deslig ? '<div class="alert" style="margin-top:10px">Esta pessoa está <b>desligada</b> e não aparece no app. Use <b>Reativar</b> para voltar (entra em Sem equipe).</div>' :
        '<label class="f">Equipe (encarregado)</label><select id="pe">' + encs.map(function (e) { return '<option' + (e === p.enc ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select>') +
      '<div class="row" style="margin-top:14px;flex-wrap:wrap">' + (nova ? '' : (deslig ? '<button class="btn ghost" id="preat">Reativar</button>' : '<button class="btn danger" id="pdes">Desligar</button>')) + '<button class="btn" id="pok">' + (nova ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var go = function (acao) {
      busy('Salvando…');
      var pe = b.querySelector('#pe');
      api('admin_efeSave', { orig: nova ? null : p.chapa, acao: acao || 'salvar', pessoa: { chapa: b.querySelector('#pc').value, nome: b.querySelector('#pn').value, funcao: b.querySelector('#pf').value, mo: b.querySelector('#pm').value, disciplina: b.querySelector('#pd').value, enc: pe ? pe.value : p.enc } })
        .then(function (r) { closeUI(); done(acao === 'desligar' ? 'Desligado ✓' : acao === 'reativar' ? 'Reativado ✓' : 'Salvo ✓'); A.efeCad = r; cadEfe(); })
        .catch(function (x) { done('Erro: ' + x.message); });
    };
    b.querySelector('#pok').onclick = function () { go('salvar'); };
    var d = b.querySelector('#pdes'); if (d) d.onclick = function () { if (confirm('Desligar ' + p.nome + '?\n\nSai da equipe, do RDA e da hora extra. O histórico fica guardado.')) go('desligar'); };
    var r = b.querySelector('#preat'); if (r) r.onclick = function () { go('reativar'); };
  }

  /* ----- equipamentos ----- */
  function cadEqp(j) {
    var box = document.getElementById('cadbox');
    if (!j) return api('admin_eqpList').then(function (r) { A.eqpCad = r; cadEqp(r); }).catch(cadErro);
    var f = A.eqpBusca || '';
    var lista = j.itens.filter(function (e) { return !f || U().norm(e.d + ' ' + e.t + ' ' + e.p + ' ' + e.f).indexOf(U().norm(f)) >= 0; });
    var man = j.itens.filter(function (e) { return e.o === 'MANUAL'; }).length;
    box.innerHTML = '<div class="card"><div class="row" style="align-items:center"><input id="qbusca" placeholder="🔍 Procurar descrição, TAG, placa ou fornecedor" value="' + esc(f) + '"><button class="btn" id="qnovo" style="flex:0 0 auto">＋ Novo</button></div>' +
      '<p class="small muted" style="margin-bottom:0">' + j.itens.length + ' equipamentos' + (man ? ' (' + man + ' cadastrado(s)/editado(s) aqui)' : '') + '. É a lista que o encarregado vê no RDA. O que você cadastrar ou editar aqui <b>fica</b> mesmo quando a posição de frota for importada de novo.</p></div>' +
      '<div class="card">' + (lista.map(function (e) {
        return '<div class="rdaline" data-qi="' + e.i + '" style="cursor:pointer"><div class="tx"><b>' + esc(e.d) + '</b><small>' + [e.t && 'TAG ' + e.t, e.p && 'Placa/série ' + e.p, e.f].filter(Boolean).map(esc).join(' · ') + '</small></div>' + (e.o === 'MANUAL' ? '<span class="tag">Editado aqui</span>' : '') + '<span class="muted">›</span></div>';
      }).join('') || '<p class="empty">Nenhum equipamento encontrado</p>') + '</div>';
    var qb = document.getElementById('qbusca');
    qb.oninput = function () { A.eqpBusca = qb.value; var pos = qb.selectionStart; cadEqp(j); var n = document.getElementById('qbusca'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('qnovo').onclick = function () { eqpForm(null); };
    [].forEach.call(box.querySelectorAll('[data-qi]'), function (r) { r.onclick = function () { eqpForm(j.itens.filter(function (e) { return e.i === +r.dataset.qi; })[0]); }; });
  }
  function eqpForm(e) {
    var novo = !e; e = e || { d: '', t: '', p: '', f: '' };
    var b = sheetUI('<h3>' + (novo ? 'Novo equipamento' : 'Editar equipamento') + '</h3>' +
      '<label class="f" style="margin-top:0">Descrição</label><input id="qd" value="' + esc(e.d) + '" autocapitalize="characters" placeholder="Ex.: GUINDASTE 50T">' +
      '<label class="f">TAG</label><input id="qt" value="' + esc(e.t) + '" autocapitalize="characters">' +
      '<label class="f">Placa / série</label><input id="qp" value="' + esc(e.p) + '" autocapitalize="characters">' +
      '<label class="f">Fornecedor</label><input id="qf" value="' + esc(e.f) + '" autocapitalize="characters">' +
      (novo ? '' : '<p class="small muted">RDAs já enviados continuam com o equipamento escrito como estava.</p>') +
      '<div class="row" style="margin-top:14px">' + (novo ? '' : '<button class="btn danger" id="qrm">Excluir</button>') + '<button class="btn" id="qok">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var go = function (rm) {
      busy('Salvando…');
      api('admin_eqpSave', { orig: novo ? null : { i: e.i, d: e.d }, item: { d: b.querySelector('#qd').value, t: b.querySelector('#qt').value, p: b.querySelector('#qp').value, f: b.querySelector('#qf').value }, remove: !!rm })
        .then(function (r) { closeUI(); done(rm ? 'Excluído ✓' : 'Salvo ✓'); A.eqpCad = r; cadEqp(r); }).catch(function (x) { done('Erro: ' + x.message); });
    };
    b.querySelector('#qok').onclick = function () { go(false); };
    var rm = b.querySelector('#qrm'); if (rm) rm.onclick = function () { if (confirm('Excluir ' + e.d + ' da lista?' + (e.o === 'MANUAL' ? '' : '\n\nSe ele continuar na posição de frota, volta na próxima importação.'))) go(true); };
  }

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
      var b = sheetUI('<h3>👷 Quem faz RDA</h3><p class="small muted"><b>📱 App</b>: entra no controle de recebimento e recebe os alertas de prazo e os lembretes de hora extra. <b>📝 Papel</b>: faz o RDA manual – continua no controle de recebimento (toque em “✓ Recebi” quando o papel chegar), mas não recebe alertas no app.</p>' +
        encs.map(function (e) { var m = e.cobra ? 'APP' : e.papel ? 'PAPEL' : 'NAO'; return '<div class="person"><div class="pinfo"><b>' + esc(e.nome) + '</b><small>' + esc(e.disciplina) + '</small></div><select data-cb="' + esc(e.nome) + '" data-v="' + m + '" style="flex:0 0 120px;min-height:40px"><option value="APP"' + (m === 'APP' ? ' selected' : '') + '>📱 App</option><option value="PAPEL"' + (m === 'PAPEL' ? ' selected' : '') + '>📝 Papel</option><option value="NAO"' + (m === 'NAO' ? ' selected' : '') + '>Não faz</option></select></div>'; }).join('') +
        '<button class="btn block" style="margin-top:12px" onclick="document.getElementById(\'sheet\').classList.add(\'hidden\')">Fechar</button>');
      [].forEach.call(b.querySelectorAll('[data-cb]'), function (c) {
        c.onchange = function () { var v = c.value; api('admin_setCobra', { enc: c.dataset.cb, modo: v, cobra: v === 'APP' }).then(function () { c.dataset.v = v; done('Salvo ✓'); }).catch(function (e) { done('Erro: ' + e.message); c.value = c.dataset.v; }); };
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

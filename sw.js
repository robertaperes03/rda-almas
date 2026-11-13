// Guarda o aplicativo no celular para abrir sem internet.
var CACHE = 'rda-almas-v6';
importScripts('config.js');
var SHELL = ['./', 'index.html', 'style.css', 'config.js', 'db.js', 'app.js', 'admin.js', 'pdf.js', 'logo.jpg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'pdf-lib.min.js', 'pdfa.js', 'jszip.min.js', 'xlsxw.js', 'xlsxr.js'];
var LAZY = ['pdf-lib.min.js', 'pdfa.js', 'jszip.min.js', 'xlsxw.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.indexOf('script.google.com') >= 0 || url.indexOf('googleusercontent.com') >= 0) return; // dados: sempre rede
  var same = url.indexOf(self.location.origin) === 0;
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) { // fontes da assinatura: guarda para usar sem internet
    e.respondWith(caches.open(CACHE).then(function (c) { return c.match(e.request).then(function (m) { return m || fetch(e.request).then(function (r) { c.put(e.request, r.clone()); return r; }); }); }));
    return;
  }
  if (!same) return;
  // rede primeiro (pega atualizações), cai para o cache sem internet
  // no-cache: sempre confere com o servidor se há versão nova (evita arquivo antigo guardado)
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); });
  }));
});

/* ---------- notificações ---------- */
function idbGet(k) {
  return new Promise(function (res) {
    var r = indexedDB.open('rda-almas', 1);
    r.onupgradeneeded = function () { var d = r.result; ['kv', 'drafts', 'photos', 'queue'].forEach(function (s) { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
    r.onsuccess = function () { try { var q = r.result.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } };
    r.onerror = function () { res(null); };
  });
}
function idbPut(k, v) {
  return new Promise(function (res) {
    var r = indexedDB.open('rda-almas', 1);
    r.onsuccess = function () { try { var t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; } catch (e) { res(); } };
    r.onerror = function () { res(); };
  });
}
function post(body) {
  var api = (self.RDA_CONFIG || {}).API_URL;
  return fetch(api, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).then(function (r) { return r.json(); });
}
self.addEventListener('push', function (e) {
  e.waitUntil(Promise.all([idbGet('key'), idbGet('pushEnc'), idbGet('adminToken'), idbGet('notifAte')]).then(function (v) {
    var jobs = [];
    if (v[1] && v[0]) jobs.push(post({ action: 'inbox', key: v[0], enc: v[1] }).then(function (r) { return { msgs: r.mensagens || [], admin: false }; }).catch(function () { return null; }));
    if (v[2]) jobs.push(post({ action: 'adminInboxToken', token: v[2] }).then(function (r) { return { msgs: r.mensagens || [], admin: true }; }).catch(function () { return null; }));
    return Promise.all(jobs).then(function (rs) {
      var ate = v[3] || '', novos = [], max = ate;
      rs.forEach(function (r) { if (!r) return; r.msgs.forEach(function (m) { if (m.em > ate) { novos.push({ m: m, admin: r.admin }); if (m.em > max) max = m.em; } }); });
      novos = novos.slice(0, 3);
      if (!novos.length) return self.registration.showNotification('RDA Almas', { body: 'Você tem um aviso novo. Toque para abrir.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'rda' });
      return idbPut('notifAte', max).then(function () {
        return Promise.all(novos.map(function (n) {
          return self.registration.showNotification(n.m.titulo, { body: String(n.m.texto).slice(0, 240), icon: 'icon-192.png', badge: 'icon-192.png', tag: n.m.id, data: { admin: n.admin } });
        }));
      });
    });
  }).catch(function () { return self.registration.showNotification('RDA Almas', { body: 'Você tem um aviso novo.', icon: 'icon-192.png' }); }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = './' + (e.notification.data && e.notification.data.admin ? '#admin' : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) { cs[i].navigate && e.notification.data && e.notification.data.admin && cs[i].navigate(url); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});

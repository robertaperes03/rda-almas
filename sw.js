// Guarda o aplicativo no celular para abrir sem internet.
var CACHE = 'rda-almas-v2';
var SHELL = ['./', 'index.html', 'style.css', 'config.js', 'db.js', 'app.js', 'admin.js', 'pdf.js', 'logo.jpg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'pdf-lib.min.js', 'pdfa.js', 'jszip.min.js', 'xlsxw.js', 'xlsxr.js'];
var LAZY = ['pdf-lib.min.js', 'pdfa.js', 'jszip.min.js', 'xlsxw.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
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
  if (!same) return;
  // rede primeiro (pega atualizações), cai para o cache sem internet
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); });
  }));
});

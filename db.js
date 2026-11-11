// Armazenamento local (IndexedDB) — funciona sem internet.
(function () {
  var DB_NAME = 'rda-almas', VER = 1, dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, VER);
      r.onupgradeneeded = function () {
        var d = r.result;
        ['kv', 'drafts', 'photos', 'queue'].forEach(function (s) { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        var q = fn(s);
        if (q) q.onsuccess = function () { out = q.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  window.DB = {
    get: function (store, k) { return tx(store, 'readonly', function (s) { return s.get(k); }); },
    put: function (store, k, v) { return tx(store, 'readwrite', function (s) { return s.put(v, k); }); },
    del: function (store, k) { return tx(store, 'readwrite', function (s) { return s.delete(k); }); },
    all: function (store) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var out = [], t = d.transaction(store, 'readonly'), c = t.objectStore(store).openCursor();
          c.onsuccess = function () { var cur = c.result; if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); } };
          t.oncomplete = function () { res(out); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})();

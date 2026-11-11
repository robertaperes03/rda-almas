/* Leitor simples de .xlsx (JSZip): devolve {nomeDaAba: [[valores]]} */
(function () {
  'use strict';
  function colIdx(ref) { var m = ref.match(/^([A-Z]+)(\d+)$/), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return [parseInt(m[2], 10) - 1, n - 1]; }
  function txt(node) { var out = ''; var ts = node.getElementsByTagName('t'); for (var i = 0; i < ts.length; i++) out += ts[i].textContent; return out; }
  window.readXlsx = function (file) {
    return JSZip.loadAsync(file).then(function (z) {
      var P = new DOMParser();
      var get = function (p) { var f = z.file(p); return f ? f.async('string') : Promise.resolve(''); };
      return Promise.all([get('xl/workbook.xml'), get('xl/_rels/workbook.xml.rels'), get('xl/sharedStrings.xml')]).then(function (x) {
        var wb = P.parseFromString(x[0], 'application/xml'), rels = P.parseFromString(x[1], 'application/xml');
        var ss = [];
        if (x[2]) { var si = P.parseFromString(x[2], 'application/xml').getElementsByTagName('si'); for (var i = 0; i < si.length; i++) ss.push(txt(si[i])); }
        var relMap = {}; var rs = rels.getElementsByTagName('Relationship');
        for (var j = 0; j < rs.length; j++) relMap[rs[j].getAttribute('Id')] = rs[j].getAttribute('Target');
        var sheets = wb.getElementsByTagName('sheet'), out = {}, jobs = [];
        [].forEach.call(sheets, function (s) {
          var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
          var t = relMap[rid] || ''; t = t.replace(/^\/?xl\//, ''); var path = 'xl/' + t;
          jobs.push(get(path).then(function (xml) {
            var doc = P.parseFromString(xml, 'application/xml'), rows = [];
            var cs = doc.getElementsByTagName('c');
            for (var k = 0; k < cs.length; k++) {
              var c = cs[k], ref = c.getAttribute('r'); if (!ref) continue;
              var rc = colIdx(ref), type = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = null;
              if (type === 's') val = v ? ss[+v.textContent] : null;
              else if (type === 'inlineStr') val = txt(c);
              else if (type === 'str') val = v ? v.textContent : null;
              else if (type === 'b') val = v ? v.textContent === '1' : null;
              else if (v) { var n = Number(v.textContent); val = isNaN(n) ? v.textContent : n; }
              if (val === null || val === '') continue;
              (rows[rc[0]] = rows[rc[0]] || [])[rc[1]] = val;
            }
            for (var r = 0; r < rows.length; r++) rows[r] = rows[r] || [];
            out[s.getAttribute('name')] = rows;
          }));
        });
        return Promise.all(jobs).then(function () { return out; });
      });
    });
  };
  window.xlsDate = function (n) { // número de série do Excel -> yyyy-mm-dd
    var d = new Date(Math.round((n - 25569) * 86400000)); return d.toISOString().slice(0, 10);
  };
})();

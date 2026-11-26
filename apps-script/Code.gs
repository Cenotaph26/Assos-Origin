/**
 * Origin Kuruluş Takibi — Google E-Tablolar arka ucu
 *
 * Bu dosya, takip panelinin (GitHub Pages) verilerini Google E-Tablo'da saklar.
 * - "Takip" sayfası: tüm aşama ve adımlar (asıl veri). Elle de düzenlenebilir; panel değişikliği görür.
 * - "Özet" sayfası: aşama başına ilerleme ve bütçe (otomatik).
 * - "Toplantılar" sayfası: toplantılar. Her kullanıcı panelden kendi Google Takvim'i ile eşitler.
 * - "Geçmiş" sayfası: kim, ne zaman, neyi değiştirdi; panelden tek tek geri alınabilir.
 * - Her gün Drive'daki "Origin Excel Yedekleri" klasörüne .xlsx yedek alınır.
 *
 * Kurulum: README.md dosyasındaki adımları izleyin. İlk kez EKIP_SIFRESI'ni değiştirip kurulum() çalıştırın.
 */

// >>> Ekibe vereceğiniz şifreyi buraya yazın, sonra kurulum() fonksiyonunu çalıştırın.
var EKIP_SIFRESI = 'origin2027';

var SAYFA = 'Takip';
var OZET = 'Özet';
var YEDEK_KLASORU = 'Origin Excel Yedekleri';
var YEDEK_SAYISI = 30;
var SAAT_DILIMI = 'Europe/Istanbul';
var TOPLANTI = 'Toplantılar';
var GECMIS = 'Geçmiş';
// Toplantılar her kullanıcının KENDİ takvimine panelden (tarayıcıda) eklenir.
// Sunucunun ayrıca ortak bir takvime yazmasını isterseniz TAKVIM_SUNUCU = true yapın.
var TAKVIM_SUNUCU = false;
// TAKVIM_SUNUCU açıkken kullanılacak takvim; boşsa yayınlayan hesabın ana takvimi.
var TAKVIM_ID = '';
var ETKINLIK_ONEKI = 'Origin · ';
var TBASLIK = ['Tarih', 'Başlangıç', 'Bitiş', 'Başlık', 'Yer', 'Katılımcılar (e-posta)', 'Aşama', 'Not', 'Takvim', 'toplanti_id', 'etkinlik_id', 'asama_id', 'degisti', 'esitlendi'];
// Görünüm: paneldeki renk ve yazı dili
var YAZI = 'Inter';
var R_MUREKKEP = '#111111', R_TURUNCU = '#ff5a36', R_TURUNCU_ACIK = '#ffe9e3', R_TURUNCU_KOYU = '#c2361a', R_GRI = '#767676', R_ACIK = '#f2f2f2', R_CIZGI = '#e6e6e6', R_BANT = '#fafafa';
var GBASLIK = ['Zaman', 'Kişi', 'Değişiklik', 'Durum', 'kayit_id', 'ters_islem'];

var BASLIK = ['Aşama no', 'Aşama', 'Durum', 'Adım', 'Sorumlu', 'Başlangıç', 'Bitiş', 'Plan bütçe', 'Harcanan', 'Kalan', 'Not', 'asama_id', 'adim_id'];
var LBL = { bekliyor: 'Bekliyor', devam: 'Devam', bitti: 'Bitti', engel: 'Engel var' };
var KOD = { 'bekliyor': 'bekliyor', 'devam': 'devam', 'bitti': 'bitti', 'engel var': 'engel', 'engel': 'engel' };

/* ---------------- Web uygulaması ---------------- */

function doGet(e) {
  var q = (e && e.parameter) || {};
  if (!sifreDogru_(q.pin)) return json_({ ok: false, error: 'auth' });
  if (q.action === 'history') return json_({ ok: true, history: gecmis_(Number(q.n) || 150) });
  var rev = Number(props_().getProperty('rev') || 0);
  if (q.rev && Number(q.rev) === rev) return json_({ ok: true, same: true, rev: rev });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return json_({ ok: true, rev: Number(props_().getProperty('rev') || 0), state: oku_(), sheetUrl: ss_().getUrl() });
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (!sifreDogru_(body.pin)) return json_({ ok: false, error: 'auth' });
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var user = String(body.user || 'Bilinmeyen').slice(0, 60), report = null;
    var S = oku_();
    if (body.action === 'revert') {
      var msg = geriAl_(S, body.id, user);
      if (msg !== true) return json_({ ok: false, error: msg });
    } else if (body.action === 'calsync') {
      report = TAKVIM_SUNUCU ? takvimEsitle_(S, user) : { disabled: true };
    } else {
      var changes = body.changes || [{ ops: body.ops || [] }];
      changes.forEach(function (c) {
        (c.ops || []).forEach(function (op) {
          if (op.t === 'mdel') etkinlikSil_(S, op.m);
          applyOp(S, op);
        });
        if (c.d) log_(user, c.d, c.inv || null);
      });
      if (TAKVIM_SUNUCU && S.meetings.some(function (m) { return m.dirty; })) {
        try { calPush_(S); } catch (err) { report = { error: String(err) }; }
      }
    }
    yaz_(S);
    var rev = revArtir_();
    return json_({ ok: true, rev: rev, state: oku_(), sheetUrl: ss_().getUrl(), report: report });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}

/* ---------------- Veri işlemleri (js/ops.js ile aynı) ---------------- */

var STEP_F = ['t', 'who', 's', 'e', 'plan', 'act', 'st', 'note'];
var MEET_F = ['title', 'date', 'start', 'end', 'place', 'who', 'phase', 'note'];
function findPhase(S, id) { return S.phases.find(function (p) { return p.id === id; }); }
function applyOp(S, op) {
  var p = op.p ? findPhase(S, op.p) : null, i;
  if (!S.meetings) S.meetings = [];
  switch (op.t) {
    case 'set':
      if (!p) return S;
      var x = p.steps.find(function (s) { return s.id === op.s; });
      if (x && STEP_F.indexOf(op.f) >= 0) x[op.f] = String(op.v == null ? '' : op.v);
      return S;
    case 'pname':
      if (p) p.name = String(op.v || 'Adsız aşama');
      return S;
    case 'addStep':
      if (!p || p.steps.some(function (s) { return s.id === op.step.id; })) return S;
      i = op.i == null ? p.steps.length : Math.max(0, Math.min(op.i, p.steps.length));
      p.steps.splice(i, 0, op.step);
      return S;
    case 'delStep':
      if (p) p.steps = p.steps.filter(function (s) { return s.id !== op.s; });
      return S;
    case 'addPhase':
      if (findPhase(S, op.phase.id)) return S;
      i = op.i == null ? S.phases.length : Math.max(0, Math.min(op.i, S.phases.length));
      S.phases.splice(i, 0, op.phase);
      return S;
    case 'delPhase':
      S.phases = S.phases.filter(function (q) { return q.id !== op.p; });
      return S;
    case 'move':
      if (!p) return S;
      i = S.phases.indexOf(p);
      var j = i + (op.d < 0 ? -1 : 1);
      if (j < 0 || j >= S.phases.length) return S;
      S.phases[i] = S.phases[j]; S.phases[j] = p;
      return S;
    case 'seed':
      if (!S.phases.length && op.phases && op.phases.length) S.phases = op.phases;
      return S;
    case 'madd':
      if (S.meetings.some(function (m) { return m.id === op.mt.id; })) return S;
      var nm = JSON.parse(JSON.stringify(op.mt)); nm.dirty = true;
      S.meetings.push(nm);
      return S;
    case 'mset':
      var m = S.meetings.find(function (z) { return z.id === op.m; });
      if (m && MEET_F.indexOf(op.f) >= 0) { m[op.f] = String(op.v == null ? '' : op.v); m.dirty = true; }
      return S;
    case 'mdel':
      S.meetings = S.meetings.filter(function (z) { return z.id !== op.m; });
      return S;
  }
  return S;
}

/* ---------------- E-tablo okuma / yazma ---------------- */

function ss_() {
  var id = props_().getProperty('sheetId');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function props_() { return PropertiesService.getScriptProperties(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sifreDogru_(pin) { var s = props_().getProperty('pin') || EKIP_SIFRESI; return String(pin || '') === String(s); }
function revArtir_() { var r = Number(props_().getProperty('rev') || 0) + 1; props_().setProperty('rev', String(r)); return r; }
function yeniId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function tarihStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SAAT_DILIMI, 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function tarihDeger_(s) {
  if (!s) return '';
  var a = s.split('-').map(Number);
  return new Date(a[0], a[1] - 1, a[2]);
}
function sayiStr_(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v);
}
function sayiDeger_(s) {
  if (s === '' || s == null) return '';
  var t = String(s).trim();
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  var n = parseFloat(t);
  return isNaN(n) ? '' : n;
}

function oku_() {
  var sh = ss_().getSheetByName(SAYFA);
  var S = { phases: [], meetings: toplantiOku_() };
  if (!sh || sh.getLastRow() < 2) return S;
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, BASLIK.length);
  var vals = rng.getValues();
  var map = {}, idYazildi = false;
  vals.forEach(function (r, k) {
    var ad = String(r[1] || '').trim(), adim = String(r[3] || '').trim();
    var pid = String(r[11] || '').trim(), sid = String(r[12] || '').trim();
    if (!ad && !adim && !pid) return;
    if (!pid) {
      var var_ = S.phases.find(function (p) { return p.name === (ad || 'Adsız aşama'); });
      pid = var_ ? var_.id : yeniId_();
      sh.getRange(k + 2, 12).setValue(pid); idYazildi = true;
    }
    var p = map[pid];
    if (!p) { p = map[pid] = { id: pid, name: ad || 'Adsız aşama', steps: [] }; S.phases.push(p); }
    if (!adim && !sid) return; // adımsız aşama satırı
    if (!sid) { sid = yeniId_(); sh.getRange(k + 2, 13).setValue(sid); idYazildi = true; }
    p.steps.push({
      id: sid, t: adim, who: String(r[4] || ''), s: tarihStr_(r[5]), e: tarihStr_(r[6]),
      plan: sayiStr_(r[7]), act: sayiStr_(r[8]),
      st: KOD[String(r[2] || '').trim().toLocaleLowerCase('tr')] || 'bekliyor', note: String(r[10] || '')
    });
  });
  if (idYazildi) revArtir_();
  return S;
}

function yaz_(S) {
  var ss = ss_(), sh = ss.getSheetByName(SAYFA) || ss.insertSheet(SAYFA);
  var rows = [];
  S.phases.forEach(function (p, i) {
    if (!p.steps.length) { rows.push([i + 1, p.name, '', '', '', '', '', '', '', '', '', p.id, '']); return; }
    p.steps.forEach(function (x) {
      rows.push([i + 1, p.name, LBL[x.st] || 'Bekliyor', x.t, x.who, tarihDeger_(x.s), tarihDeger_(x.e),
        sayiDeger_(x.plan), sayiDeger_(x.act), '', x.note, p.id, x.id]);
    });
  });
  var eski = Math.max(sh.getLastRow() - 1, 0);
  if (eski > 0) sh.getRange(2, 1, eski, BASLIK.length).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, BASLIK.length).setValues(rows);
    var kalan = rows.map(function (r, k) { var n = k + 2; return ['=IF(AND(H' + n + '="";I' + n + '="");"";N(H' + n + ')-N(I' + n + '))']; });
    sh.getRange(2, 10, rows.length, 1).setFormulas(kalan.map(function (f) { return [L_(f[0].replace(/;/g, ','))]; }));
  }
  ozetYaz_(S);
  toplantiYaz_(S);
}

function ozetYaz_(S) {
  var ss = ss_(), sh = ss.getSheetByName(OZET) || ss.insertSheet(OZET);
  sh.clear(); sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);
  var B = ['#', 'Aşama', 'İlerleme', '', 'Adım', 'Bitti', 'Devam', 'Engel', 'Plan bütçe', 'Harcanan', 'Kalan'];
  sh.getRange(1, 1, 1, 11).merge().setValue('Origin Üretim Merkezi · Kuruluş özeti')
    .setFontFamily(YAZI).setFontSize(20).setFontWeight('bold').setFontColor(R_MUREKKEP).setVerticalAlignment('middle');
  sh.getRange(2, 1, 1, 11).merge().setValue('Son güncelleme: ' + Utilities.formatDate(new Date(), SAAT_DILIMI, 'dd.MM.yyyy HH:mm') + ' · Bu sayfa otomatik oluşturulur, düzenlemeyin.')
    .setFontFamily(YAZI).setFontSize(9).setFontColor(R_GRI);
  sh.setRowHeight(1, 44); sh.setRowHeight(2, 22); sh.setRowHeight(3, 12);
  baslik_(sh.getRange(4, 1, 1, 11).setValues([B]));
  sh.getRange(4, 3, 1, 2).merge();
  var id = 'Takip!L:L';
  var rows = S.phases.map(function (p, i) {
    var n = i + 5, k = '"' + p.id + '"';
    return [i + 1, p.name,
      '=IF(E' + n + '=0,0,(F' + n + '+0.5*G' + n + '+0.25*H' + n + ')/E' + n + ')',
      '=SPARKLINE(C' + n + ',{"charttype","bar";"max",1;"color1","' + R_TURUNCU + '";"empty","zero"})',
      p.steps.length,
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Bitti")',
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Devam")',
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Engel var")',
      '=SUMIFS(Takip!H:H,' + id + ',' + k + ')',
      '=SUMIFS(Takip!I:I,' + id + ',' + k + ')',
      '=I' + n + '-J' + n];
  });
  if (rows.length) {
    var n0 = 5, n1 = 4 + rows.length, t = n1 + 1;
    var d = sh.getRange(n0, 1, rows.length, 11);
    karisikYaz_(sh, n0, 1, rows);
    govde_(d);
    sh.setRowHeights(n0, rows.length, 34);
    sh.getRange(n0, 1, rows.length, 1).setHorizontalAlignment('center').setFontColor(R_GRI);
    sh.getRange(n0, 2, rows.length, 1).setFontWeight('bold');
    sh.getRange(n0, 3, rows.length, 1).setNumberFormat('0%').setFontColor(R_TURUNCU).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('right');
    sh.getRange(n0, 5, rows.length + 1, 4).setNumberFormat('0').setHorizontalAlignment('center');
    sh.getRange(n0, 9, rows.length, 3).setNumberFormat('#,##0 "₺";-#,##0 "₺";"—"').setHorizontalAlignment('right');
    karisikYaz_(sh, t, 2, [['Toplam',
      '=IF(E' + t + '=0,0,(F' + t + '+0.5*G' + t + '+0.25*H' + t + ')/E' + t + ')',
      '=SPARKLINE(C' + t + ',{"charttype","bar";"max",1;"color1","' + R_MUREKKEP + '";"empty","zero"})',
      '=SUM(E' + n0 + ':E' + n1 + ')', '=SUM(F' + n0 + ':F' + n1 + ')', '=SUM(G' + n0 + ':G' + n1 + ')', '=SUM(H' + n0 + ':H' + n1 + ')',
      '=SUM(I' + n0 + ':I' + n1 + ')', '=SUM(J' + n0 + ':J' + n1 + ')', '=I' + t + '-J' + t]]);
    var tr = sh.getRange(t, 1, 1, 11);
    tr.setFontFamily(YAZI).setFontWeight('bold').setFontSize(11).setBackground(R_ACIK).setVerticalAlignment('middle')
      .setBorder(true, null, null, null, null, null, R_MUREKKEP, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sh.setRowHeight(t, 38);
    sh.getRange(t, 3).setNumberFormat('0%').setFontSize(14);
    sh.getRange(t, 5, 1, 4).setHorizontalAlignment('center');
    sh.getRange(t, 9, 1, 3).setNumberFormat('#,##0 "₺";-#,##0 "₺";"—"').setHorizontalAlignment('right');
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor(R_TURUNCU_KOYU).setBold(true).setRanges([sh.getRange(n0, 8, rows.length, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(1).setFontColor(R_MUREKKEP).setRanges([sh.getRange(n0, 3, rows.length, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor(R_TURUNCU_KOYU).setRanges([sh.getRange(n0, 11, rows.length + 1, 1)]).build()
    ]);
  }
  [40, 300, 70, 160, 70, 70, 70, 70, 120, 120, 120].forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
  sh.setFrozenRows(4);
}

/* E-tablo Türkçe gibi virgüllü ondalık kullanan bir dildeyse formüller o dilin sözdizimiyle yazılmalı:
   argüman ayırıcı ';', dizi sütun ayırıcı '\\', ondalık ','. */
var _yerel = null;
function L_(f) {
  if (_yerel === null) { try { _yerel = /^(tr|de|fr|es|it|pt|nl|ru|pl|cs|da|fi|sv|nb|hu|ro|uk|el|id|vi)/i.test(ss_().getSpreadsheetLocale()); } catch (e) { _yerel = false; } }
  if (!_yerel || typeof f !== 'string' || f.charAt(0) !== '=') return f;
  var out = '', q = false, d = 0;
  for (var i = 0; i < f.length; i++) {
    var c = f.charAt(i);
    if (c === '"') { q = !q; out += c; continue; }
    if (!q) {
      if (c === '{') d++;
      else if (c === '}') d--;
      else if (c === ',') { out += d > 0 ? '\\' : ';'; continue; }
      else if (c === '.' && /\d/.test(f.charAt(i - 1)) && /\d/.test(f.charAt(i + 1))) { out += ','; continue; }
    }
    out += c;
  }
  return out;
}

/* Formülleri setValues ile yazmak e-tablonun diline göre (TR: noktalı virgül) bozulur;
   formüller her zaman setFormulas ile, İngilizce sözdiziminde yazılır. */
function karisikYaz_(sh, r0, c0, grid) {
  var n = grid.length, m = grid[0].length;
  sh.getRange(r0, c0, n, m).setValues(grid.map(function (r) { return r.map(function (v) { return (typeof v === 'string' && v.charAt(0) === '=') ? '' : v; }); }));
  for (var j = 0; j < m; j++) {
    var col = grid.map(function (r) { return r[j]; });
    if (!col.some(function (v) { return typeof v === 'string' && v.charAt(0) === '='; })) continue;
    if (col.every(function (v) { return typeof v === 'string' && v.charAt(0) === '='; })) sh.getRange(r0, c0 + j, n, 1).setFormulas(col.map(function (v) { return [L_(v)]; }));
    else col.forEach(function (v, i) { if (typeof v === 'string' && v.charAt(0) === '=') sh.getRange(r0 + i, c0 + j).setFormula(L_(v)); });
  }
}

/* ---------------- Görünüm ---------------- */

function baslik_(r) {
  return r.setFontFamily(YAZI).setFontSize(10).setFontWeight('bold').setFontColor('#ffffff').setBackground(R_MUREKKEP)
    .setVerticalAlignment('middle').setWrap(false);
}
function govde_(r) {
  return r.setFontFamily(YAZI).setFontSize(10).setFontColor(R_MUREKKEP).setVerticalAlignment('middle')
    .setBorder(null, null, true, null, null, true, R_CIZGI, SpreadsheetApp.BorderStyle.SOLID);
}

/* Tüm sayfaları paneldeki görünüme getirir. kurulum() içinden çağrılır; istenirse tek başına da çalıştırılabilir. */
function gorunum() {
  var ss = ss_();
  var renk = {}; renk[SAYFA] = R_TURUNCU; renk[OZET] = R_MUREKKEP; renk[TOPLANTI] = '#b5b5b5'; renk[GECMIS] = R_CIZGI;

  // Takip
  var sh = ss.getSheetByName(SAYFA);
  if (sh) {
    sh.setHiddenGridlines(true).setTabColor(renk[SAYFA]); sh.setFrozenRows(1);
    baslik_(sh.getRange(1, 1, 1, BASLIK.length).setValues([BASLIK]));
    sh.setRowHeight(1, 38);
    var n = Math.max(sh.getMaxRows() - 1, 1);
    govde_(sh.getRange(2, 1, n, 11));
    sh.getRange(1, 1, 1, 11).setHorizontalAlignment('left');
    sh.getRange(1, 3).setHorizontalAlignment('center');
    sh.getRange(1, 8, 1, 3).setHorizontalAlignment('right');
    [70, 220, 110, 440, 150, 100, 100, 120, 120, 120, 320, 90, 90].forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
    sh.hideColumns(12, 2);
    sh.getRange(2, 1, n, 1).setHorizontalAlignment('center').setFontColor(R_GRI);
    sh.getRange(2, 2, n, 1).setFontColor(R_GRI);
    sh.getRange(2, 3, n, 1).setHorizontalAlignment('center').setFontWeight('bold');
    sh.getRange(2, 4, n, 1).setWrap(true).setFontWeight('bold');
    sh.getRange(2, 6, n, 2).setNumberFormat('dd.mm.yyyy').setHorizontalAlignment('center');
    sh.getRange(2, 8, n, 3).setNumberFormat('#,##0 "₺";-#,##0 "₺";""').setHorizontalAlignment('right');
    sh.getRange(2, 10, n, 1).setFontColor(R_GRI);
    sh.getRange(2, 11, n, 1).setWrap(true).setFontColor('#444444');
    sh.getRange(2, 3, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Bekliyor', 'Devam', 'Bitti', 'Engel var'], true).setAllowInvalid(false).build());
    var C = sh.getRange('C2:C'), T = sh.getRange('A2:K');
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Bitti').setBackground(R_MUREKKEP).setFontColor('#ffffff').setRanges([C]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Devam').setBackground(R_TURUNCU).setFontColor(R_MUREKKEP).setRanges([C]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Engel var').setBackground(R_TURUNCU_ACIK).setFontColor(R_TURUNCU_KOYU).setRanges([C]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Bekliyor').setBackground(R_ACIK).setFontColor(R_MUREKKEP).setRanges([C]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=AND(ISNUMBER($G2),$G2<TODAY(),$C2<>"Bitti")')).setFontColor(R_TURUNCU_KOYU).setBold(true).setRanges([sh.getRange('G2:G')]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=$C2="Bitti"')).setStrikethrough(true).setFontColor(R_GRI).setRanges([sh.getRange('D2:D')]).build(),
      // aşamalar arasında hafif bant: çift numaralı aşamalar açık gri zeminde
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=AND($A2<>"",ISEVEN($A2))')).setBackground(R_BANT).setRanges([sh.getRange('A2:B'), sh.getRange('D2:K')]).build()
    ]);
  }

  // Toplantılar
  var ts = ss.getSheetByName(TOPLANTI);
  if (ts) {
    ts.setHiddenGridlines(true).setTabColor(renk[TOPLANTI]); ts.setFrozenRows(1);
    baslik_(ts.getRange(1, 1, 1, TBASLIK.length).setValues([TBASLIK]));
    ts.setRowHeight(1, 38);
    var m = Math.max(ts.getMaxRows() - 1, 1);
    govde_(ts.getRange(2, 1, m, 9));
    [110, 90, 90, 300, 180, 260, 220, 320, 130].forEach(function (px, i) { ts.setColumnWidth(i + 1, px); });
    ts.hideColumns(10, 5);
    ts.getRange(2, 1, m, 1).setNumberFormat('dd.mm.yyyy').setFontWeight('bold');
    ts.getRange(2, 2, m, 2).setNumberFormat('@').setHorizontalAlignment('center');
    ts.getRange(2, 4, m, 1).setFontWeight('bold').setWrap(true);
    ts.getRange(2, 6, m, 3).setWrap(true).setFontColor('#444444');
    ts.getRange(2, 9, m, 1).setFontColor(R_GRI);
    ts.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=AND(ISNUMBER($A2),$A2<TODAY())')).setFontColor(R_GRI).setRanges([ts.getRange('A2:I')]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=AND(ISNUMBER($A2),$A2>=TODAY(),$A2<=TODAY()+1)')).setBackground(R_TURUNCU_ACIK).setRanges([ts.getRange('A2:A')]).build()
    ]);
  }

  // Geçmiş
  var gs = ss.getSheetByName(GECMIS);
  if (gs) {
    gs.setHiddenGridlines(true).setTabColor(renk[GECMIS]); gs.setFrozenRows(1);
    baslik_(gs.getRange(1, 1, 1, GBASLIK.length).setValues([GBASLIK]));
    gs.setRowHeight(1, 38);
    var g = Math.max(gs.getMaxRows() - 1, 1);
    govde_(gs.getRange(2, 1, g, 4));
    [150, 150, 620, 220].forEach(function (px, i) { gs.setColumnWidth(i + 1, px); });
    gs.hideColumns(5, 2);
    gs.getRange(2, 1, g, 1).setNumberFormat('dd.mm.yyyy HH:mm').setFontColor(R_GRI);
    gs.getRange(2, 2, g, 1).setFontWeight('bold');
    gs.getRange(2, 3, g, 1).setWrap(true);
    gs.getRange(2, 4, g, 1).setFontColor(R_TURUNCU_KOYU).setFontSize(9);
    gs.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(L_('=$D2<>""')).setStrikethrough(true).setFontColor(R_GRI).setRanges([gs.getRange('C2:C')]).build()
    ]);
  }

  var oz = ss.getSheetByName(OZET);
  if (oz) oz.setTabColor(renk[OZET]);
  yaz_(oku_()); // verileri yeniden yazar: formüller ve özet tazelenir
  // sekme sırası: Özet, Takip, Toplantılar, Geçmiş
  [OZET, SAYFA, TOPLANTI, GECMIS].forEach(function (ad, i) { var s = ss.getSheetByName(ad); if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); } });
  ss.setActiveSheet(ss.getSheetByName(OZET) || ss.getSheets()[0]);
}

/* Takip sayfası elle düzenlenince panellerin yeni veriyi çekmesi için sürüm artırılır. */
function onEdit(e) {
  try {
    var n = e && e.range && e.range.getSheet().getName();
    if (n === SAYFA) revArtir_();
    if (n === TOPLANTI && e.range.getRow() > 1 && e.range.getColumn() <= 8) {
      e.range.getSheet().getRange(e.range.getRow(), 13, e.range.getNumRows(), 1).setValue(true);
      revArtir_();
    }
  } catch (err) {}
}

/* ---------------- Kurulum ---------------- */

function kurulum() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  props_().setProperty('sheetId', ss.getId());
  props_().setProperty('pin', EKIP_SIFRESI);
  if (!props_().getProperty('rev')) props_().setProperty('rev', '1');
  ss.setSpreadsheetTimeZone(SAAT_DILIMI);

  if (!ss.getSheetByName(SAYFA)) ss.insertSheet(SAYFA, 0);
  if (!ss.getSheetByName(OZET)) ss.insertSheet(OZET, 1);
  if (!ss.getSheetByName(TOPLANTI)) ss.insertSheet(TOPLANTI, 2);
  if (!ss.getSheetByName(GECMIS)) ss.insertSheet(GECMIS, 3);
  ['Sayfa1', 'Sheet1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && s.getLastRow() === 0) ss.deleteSheet(s); });
  gorunum();

  ScriptApp.getProjectTriggers().forEach(function (t) { if (['gunlukYedek', 'takvimEsitle'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gunlukYedek').timeBased().everyDays(1).atHour(23).inTimezone(SAAT_DILIMI).create();
  if (TAKVIM_SUNUCU) { ScriptApp.newTrigger('takvimEsitle').timeBased().everyHours(1).create(); takvim_(); }
  Logger.log('Kurulum tamam. Şimdi Dağıt > Yeni dağıtım > Web uygulaması ile yayınlayın.');
}

/* ---------------- Excel yedeği ---------------- */

function gunlukYedek() {
  var ss = ss_();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  var blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
  var ad = 'Origin-Takip-' + Utilities.formatDate(new Date(), SAAT_DILIMI, 'yyyy-MM-dd_HHmm') + '.xlsx';
  blob.setName(ad);
  var it = DriveApp.getFoldersByName(YEDEK_KLASORU);
  var klasor = it.hasNext() ? it.next() : DriveApp.createFolder(YEDEK_KLASORU);
  klasor.createFile(blob);
  var dosyalar = [], f = klasor.getFiles();
  while (f.hasNext()) dosyalar.push(f.next());
  dosyalar.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  dosyalar.slice(YEDEK_SAYISI).forEach(function (x) { x.setTrashed(true); });
  return ad;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Origin')
    .addItem('Şimdi Excel yedeği al', 'yedekMenu_')
    .addItem('Kurulumu yenile', 'kurulum')
    .addToUi();
}
function yedekMenu_() {
  var ad = gunlukYedek();
  SpreadsheetApp.getUi().alert('Yedek alındı: ' + ad + '\nDrive > ' + YEDEK_KLASORU);
}

/* ---------------- Değişiklik geçmişi ---------------- */

function log_(user, d, inv) {
  var sh = ss_().getSheetByName(GECMIS) || ss_().insertSheet(GECMIS);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, GBASLIK.length).setValues([GBASLIK]);
  var j = inv ? JSON.stringify(inv) : '';
  if (j.length > 45000) j = '';
  sh.appendRow([new Date(), user, String(d).slice(0, 500), '', yeniId_(), j]);
}

function gecmis_(n) {
  var sh = ss_().getSheetByName(GECMIS);
  if (!sh || sh.getLastRow() < 2) return [];
  var last = sh.getLastRow(), from = Math.max(2, last - n + 1);
  return sh.getRange(from, 1, last - from + 1, GBASLIK.length).getValues().map(function (r) {
    return { at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), who: String(r[1]), d: String(r[2]), st: String(r[3]), id: String(r[4]), can: !!r[5] && !r[3] };
  }).reverse();
}

function geriAl_(S, id, user) {
  var sh = ss_().getSheetByName(GECMIS);
  if (!sh || sh.getLastRow() < 2) return 'not_found';
  var ids = sh.getRange(2, 5, sh.getLastRow() - 1, 1).getValues();
  for (var k = ids.length - 1; k >= 0; k--) {
    if (String(ids[k][0]) !== String(id)) continue;
    var row = k + 2, r = sh.getRange(row, 1, 1, GBASLIK.length).getValues()[0];
    if (r[3]) return 'already';
    if (!r[5]) return 'not_revertible';
    var inv = JSON.parse(r[5]);
    inv.forEach(function (op) { if (op.t === 'mdel') etkinlikSil_(S, op.m); applyOp(S, op); });
    if (TAKVIM_SUNUCU && S.meetings.some(function (m) { return m.dirty; })) { try { calPush_(S); } catch (err) {} }
    var zaman = Utilities.formatDate(new Date(), SAAT_DILIMI, 'dd.MM.yyyy HH:mm');
    sh.getRange(row, 4).setValue('Geri alındı · ' + user + ' · ' + zaman);
    log_(user, 'Geri alındı: ' + r[2], null);
    return true;
  }
  return 'not_found';
}

/* ---------------- Toplantılar ---------------- */

function saatStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SAAT_DILIMI, 'HH:mm');
  var m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

function toplantiOku_() {
  var sh = ss_().getSheetByName(TOPLANTI);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, TBASLIK.length).getValues(), out = [], yaz = false;
  vals.forEach(function (r, k) {
    if (!String(r[3] || '').trim() && !r[0]) return;
    var id = String(r[9] || '').trim();
    if (!id) { id = yeniId_(); sh.getRange(k + 2, 10).setValue(id); sh.getRange(k + 2, 13).setValue(true); yaz = true; }
    out.push({ id: id, date: tarihStr_(r[0]), start: saatStr_(r[1]), end: saatStr_(r[2]), title: String(r[3] || ''), place: String(r[4] || ''),
      who: String(r[5] || ''), phase: String(r[11] || ''), note: String(r[7] || ''), cal: String(r[8] || ''), ev: String(r[10] || ''),
      dirty: r[12] === true || String(r[12]).toUpperCase() === 'TRUE', synced: String(r[13] || '') });
  });
  if (yaz) revArtir_();
  return out;
}

function toplantiYaz_(S) {
  var ss = ss_(), sh = ss.getSheetByName(TOPLANTI) || ss.insertSheet(TOPLANTI);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, TBASLIK.length).setValues([TBASLIK]);
  var adlar = {}; S.phases.forEach(function (p) { adlar[p.id] = p.name; });
  var list = (S.meetings || []).slice().sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
  var eski = Math.max(sh.getLastRow() - 1, 0);
  if (eski > 0) sh.getRange(2, 1, eski, TBASLIK.length).clearContent();
  if (!list.length) return;
  sh.getRange(2, 2, list.length, 2).setNumberFormat('@');
  sh.getRange(2, 1, list.length, TBASLIK.length).setValues(list.map(function (m) {
    return [tarihDeger_(m.date), m.start || '', m.end || '', m.title || '', m.place || '', m.who || '', adlar[m.phase] || '', m.note || '',
      m.cal || '', m.id, m.ev || '', m.phase || '', TAKVIM_SUNUCU ? !!m.dirty : false, m.synced || ''];
  }));
}

function takvim_() {
  return TAKVIM_ID ? CalendarApp.getCalendarById(TAKVIM_ID) : CalendarApp.getDefaultCalendar();
}

function zaman_(m) {
  var bas = Utilities.parseDate(m.date + ' ' + (m.start || '09:00'), SAAT_DILIMI, 'yyyy-MM-dd HH:mm');
  var bit = m.end ? Utilities.parseDate(m.date + ' ' + m.end, SAAT_DILIMI, 'yyyy-MM-dd HH:mm') : null;
  if (!bit || bit <= bas) bit = new Date(bas.getTime() + 60 * 60 * 1000);
  return [bas, bit];
}

function aciklama_(S, m) {
  var p = S.phases.find(function (x) { return x.id === m.phase; });
  return 'Origin Kuruluş Takibi' + (p ? '\nAşama: ' + p.name : '') + (m.note ? '\n\n' + m.note : '');
}

function hatirlatici_(ev) {
  ev.removeAllReminders();
  ev.addPopupReminder(60);
  ev.addPopupReminder(1440);
}

function etkinlik_(cal, id) {
  if (!id) return null;
  try { return cal.getEventById(id); } catch (err) { return null; }
}

function calPush_(S) {
  var cal = takvim_(), n = 0;
  (S.meetings || []).forEach(function (m) {
    if (!m.dirty && m.ev) return;
    if (!m.date || !m.title) { m.cal = 'Tarih ve başlık gerekli'; return; }
    try {
      var t = zaman_(m), guests = String(m.who || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
      var ev = etkinlik_(cal, m.ev);
      if (ev) {
        ev.setTitle(ETKINLIK_ONEKI + m.title); ev.setTime(t[0], t[1]); ev.setLocation(m.place || ''); ev.setDescription(aciklama_(S, m));
        var var_ = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); });
        guests.forEach(function (g) { if (var_.indexOf(g.toLowerCase()) < 0) ev.addGuest(g); });
      } else {
        ev = cal.createEvent(ETKINLIK_ONEKI + m.title, t[0], t[1], { location: m.place || '', description: aciklama_(S, m), guests: guests.join(','), sendInvites: guests.length > 0 });
        m.ev = ev.getId();
      }
      hatirlatici_(ev);
      m.dirty = false; m.cal = 'Takvimde ✓'; m.synced = new Date().toISOString(); n++;
    } catch (err) { m.cal = 'Hata: ' + String(err).slice(0, 80); }
  });
  return n;
}

function calPull_(S) {
  var cal = takvim_(), r = { pulled: 0, removed: 0 };
  S.meetings = (S.meetings || []).filter(function (m) {
    if (!m.ev || m.dirty) return true;
    var ev = etkinlik_(cal, m.ev);
    if (!ev) { r.removed++; log_('Google Takvim', 'Toplantı takvimden silindiği için kaldırıldı: ' + m.title + ' (' + m.date + ')', [{ t: 'madd', mt: Object.assign({}, m, { ev: '' }) }]); return false; }
    var son = ev.getLastUpdated(), es = m.synced ? new Date(m.synced) : new Date(0);
    if (son.getTime() > es.getTime() + 5000) {
      var bas = ev.getStartTime(), bit = ev.getEndTime();
      m.date = Utilities.formatDate(bas, SAAT_DILIMI, 'yyyy-MM-dd');
      m.start = Utilities.formatDate(bas, SAAT_DILIMI, 'HH:mm');
      m.end = Utilities.formatDate(bit, SAAT_DILIMI, 'HH:mm');
      m.title = ev.getTitle().replace(ETKINLIK_ONEKI, '');
      m.place = ev.getLocation() || '';
      m.synced = new Date().toISOString(); m.cal = 'Takvimde ✓';
      hatirlatici_(ev);
      r.pulled++;
    }
    return true;
  });
  return r;
}

function takvimEsitle_(S, user) {
  var r = calPull_(S);
  S.meetings.forEach(function (m) { if (!m.ev) m.dirty = true; });
  r.pushed = calPush_(S);
  if (user && (r.pulled || r.removed || r.pushed)) log_(user, 'Takvim eşitlendi: ' + r.pushed + ' gönderildi, ' + r.pulled + ' takvimden güncellendi, ' + r.removed + ' kaldırıldı', null);
  return r;
}

function etkinlikSil_(S, id) {
  if (!TAKVIM_SUNUCU) return;
  var m = (S.meetings || []).find(function (z) { return z.id === id; });
  if (!m || !m.ev) return;
  try { var ev = etkinlik_(takvim_(), m.ev); if (ev) ev.deleteEvent(); } catch (err) {}
}

/* Saatlik tetikleyici ve menü: Takvimdeki değişiklikleri çeker, eksikleri gönderir. */
function takvimEsitle() {
  if (!TAKVIM_SUNUCU) return null;
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var S = oku_();
    var r = takvimEsitle_(S, 'Otomatik eşitleme');
    yaz_(S); revArtir_();
    return r;
  } finally { lock.releaseLock(); }
}

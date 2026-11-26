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
    sh.getRange(2, 10, rows.length, 1).setFormulas(kalan.map(function (f) { return [f[0].replace(/;/g, ',')]; }));
  }
  ozetYaz_(S);
  toplantiYaz_(S);
}

function ozetYaz_(S) {
  var ss = ss_(), sh = ss.getSheetByName(OZET) || ss.insertSheet(OZET);
  sh.clear();
  sh.getRange(1, 1, 1, 9).setValues([['#', 'Aşama', 'Adım', 'Bitti', 'Devam', 'Engel', 'İlerleme', 'Plan bütçe', 'Harcanan']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#111111');
  var rows = S.phases.map(function (p, i) {
    var n = i + 2, id = 'Takip!L:L', k = '"' + p.id + '"';
    return [i + 1, p.name, p.steps.length,
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Bitti")',
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Devam")',
      '=COUNTIFS(' + id + ',' + k + ',Takip!C:C,"Engel var")',
      '=IF(C' + n + '=0,0,(D' + n + '+0.5*E' + n + '+0.25*F' + n + ')/C' + n + ')',
      '=SUMIFS(Takip!H:H,' + id + ',' + k + ')',
      '=SUMIFS(Takip!I:I,' + id + ',' + k + ')'];
  });
  if (rows.length) {
    sh.getRange(2, 1, rows.length, 9).setValues(rows);
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('0%').setFontColor('#c2361a').setFontWeight('bold');
    sh.getRange(2, 8, rows.length, 2).setNumberFormat('#,##0 "₺"');
    var t = rows.length + 2;
    sh.getRange(t, 2, 1, 8).setValues([['Toplam', '=SUM(C2:C' + (t - 1) + ')', '=SUM(D2:D' + (t - 1) + ')', '=SUM(E2:E' + (t - 1) + ')', '=SUM(F2:F' + (t - 1) + ')',
      '=IF(C' + t + '=0,0,(D' + t + '+0.5*E' + t + '+0.25*F' + t + ')/C' + t + ')', '=SUM(H2:H' + (t - 1) + ')', '=SUM(I2:I' + (t - 1) + ')']]).setFontWeight('bold');
    sh.getRange(t, 7).setNumberFormat('0%');
    sh.getRange(t, 8, 1, 2).setNumberFormat('#,##0 "₺"');
  }
  sh.setColumnWidth(1, 40); sh.setColumnWidth(2, 320);
  sh.setFrozenRows(1);
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

  var sh = ss.getSheetByName(SAYFA) || ss.insertSheet(SAYFA, 0);
  sh.getRange(1, 1, 1, BASLIK.length).setValues([BASLIK]).setFontWeight('bold').setFontColor('#767676').setBackground('#f2f2f2');
  sh.setFrozenRows(1);
  var w = [70, 220, 100, 420, 150, 100, 100, 110, 110, 110, 300, 90, 90];
  w.forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
  sh.hideColumns(12, 2);
  sh.getRange('F2:G').setNumberFormat('dd.mm.yyyy');
  sh.getRange('H2:J').setNumberFormat('#,##0 "₺"');
  sh.getRange('D2:D').setWrap(true); sh.getRange('K2:K').setWrap(true);
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Bekliyor', 'Devam', 'Bitti', 'Engel var'], true).setAllowInvalid(false).build());

  var C = sh.getRange('C2:C'), D = sh.getRange('A2:K');
  var kural = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Bitti').setBackground('#111111').setFontColor('#ffffff').setRanges([C]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Devam').setBackground('#ff5a36').setFontColor('#111111').setRanges([C]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Engel var').setBackground('#ffe9e3').setFontColor('#c2361a').setRanges([C]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER($G2),$G2<TODAY(),$C2<>"Bitti")').setFontColor('#c2361a').setBold(true).setRanges([sh.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Bitti"').setStrikethrough(true).setFontColor('#767676').setRanges([sh.getRange('D2:D')]).build()
  ];
  sh.setConditionalFormatRules(kural);
  if (!ss.getSheetByName(OZET)) ss.insertSheet(OZET, 1);
  ['Sayfa1', 'Sheet1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && ss.getSheets().length > 2 && s.getLastRow() === 0) ss.deleteSheet(s); });

  var ts = ss.getSheetByName(TOPLANTI) || ss.insertSheet(TOPLANTI);
  ts.getRange(1, 1, 1, TBASLIK.length).setValues([TBASLIK]).setFontWeight('bold').setFontColor('#767676').setBackground('#f2f2f2');
  ts.setFrozenRows(1); ts.hideColumns(10, 5);
  [100, 80, 80, 280, 160, 240, 200, 280, 120].forEach(function (px, i) { ts.setColumnWidth(i + 1, px); });
  ts.getRange('A2:A').setNumberFormat('dd.mm.yyyy'); ts.getRange('B2:C').setNumberFormat('@');
  var gs = ss.getSheetByName(GECMIS) || ss.insertSheet(GECMIS);
  gs.getRange(1, 1, 1, GBASLIK.length).setValues([GBASLIK]).setFontWeight('bold').setFontColor('#767676').setBackground('#f2f2f2');
  gs.setFrozenRows(1); gs.hideColumns(5, 2);
  [150, 140, 560, 160].forEach(function (px, i) { gs.setColumnWidth(i + 1, px); });

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

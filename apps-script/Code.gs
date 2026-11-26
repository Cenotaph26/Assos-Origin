/**
 * Origin Kuruluş Takibi — Google E-Tablolar arka ucu
 *
 * Bu dosya, takip panelinin (GitHub Pages) verilerini Google E-Tablo'da saklar.
 * - "Takip" sayfası: tüm aşama ve adımlar (asıl veri). Elle de düzenlenebilir; panel değişikliği görür.
 * - "Özet" sayfası: aşama başına ilerleme ve bütçe (otomatik).
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

var BASLIK = ['Aşama no', 'Aşama', 'Durum', 'Adım', 'Sorumlu', 'Başlangıç', 'Bitiş', 'Plan bütçe', 'Harcanan', 'Kalan', 'Not', 'asama_id', 'adim_id'];
var LBL = { bekliyor: 'Bekliyor', devam: 'Devam', bitti: 'Bitti', engel: 'Engel var' };
var KOD = { 'bekliyor': 'bekliyor', 'devam': 'devam', 'bitti': 'bitti', 'engel var': 'engel', 'engel': 'engel' };

/* ---------------- Web uygulaması ---------------- */

function doGet(e) {
  var q = (e && e.parameter) || {};
  if (!sifreDogru_(q.pin)) return json_({ ok: false, error: 'auth' });
  var rev = Number(props_().getProperty('rev') || 0);
  if (q.rev && Number(q.rev) === rev) return json_({ ok: true, same: true, rev: rev });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return json_({ ok: true, rev: Number(props_().getProperty('rev') || 0), state: oku_() });
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (!sifreDogru_(body.pin)) return json_({ ok: false, error: 'auth' });
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var S = oku_();
    (body.ops || []).forEach(function (op) { applyOp(S, op); });
    yaz_(S);
    var rev = revArtir_();
    return json_({ ok: true, rev: rev, state: oku_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}

/* ---------------- Veri işlemleri (js/ops.js ile aynı) ---------------- */

function findPhase(S, id) { return S.phases.find(function (p) { return p.id === id; }); }
function applyOp(S, op) {
  var p = op.p ? findPhase(S, op.p) : null, i;
  switch (op.t) {
    case 'set':
      if (!p) return S;
      var x = p.steps.find(function (s) { return s.id === op.s; });
      if (x && ['t', 'who', 's', 'e', 'plan', 'act', 'st', 'note'].indexOf(op.f) >= 0) x[op.f] = String(op.v == null ? '' : op.v);
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
  var S = { phases: [] };
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
  try { if (e && e.range && e.range.getSheet().getName() === SAYFA) revArtir_(); } catch (err) {}
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

  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'gunlukYedek') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gunlukYedek').timeBased().everyDays(1).atHour(23).inTimezone(SAAT_DILIMI).create();
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

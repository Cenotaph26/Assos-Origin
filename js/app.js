/* Origin Kuruluş Takibi — panel mantığı ve Google E-Tablo eşitlemesi. */
(function () {
'use strict';
const CFG = window.ORIGIN_CONFIG || {};
const { applyOp } = window.OriginOps;
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const ORDER = ['bekliyor','devam','bitti','engel'];
const LABEL = {bekliyor:'Bekliyor',devam:'Devam',bitti:'Bitti',engel:'Engel var'};
const W = {bitti:1,devam:.5,engel:.25,bekliyor:0};
const D0 = new Date();
const today = `${D0.getFullYear()}-${String(D0.getMonth()+1).padStart(2,'0')}-${String(D0.getDate()).padStart(2,'0')}`;
const tl = new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0});
const uid = () => Math.random().toString(36).slice(2,10);
const num = v => { let t = String(v ?? '').trim(); if (!t) return 0; if (t.includes(',')) t = t.replace(/\./g,'').replace(',','.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g,''); const n = parseFloat(t); return isNaN(n) ? 0 : n; };
const late = x => x.e && x.e < today && x.st !== 'bitti';
const pct = steps => steps.length ? Math.round(steps.reduce((a,x)=>a+(W[x.st]||0),0)/steps.length*100) : 0;

/* ---------- yerel saklama ---------- */
const K = {base:'origin.base', rev:'origin.rev', pending:'origin.pending', pin:'origin.pin', api:'origin.api', asked:'origin.asked'};
const ls = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const SEED = JSON.parse($('#seed').textContent);
const META = { title: SEED.title, sub: SEED.sub, next: SEED.next };

let base = ls.get(K.base, null);
let fresh = !base;                       // bu cihazda ilk açılış
if (!base) base = { phases: clone(SEED.phases) };
let rev = ls.get(K.rev, 0);
let pending = ls.get(K.pending, []);
let inflight = null;
let S = view();
let hist = [], armed = null, syncT = null, retryT = null, needRender = false, lastOk = null;

const api = () => (ls.get(K.api, '') || CFG.apiUrl || '').trim();
const pin = () => ls.get(K.pin, '');
const connected = () => !!(api() && pin());

function view(){ const v = clone(base); (inflight||[]).concat(pending).forEach(op => applyOp(v, op)); return v; }
function persist(){ ls.set(K.base, base); ls.set(K.rev, rev); ls.set(K.pending, (inflight||[]).concat(pending)); }

/* ---------- durum göstergesi ---------- */
function status(kind, text){ $('#dot').className = 'dot ' + kind; $('#savet').textContent = text; }
function idleStatus(){
  if (!connected()) return status('off', 'Sadece bu cihazda');
  const n = (inflight||[]).length + pending.length;
  if (n) return status('err', `Çevrimdışı · ${n} değişiklik bekliyor`);
  status('ok', lastOk ? 'Kaydedildi · ' + lastOk : 'Eşitlendi');
}
const hhmm = () => new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});

/* ---------- sunucu ---------- */
async function get(){
  const u = api() + (api().includes('?') ? '&' : '?') + 'action=get&pin=' + encodeURIComponent(pin()) + '&rev=' + encodeURIComponent(rev) + '&_=' + Date.now();
  const r = await fetch(u, {cache:'no-store', redirect:'follow'});
  return r.json();
}
async function post(ops){
  const r = await fetch(api(), {method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({pin: pin(), ops})});
  return r.json();
}

function adopt(state, newRev){
  base = { phases: state.phases || [] }; rev = newRev;
  S = view(); persist();
  if (editing()) needRender = true; else render();
}

async function pull(){
  if (!connected() || inflight || pending.length) return;
  try {
    const r = await get();
    if (!r.ok) { if (r.error === 'auth') return askPin('Şifre geçersiz. Lütfen tekrar girin.'); throw new Error(r.error); }
    if (!r.same) {
      if (!r.state.phases.length) {               // e-tablo boş: bu cihazdaki listeyle doldur
        pending.unshift({t:'seed', phases: clone(base.phases)}); fresh = false; persist(); return sync();
      }
      fresh = false;
      adopt(r.state, r.rev);
    }
    lastOk = lastOk || hhmm(); idleStatus();
  } catch(e) { status('err', 'Bağlantı yok · yeniden denenecek'); }
}

async function sync(){
  clearTimeout(syncT); clearTimeout(retryT);
  if (!connected() || inflight || !pending.length) return;
  inflight = pending; pending = []; persist();
  status('busy', 'Kaydediliyor…');
  try {
    const r = await post(inflight);
    if (!r.ok) {
      if (r.error === 'auth') { pending = inflight.concat(pending); inflight = null; persist(); return askPin('Şifre geçersiz. Lütfen tekrar girin.'); }
      throw new Error(r.error);
    }
    inflight = null; lastOk = hhmm();
    adopt(r.state, r.rev);
    idleStatus();
    if (pending.length) sync();
  } catch(e) {
    pending = (inflight||[]).concat(pending); inflight = null; persist();
    idleStatus();
    retryT = setTimeout(sync, 15000);
  }
}
const schedule = () => { clearTimeout(syncT); syncT = setTimeout(sync, 800); };

/* ---------- işlem uygula ---------- */
function act(op, inv){
  if (inv) { hist.push(inv); if (hist.length > 60) hist.shift(); $('#undo').disabled = false; }
  applyOp(S, op);
  if (connected()) { pending.push(op); schedule(); status('busy', 'Kaydediliyor…'); }
  else { base = clone(S); }
  persist(); render();
}

/* ---------- çizim ---------- */
function renderTop(){
  const all = S.phases.flatMap(p=>p.steps);
  const done = all.filter(x=>x.st==='bitti').length;
  const plan = all.reduce((a,x)=>a+num(x.plan),0), spent = all.reduce((a,x)=>a+num(x.act),0);
  const lt = all.filter(late).length, bl = all.filter(x=>x.st==='engel').length;
  $('#kpis').innerHTML = [
    [pct(all)+'%','Genel ilerleme'],
    [done+' / '+all.length,'Biten adım'],
    [lt+bl,'Geciken + engelli'],
    [plan?tl.format(plan):'—','Planlanan bütçe'],
    [spent?tl.format(spent):'—','Harcanan']
  ].map(([b,s])=>`<div class="kpi"><b>${esc(b)}</b><span>${s}</span></div>`).join('');
  $('#route').innerHTML = S.phases.map((p,i)=>{
    const v = pct(p.steps), f = p.steps.filter(x=>late(x)||x.st==='engel').length, d = p.steps.filter(x=>x.st==='bitti').length;
    return `<button class="st${v===100?' full':''}" data-go="${esc(p.id)}"><span class="n">${i+1}. ${esc(p.name)}</span>${f?`<span class="flag" title="Geciken veya engelli adım">${f}</span>`:''}<span><span class="p" style="display:block">${v}<small>%</small></span><span class="c">${d}/${p.steps.length} adım bitti</span><span class="tray"><i style="height:${v}%"></i></span></span></button>`;
  }).join('') + (META.next ? `<div class="st next"><span class="n">Sonraki: ${esc(META.next)}</span><span class="tray" style="background:transparent"></span></div>` : '');
  const whos = [...new Set(all.map(x=>String(x.who||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const fw = $('#fw'), cur = fw.value;
  fw.innerHTML = '<option value="">Tüm sorumlular</option>' + whos.map(w=>`<option${w===cur?' selected':''}>${esc(w)}</option>`).join('');
}

function visible(x){
  const q = $('#q').value.trim().toLocaleLowerCase('tr'), fs = $('#fs').value, fw = $('#fw').value;
  if (q && !(x.t+' '+x.who+' '+x.note).toLocaleLowerCase('tr').includes(q)) return false;
  if (fs === 'late') { if (!late(x)) return false; } else if (fs && x.st !== fs) return false;
  if (fw && String(x.who||'').trim() !== fw) return false;
  return true;
}

function row(p,x){
  return `<tr class="${late(x)?'late':''} ${x.st==='bitti'?'done':''}" data-p="${esc(p.id)}" data-s="${esc(x.id)}">
  <td data-l="Durum"><button class="pill s-${esc(x.st)}" data-act="cycle" aria-label="Durumu değiştir: ${LABEL[x.st]||esc(x.st)}">${LABEL[x.st]||esc(x.st)}</button></td>
  <td class="t" data-l="Adım"><textarea rows="1" data-f="t" aria-label="Adım" placeholder="Adım adı">${esc(x.t)}</textarea></td>
  <td data-l="Sorumlu"><input data-f="who" value="${esc(x.who)}" aria-label="Sorumlu"></td>
  <td data-l="Başlangıç"><input type="date" data-f="s" value="${esc(x.s)}" aria-label="Başlangıç"></td>
  <td class="e" data-l="Bitiş${late(x)?' (gecikti)':''}"><input type="date" data-f="e" value="${esc(x.e)}" aria-label="Bitiş"></td>
  <td data-l="Plan bütçe ₺"><input class="money" inputmode="decimal" data-f="plan" value="${esc(x.plan)}" aria-label="Planlanan bütçe"></td>
  <td data-l="Harcanan ₺"><input class="money" inputmode="decimal" data-f="act" value="${esc(x.act)}" aria-label="Harcanan"></td>
  <td class="no" data-l="Not"><textarea rows="1" data-f="note" aria-label="Not" placeholder="Not">${esc(x.note)}</textarea></td>
  <td class="x"><button class="ic del${armed===x.id?' arm':''}" data-act="delStep" aria-label="Adımı sil" title="${armed===x.id?'Silmek için tekrar dokunun':'Sil'}">${armed===x.id?'?':'×'}</button></td></tr>`;
}

function render(){
  needRender = false;
  renderTop();
  const filt = $('#q').value || $('#fs').value || $('#fw').value;
  const html = S.phases.map((p,i)=>{
    const rows = p.steps.filter(visible);
    if (filt && !rows.length) return '';
    const plan = p.steps.reduce((a,x)=>a+num(x.plan),0), spent = p.steps.reduce((a,x)=>a+num(x.act),0);
    return `<section class="ph" id="ph-${esc(p.id)}" data-p="${esc(p.id)}">
    <div class="phh"><span class="num">${i+1}</span>
      <input class="name" data-pf="name" value="${esc(p.name)}" aria-label="Aşama başlığı">
      <span class="meter"><div><i style="width:${pct(p.steps)}%"></i></div>${pct(p.steps)}% · ${p.steps.filter(x=>x.st==='bitti').length}/${p.steps.length}</span>
      <button class="ic" data-act="up" aria-label="Yukarı taşı" ${i?'':'disabled'}>↑</button>
      <button class="ic" data-act="down" aria-label="Aşağı taşı" ${i<S.phases.length-1?'':'disabled'}>↓</button>
      <button class="ic del${armed===p.id?' arm':''}" data-act="delPh" aria-label="Aşamayı sil" title="${armed===p.id?'Tüm adımlarıyla silmek için tekrar dokunun':'Aşamayı sil'}">${armed===p.id?'?':'×'}</button>
    </div>
    <div class="scroll"><table><thead><tr><th>Durum</th><th>Adım</th><th>Sorumlu</th><th>Başlangıç</th><th>Bitiş</th><th>Plan ₺</th><th>Harcanan ₺</th><th>Not</th><th></th></tr></thead>
    <tbody>${rows.map(x=>row(p,x)).join('') || '<tr><td colspan="9" class="empty">Bu aşamada adım yok</td></tr>'}</tbody>
    ${(plan||spent)?`<tbody class="tot"><tr><td colspan="9">Plan ${tl.format(plan)} · Harcanan ${tl.format(spent)} · Kalan ${tl.format(plan-spent)}</td></tr></tbody>`:''}</table></div>
    <div class="add"><button class="btn" data-act="addStep">+ Adım ekle</button></div></section>`;
  }).join('');
  $('#phases').innerHTML = html || '<div class="empty">Filtreye uyan adım yok</div>';
  refit(); requestAnimationFrame(refit);
}
const FS = window.CSS?.supports?.('field-sizing','content');
function fit(t){ if (FS) return; t.style.height='auto'; t.style.height=(t.scrollHeight+2)+'px'; }
function refit(){ document.querySelectorAll('td textarea').forEach(fit); }
function editing(){ const a = document.activeElement; return !!(a && a.closest && a.closest('#phases') && /INPUT|TEXTAREA/.test(a.tagName)); }

/* ---------- olaylar ---------- */
const P = id => S.phases.find(p=>p.id===id);
document.addEventListener('click', e=>{
  const go = e.target.closest('[data-go]');
  if (go) { document.getElementById('ph-'+go.dataset.go)?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
  const b = e.target.closest('[data-act]'); if (!b) { if (armed){ armed=null; render(); } return; }
  const sec = b.closest('[data-p]'), p = sec && P(sec.dataset.p); if (!p) return;
  const tr = b.closest('tr[data-s]'), x = tr && p.steps.find(s=>s.id===tr.dataset.s);
  const a = b.dataset.act;
  if (a==='cycle' && x){ const v = ORDER[(ORDER.indexOf(x.st)+1)%ORDER.length]; act({t:'set',p:p.id,s:x.id,f:'st',v}, {t:'set',p:p.id,s:x.id,f:'st',v:x.st}); }
  else if (a==='delStep' && x){ if (armed!==x.id){ armed=x.id; render(); return; } armed=null; const i=p.steps.indexOf(x); act({t:'delStep',p:p.id,s:x.id}, {t:'addStep',p:p.id,i,step:clone(x)}); }
  else if (a==='delPh'){ if (armed!==p.id){ armed=p.id; render(); return; } armed=null; const i=S.phases.indexOf(p); act({t:'delPhase',p:p.id}, {t:'addPhase',i,phase:clone(p)}); }
  else if (a==='up'||a==='down'){ const d = a==='up'?-1:1; act({t:'move',p:p.id,d}, {t:'move',p:p.id,d:-d}); }
  else if (a==='addStep'){
    const step = {id:uid(),t:'',who:'',s:'',e:'',plan:'',act:'',st:'bekliyor',note:''};
    $('#q').value=''; $('#fs').value=''; $('#fw').value='';
    act({t:'addStep',p:p.id,step}, {t:'delStep',p:p.id,s:step.id});
    document.querySelector(`tr[data-s="${step.id}"] textarea`)?.focus();
  }
});
document.addEventListener('change', e=>{
  const el = e.target, sec = el.closest && el.closest('#phases [data-p]'); if (!sec) return;
  const p = P(sec.dataset.p); if (!p) return;
  if (el.dataset.pf){ const v = el.value.trim() || 'Adsız aşama'; if (v!==p.name) act({t:'pname',p:p.id,v}, {t:'pname',p:p.id,v:p.name}); return; }
  const tr = el.closest('tr[data-s]'); if (!tr || !el.dataset.f) return;
  const x = p.steps.find(s=>s.id===tr.dataset.s); if (!x) return;
  const f = el.dataset.f, v = el.value.trim();
  if (v !== String(x[f]??'')) act({t:'set',p:p.id,s:x.id,f,v}, {t:'set',p:p.id,s:x.id,f,v:x[f]});
});
document.addEventListener('focusout', ()=>{ setTimeout(()=>{ if (needRender && !editing()) render(); }, 0); });
document.addEventListener('input', e=>{ if (e.target.matches && e.target.matches('td textarea')) fit(e.target); });
$('#q').addEventListener('input', render);
$('#fs').addEventListener('change', render);
$('#fw').addEventListener('change', render);
$('#addPh').addEventListener('click', ()=>{
  const phase = {id:uid(), name:'Yeni aşama', steps:[]};
  act({t:'addPhase',phase}, {t:'delPhase',p:phase.id});
  const s = document.getElementById('ph-'+phase.id); s?.scrollIntoView({block:'start'}); s?.querySelector('input.name')?.select();
});
$('#undo').addEventListener('click', ()=>{ const inv = hist.pop(); if (!inv) return; $('#undo').disabled = !hist.length; act(inv, null); });

/* ---------- Excel ---------- */
function loadXL(){ return window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'; s.onload=()=>res(window.ExcelJS); s.onerror=()=>rej(new Error('lib')); document.head.appendChild(s); }); }
$('#xl').addEventListener('click', async ()=>{
  const b = $('#xl'); b.disabled = true; b.textContent = 'Hazırlanıyor…';
  try {
    const X = await loadXL();
    const wb = window.buildWorkbook(X, {...S, title: META.title || $('#ttl').textContent, sub: META.sub || $('#sub').textContent}, today);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Origin-Kurulus-Takibi-${today}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  } catch(e) { status('err', 'Excel oluşturulamadı, bağlantıyı kontrol edin'); setTimeout(idleStatus, 4000); }
  b.disabled = false; b.textContent = "Excel'e aktar";
});

/* ---------- bağlantı penceresi ---------- */
const dlg = $('#dlg');
function openDlg(msg){
  $('#pin').value = pin(); $('#api').value = api();
  $('#adv').open = !api();
  $('#dlgErr').textContent = msg || '';
  if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open','');
  setTimeout(()=>$(api() ? '#pin' : '#api').focus(), 50);
}
function askPin(msg){ status('err', 'Şifre gerekli'); openDlg(msg); }
$('#set').addEventListener('click', ()=>openDlg());
$('#dlgLocal').addEventListener('click', ()=>{ ls.set(K.asked, true); dlg.close?.(); dlg.removeAttribute('open'); idleStatus(); });
$('#dlgF').addEventListener('submit', async e=>{
  e.preventDefault();
  const p = $('#pin').value.trim(), u = $('#api').value.trim() || CFG.apiUrl || '';
  if (!u) { $('#dlgErr').textContent = 'Önce bağlantı adresini girin.'; $('#adv').open = true; return; }
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) { $('#dlgErr').textContent = 'Adres script.google.com ile başlamalı.'; return; }
  $('#dlgOk').disabled = true; $('#dlgErr').textContent = 'Bağlanılıyor…';
  const oldPin = pin(), oldApi = ls.get(K.api,'');
  ls.set(K.pin, p); ls.set(K.api, u === CFG.apiUrl ? '' : u);
  try {
    const savedRev = rev; rev = -1;
    const r = await get(); rev = savedRev;
    if (!r.ok) throw new Error(r.error === 'auth' ? 'Şifre yanlış.' : 'Sunucu hatası: ' + r.error);
    ls.set(K.asked, true);
    dlg.close?.(); dlg.removeAttribute('open');
    if (!r.state.phases.length) { pending.unshift({t:'seed', phases: clone(base.phases)}); persist(); sync(); }
    else if (pending.length) { adopt(r.state, r.rev); sync(); }
    else { adopt(r.state, r.rev); lastOk = hhmm(); idleStatus(); }
  } catch(err) {
    ls.set(K.pin, oldPin); ls.set(K.api, oldApi);
    $('#dlgErr').textContent = err.message === 'Failed to fetch' ? 'Adrese ulaşılamadı. Web uygulamasının "Herkes" erişimiyle dağıtıldığını kontrol edin.' : err.message;
  }
  $('#dlgOk').disabled = false;
});

/* ---------- başlat ---------- */
if (META.title) { $('#ttl').textContent = META.title; document.title = META.title; }
if (META.sub) $('#sub').textContent = META.sub;
render();
document.fonts?.ready?.then(refit);
let rz; window.addEventListener('resize', ()=>{ clearTimeout(rz); rz = setTimeout(refit,150); });
idleStatus();
if (connected()) { if (pending.length) sync(); else pull(); }
else if (!ls.get(K.asked, false)) openDlg();
setInterval(()=>{ if (document.visibilityState==='visible') { if (pending.length) sync(); else pull(); } }, Math.max(10, CFG.pollSeconds||30)*1000);
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') pull(); });
window.addEventListener('online', ()=>{ sync(); pull(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

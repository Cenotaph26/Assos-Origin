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
const K = {open:'origin.open', sheet:'origin.sheet', base:'origin.base', rev:'origin.rev', pending:'origin.pending', pin:'origin.pin', api:'origin.api', asked:'origin.asked'};
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
let openSet = new Set(ls.get('origin.open', [])), sheetUrl = '';
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

function noteSheet(r){ if (r && r.sheetUrl) sheetUrl = r.sheetUrl; }
function adopt(state, newRev){
  base = { phases: state.phases || [] }; rev = newRev;
  S = view(); persist();
  if (editing()) needRender = true; else render();
}

async function pull(){
  if (!connected() || inflight || pending.length) return;
  try {
    const r = await get(); noteSheet(r);
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
    const r = await post(inflight); noteSheet(r);
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
  const ops = Array.isArray(op) ? op : [op];
  if (inv) { hist.push(inv); if (hist.length > 60) hist.shift(); $('#undo').disabled = false; }
  ops.forEach(o => applyOp(S, o));
  if (connected()) { pending.push(...ops); schedule(); status('busy', 'Kaydediliyor…'); }
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
  $('#cards').innerHTML = S.phases.map((p,i)=>{
    const v = pct(p.steps), f = p.steps.filter(x=>late(x)||x.st==='engel').length, d = p.steps.filter(x=>x.st==='bitti').length, dv = p.steps.filter(x=>x.st==='devam').length;
    return `<button class="card${v===100?' full':''}${openSet.has(p.id)?' on':''}" data-go="${esc(p.id)}" aria-label="${esc(p.name)} aşamasını aç">
      <span class="ct"><span class="cn">${i+1}</span><span class="cname">${esc(p.name)}</span>${f?`<span class="cflag" title="Geciken veya engelli adım">${f} uyarı</span>`:''}</span>
      <span class="big">${v}<small>%</small></span>
      <span class="cs"><span>${d}/${p.steps.length} adım bitti</span>${dv?`<span>${dv} devam ediyor</span>`:''}</span>
      <span class="cbar"><i style="width:${v}%"></i></span></button>`;
  }).join('') + (META.next ? `<div class="card nextc"><span class="ct"><span class="cn">→</span><span class="cname">Sonraki: ${esc(META.next)}</span></span></div>` : '');
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
  <td data-l="Durum"><span class="grip" aria-hidden="true" title="Basılı tutup sürükleyin">⋮⋮</span><button class="pill s-${esc(x.st)}" data-act="cycle" aria-label="Durumu değiştir: ${LABEL[x.st]||esc(x.st)}">${LABEL[x.st]||esc(x.st)}</button></td>
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
    const open = openSet.has(p.id) || !!filt, v = pct(p.steps);
    return `<section class="ph${open?'':' closed'}" id="ph-${esc(p.id)}" data-p="${esc(p.id)}">
    <div class="phh" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}"><span class="num">${i+1}</span>
      <span class="pname">${esc(p.name)}</span>
      <span class="meter"><div><i style="width:${v}%"></i></div>${v}% · ${p.steps.filter(x=>x.st==='bitti').length}/${p.steps.length}</span>
      <span class="chev" aria-hidden="true">⌄</span>
    </div>
    <div class="phbody">
    <div class="phctl">
      <input class="name" data-pf="name" value="${esc(p.name)}" aria-label="Aşama başlığı">
      <button class="ic" data-act="up" aria-label="Aşamayı yukarı taşı" ${i?'':'disabled'}>↑</button>
      <button class="ic" data-act="down" aria-label="Aşamayı aşağı taşı" ${i<S.phases.length-1?'':'disabled'}>↓</button>
      <button class="ic del${armed===p.id?' arm':''}" data-act="delPh" aria-label="Aşamayı sil" title="${armed===p.id?'Tüm adımlarıyla silmek için tekrar dokunun':'Aşamayı sil'}">${armed===p.id?'?':'×'}</button>
    </div>
    <div class="scroll"><table><thead><tr><th>Durum</th><th>Adım</th><th>Sorumlu</th><th>Başlangıç</th><th>Bitiş</th><th>Plan ₺</th><th>Harcanan ₺</th><th>Not</th><th></th></tr></thead>
    <tbody>${rows.map(x=>row(p,x)).join('') || '<tr class="emptyrow"><td colspan="9" class="empty">Bu aşamada adım yok</td></tr>'}</tbody>
    ${(plan||spent)?`<tbody class="tot"><tr><td colspan="9">Plan ${tl.format(plan)} · Harcanan ${tl.format(spent)} · Kalan ${tl.format(plan-spent)}</td></tr></tbody>`:''}</table></div>
    <div class="add"><button class="btn" data-act="addStep">+ Adım ekle</button></div></div></section>`;
  }).join('');
  $('#phases').innerHTML = html || '<div class="empty">Filtreye uyan adım yok</div>';
  refit(); requestAnimationFrame(refit);
}
const FS = window.CSS?.supports?.('field-sizing','content');
function fit(t){ if (FS) return; t.style.height='auto'; t.style.height=(t.scrollHeight+2)+'px'; }
function refit(){ document.querySelectorAll('td textarea').forEach(fit); }
function editing(){ const a = document.activeElement; return !!(a && a.closest && a.closest('#phases') && /INPUT|TEXTAREA/.test(a.tagName)); }

function saveOpen(){ ls.set(K.open, [...openSet]); }
function openPhase(id, scroll){
  openSet.add(id); saveOpen(); render();
  if (scroll) requestAnimationFrame(()=>document.getElementById('ph-'+id)?.scrollIntoView({behavior:'smooth',block:'start'}));
}
/* ---------- olaylar ---------- */
const P = id => S.phases.find(p=>p.id===id);
document.addEventListener('click', e=>{
  const go = e.target.closest('[data-go]');
  if (go) { openPhase(go.dataset.go, true); return; }
  if (dragJustEnded) { dragJustEnded = false; return; }
  const b = e.target.closest('[data-act]'); if (!b) { if (armed){ armed=null; render(); } return; }
  const sec = b.closest('[data-p]'), p = sec && P(sec.dataset.p); if (!p) return;
  const tr = b.closest('tr[data-s]'), x = tr && p.steps.find(s=>s.id===tr.dataset.s);
  const a = b.dataset.act;
  if (a==='toggle'){ if (openSet.has(p.id)) openSet.delete(p.id); else openSet.add(p.id); saveOpen(); render(); return; }
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
  openSet.add(phase.id); saveOpen();
  act({t:'addPhase',phase}, {t:'delPhase',p:phase.id});
  const s = document.getElementById('ph-'+phase.id); s?.scrollIntoView({block:'start'}); s?.querySelector('input.name')?.select();
});
$('#undo').addEventListener('click', ()=>{ const inv = hist.pop(); if (!inv) return; $('#undo').disabled = !hist.length; act(inv, null); });


/* ---------- E-Tabloya aktar ---------- */
const sheetLink = () => ls.get(K.sheet, '') || CFG.sheetUrl || sheetUrl || '';
$('#gs').addEventListener('click', async ()=>{
  if (!connected()) { openDlg('E-Tabloya aktarmak için önce bağlanın.'); return; }
  const url = sheetLink();
  if (!url) { openDlg('E-Tablo bağlantısını bir kez girin; sonra düğme e-tabloyu doğrudan açar.'); setTimeout(()=>$('#sheet').focus(), 80); return; }
  const w = window.open('', '_blank');
  const b = $('#gs'); b.disabled = true; b.textContent = 'Aktarılıyor…';
  try { if (pending.length || inflight) { await sync(); let n = 0; while ((inflight || pending.length) && n++ < 40) await new Promise(r=>setTimeout(r,250)); } }
  finally { b.disabled = false; b.textContent = 'E-Tabloya aktar'; }
  if (pending.length || inflight) status('err', 'Bağlantı yok, değişiklikler sonra aktarılacak');
  if (w) w.location.href = url; else location.href = url;
});
$('#expand').addEventListener('click', ()=>{
  const all = S.phases.every(p=>openSet.has(p.id));
  openSet = all ? new Set() : new Set(S.phases.map(p=>p.id)); saveOpen(); render();
  $('#expand').textContent = all ? 'Tümünü aç' : 'Tümünü kapat';
});
document.addEventListener('keydown', e=>{
  const t = e.target.closest && e.target.closest('.phh');
  if (t && (e.key==='Enter' || e.key===' ')) { e.preventDefault(); t.click(); }
});

/* ---------- sürükle bırak (basılı tut) ---------- */
let press = null, drag = null, dragJustEnded = false, autoT = null;
const line = document.createElement('div'); line.className = 'dropline'; document.body.appendChild(line);
function pressStart(x, y, target){
  if (drag || target.closest('input,textarea,select,.ic,.add')) return;
  const tr = target.closest('#phases tbody tr[data-s]'); if (!tr) return;
  const grip = !!target.closest('.grip');
  press = {tr, x0:x, y0:y, grip, t: setTimeout(()=>beginDrag(x, y), grip ? 120 : 380)};
}
function pressMove(x, y, e){
  if (drag) { if (e.cancelable) e.preventDefault(); moveDrag(x, y); return; }
  if (!press) return;
  const dist = Math.hypot(x-press.x0, y-press.y0);
  if (press.grip && dist > 4) { clearTimeout(press.t); if (e.cancelable) e.preventDefault(); beginDrag(x, y); }
  else if (!press.grip && dist > 8) { clearTimeout(press.t); press = null; }
}
function pressEnd(){
  if (press) { clearTimeout(press.t); press = null; }
  if (drag) endDrag();
}
function beginDrag(x, y){
  if (!press) return;
  const tr = press.tr; press = null;
  const sec = tr.closest('[data-p]'), p = P(sec.dataset.p), s = p && p.steps.find(z=>z.id===tr.dataset.s); if (!s) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  navigator.vibrate?.(12);
  const g = document.createElement('div'); g.className = 'ghost';
  g.innerHTML = `<span class="pill s-${esc(s.st)}">${LABEL[s.st]||''}</span><span></span>`;
  g.lastChild.textContent = s.t || 'Adsız adım';
  document.body.appendChild(g);
  drag = {p:p.id, s:s.id, tr, g, target:null};
  tr.classList.add('dragging'); document.body.classList.add('dragmode');
  moveDrag(x, y);
}
function moveDrag(x, y){
  const d = drag; d.g.style.transform = `translate(${Math.min(x+14, innerWidth-80)}px,${y+10}px)`;
  d.x = x; d.y = y;
  document.querySelectorAll('.ph.droptarget').forEach(e=>e.classList.remove('droptarget'));
  const el = document.elementFromPoint(x, y); line.style.display = 'none'; d.target = null;
  if (!el) return autoScroll(y);
  const row = el.closest('#phases tbody tr[data-s]');
  const sec = el.closest('#phases section.ph');
  if (row && row !== d.tr) {
    const r = row.getBoundingClientRect(), after = y > r.top + r.height/2;
    d.target = {p: row.closest('[data-p]').dataset.p, ref: row.dataset.s, after};
    line.style.display = 'block'; line.style.left = r.left+'px'; line.style.width = r.width+'px'; line.style.top = ((after ? r.bottom : r.top) - 1.5)+'px';
  } else if (sec && !row) {
    d.target = {p: sec.dataset.p, ref: null, after: true};
    sec.classList.add('droptarget');
  }
  autoScroll(y);
}
function autoScroll(y){
  clearInterval(autoT);
  const edge = 80, v = y < edge ? -14 : y > innerHeight - edge ? 14 : 0;
  if (v) autoT = setInterval(()=>{ scrollBy(0, v); if (drag) moveDrag(drag.x, drag.y); }, 16);
}
function endDrag(){
  const d = drag; drag = null; clearInterval(autoT);
  d.g.remove(); line.style.display = 'none'; d.tr.classList.remove('dragging'); document.body.classList.remove('dragmode');
  document.querySelectorAll('.ph.droptarget').forEach(e=>e.classList.remove('droptarget'));
  dragJustEnded = true; setTimeout(()=>{ dragJustEnded = false; }, 350);
  const t = d.target; if (!t) return;
  const from = P(d.p), to = P(t.p); if (!from || !to) return;
  const step = from.steps.find(z=>z.id===d.s); if (!step) return;
  const i0 = from.steps.indexOf(step);
  const rest = to.steps.filter(z=>z.id!==d.s);
  let i = t.ref ? rest.findIndex(z=>z.id===t.ref) + (t.after ? 1 : 0) : rest.length;
  if (from === to && i === i0) return;
  const copy = clone(step);
  openSet.add(to.id); saveOpen();
  act([{t:'delStep',p:from.id,s:step.id},{t:'addStep',p:to.id,i,step:copy}],
      [{t:'delStep',p:to.id,s:step.id},{t:'addStep',p:from.id,i:i0,step:clone(step)}]);
}
document.addEventListener('pointerdown', e=>{ if (e.pointerType === 'mouse' && e.button === 0) pressStart(e.clientX, e.clientY, e.target); });
document.addEventListener('pointermove', e=>{ if (e.pointerType === 'mouse') pressMove(e.clientX, e.clientY, e); });
document.addEventListener('pointerup', e=>{ if (e.pointerType === 'mouse') pressEnd(); });
document.addEventListener('touchstart', e=>{ if (e.touches.length === 1) pressStart(e.touches[0].clientX, e.touches[0].clientY, e.target); }, {passive:true});
document.addEventListener('touchmove', e=>{ const t = e.touches[0]; if (t) pressMove(t.clientX, t.clientY, e); }, {passive:false});
document.addEventListener('touchend', pressEnd);
document.addEventListener('touchcancel', pressEnd);
document.addEventListener('contextmenu', e=>{ if (drag || press) e.preventDefault(); });

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
  b.disabled = false; b.textContent = 'Excel indir';
});

/* ---------- bağlantı penceresi ---------- */
const dlg = $('#dlg');
function openDlg(msg){
  $('#pin').value = pin(); $('#api').value = api(); $('#sheet').value = ls.get(K.sheet, '') || CFG.sheetUrl || '';
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
  const p = $('#pin').value.trim(), u = $('#api').value.trim() || CFG.apiUrl || '', sh = $('#sheet').value.trim();
  if (sh && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sh)) { $('#dlgErr').textContent = 'E-Tablo bağlantısı docs.google.com/spreadsheets ile başlamalı.'; return; }
  ls.set(K.sheet, sh === CFG.sheetUrl ? '' : sh);
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

/* Kişisel Google Takvim eşitlemesi.
   Paneli kullanan kişi kendi Google hesabıyla izin verir; toplantılar ONUN takvimine eklenir.
   Google Identity Services (tarayıcıda OAuth) + Google Calendar API kullanılır. */
(function () {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  const TZ = 'Europe/Istanbul';
  const PREFIX = 'Origin · ';
  const API = 'https://www.googleapis.com/calendar/v3';
  let tok = null, tokExp = 0, client = null, account = '';
  try { account = localStorage.getItem('origin.gcal.account') || ''; } catch (e) {}

  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Google oturum betiği yüklenemedi'));
      document.head.appendChild(s);
    });
  }

  async function token(interactive) {
    if (tok && Date.now() < tokExp - 60000) return tok;
    const id = (window.ORIGIN_CONFIG || {}).googleClientId;
    if (!id) throw Object.assign(new Error('Google istemci kimliği ayarlanmamış'), { code: 'no_client' });
    await loadGis();
    return new Promise((res, rej) => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: id, scope: SCOPE, hint: account || undefined,
        prompt: interactive ? (account ? '' : 'select_account') : 'none',
        callback: r => {
          if (r.error) return rej(Object.assign(new Error(r.error_description || r.error), { code: r.error }));
          tok = r.access_token; tokExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; res(tok);
        },
        error_callback: e => rej(Object.assign(new Error(e.message || e.type || 'popup'), { code: e.type || 'popup' }))
      });
      client.requestAccessToken();
    });
  }

  async function call(method, path, body) {
    const r = await fetch(API + path, {
      method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 204 || r.status === 410) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { tok = null; } throw Object.assign(new Error((j.error && j.error.message) || ('HTTP ' + r.status)), { code: 'api', status: r.status }); }
    return j;
  }

  const storeKey = () => 'origin.gcal.map.' + (account || 'x');
  function loadMap() { try { return JSON.parse(localStorage.getItem(storeKey()) || '{}'); } catch (e) { return {}; } }
  function saveMap(m) { try { localStorage.setItem(storeKey(), JSON.stringify(m)); } catch (e) {} }

  const hash = m => [m.title, m.date, m.start, m.end, m.place, m.note, m.phase, m.who].join('|');
  function addMinutes(date, hhmm, add) {
    const [h, mi] = hhmm.split(':').map(Number); const t = h * 60 + mi + add;
    const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.floor(t / 1440));
    const r = ((t % 1440) + 1440) % 1440;
    return { date: d.toISOString().slice(0, 10), time: String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0') };
  }
  function body(m, phaseName) {
    const end = m.end && m.end > m.start ? { date: m.date, time: m.end } : addMinutes(m.date, m.start, 60);
    const guests = String(m.who || '').split(/[,;\s]+/).filter(x => /@/.test(x));
    return {
      summary: PREFIX + m.title,
      location: m.place || '',
      description: 'Origin Kuruluş Takibi' + (phaseName ? '\nAşama: ' + phaseName : '') + (guests.length ? '\nKatılımcılar: ' + guests.join(', ') : '') + (m.note ? '\n\n' + m.note : ''),
      start: { dateTime: m.date + 'T' + m.start + ':00', timeZone: TZ },
      end: { dateTime: end.date + 'T' + end.time + ':00', timeZone: TZ },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 60 }] },
      extendedProperties: { private: { originApp: 'origin', originId: m.id } }
    };
  }
  const local = s => (s || '').slice(0, 16); // "2026-12-03T09:00:00+03:00" -> "2026-12-03T09:00" (timeZone=Istanbul ile istenir)

  /* meetings: panel toplantıları; phaseName(id); onPull(id, fields) panelde güncelleme yapar. */
  async function sync(meetings, phaseName, onPull, interactive) {
    await token(interactive);
    let evs = [], page = '';
    do {
      const q = '/calendars/primary/events?privateExtendedProperty=' + encodeURIComponent('originApp=origin') + '&maxResults=250&timeZone=' + encodeURIComponent(TZ) + (page ? '&pageToken=' + page : '');
      const r = await call('GET', q); evs = evs.concat(r.items || []); page = r.nextPageToken || '';
      if (r.summary && r.summary !== account) { account = r.summary; try { localStorage.setItem('origin.gcal.account', account); } catch (e) {} }
    } while (page);
    const map = loadMap();
    const byId = {}; evs.forEach(e => { const id = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.originId; if (id) byId[id] = e; });
    const rep = { created: 0, updated: 0, pulled: 0, removed: 0, skipped: 0 };
    const ids = new Set();
    for (const m of meetings) {
      if (!m.title || !m.date || !m.start) continue;
      ids.add(m.id);
      const ev = byId[m.id], rec = map[m.id], h = hash(m);
      if (!ev) {
        if (rec && rec.h === h) { rep.skipped++; continue; }     // kişi kendi takviminden silmiş: tekrar ekleme
        const c = await call('POST', '/calendars/primary/events', body(m, phaseName(m.phase)));
        map[m.id] = { h, u: c.updated }; rep.created++; continue;
      }
      const evChanged = rec && ev.updated !== rec.u, mChanged = !rec || rec.h !== h;
      if (evChanged && !mChanged) {
        const s = local(ev.start && ev.start.dateTime), e = local(ev.end && ev.end.dateTime);
        const f = {};
        if (s) { if (s.slice(0, 10) !== m.date) f.date = s.slice(0, 10); if (s.slice(11) !== m.start) f.start = s.slice(11); }
        if (e && e.slice(11) !== (m.end || '')) f.end = e.slice(11);
        const title = (ev.summary || '').replace(PREFIX, '').trim(); if (title && title !== m.title) f.title = title;
        if ((ev.location || '') !== (m.place || '')) f.place = ev.location || '';
        if (Object.keys(f).length) { onPull(m.id, f); rep.pulled++; }
        map[m.id] = { h: hash(Object.assign({}, m, f)), u: ev.updated };
      } else if (mChanged) {
        const u = await call('PATCH', '/calendars/primary/events/' + encodeURIComponent(ev.id), body(m, phaseName(m.phase)));
        map[m.id] = { h, u: u.updated }; rep.updated++;
      }
    }
    for (const e of evs) {
      const id = e.extendedProperties.private.originId;
      if (!ids.has(id)) { await call('DELETE', '/calendars/primary/events/' + encodeURIComponent(e.id)); delete map[id]; rep.removed++; }
    }
    Object.keys(map).forEach(k => { if (!ids.has(k)) delete map[k]; });
    saveMap(map);
    return rep;
  }

  function status(m) {
    const rec = loadMap()[m.id];
    if (!rec) return 'none';
    return rec.h === hash(m) ? 'ok' : 'stale';
  }
  function templateLink(m, phaseName) {
    const end = m.end && m.end > m.start ? { date: m.date, time: m.end } : addMinutes(m.date, m.start, 60);
    const f = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    const b = body(m, phaseName);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(b.summary) +
      '&dates=' + f(m.date, m.start) + '/' + f(end.date, end.time) + '&ctz=' + encodeURIComponent(TZ) +
      '&location=' + encodeURIComponent(b.location) + '&details=' + encodeURIComponent(b.description);
  }

  window.OriginCal = {
    sync, status, templateLink,
    configured: () => !!(window.ORIGIN_CONFIG || {}).googleClientId,
    ready: () => !!tok && Date.now() < tokExp - 60000,
    account: () => account,
    signOut: () => { if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok, () => {}); tok = null; account = ''; try { localStorage.removeItem('origin.gcal.account'); } catch (e) {} }
  };
})();

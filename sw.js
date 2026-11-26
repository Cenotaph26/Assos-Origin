/* Çevrimdışı açılış için uygulama dosyalarını önbelleğe alır. Veriler bu önbelleğe girmez. */
const CACHE = 'origin-v1';
const SHELL = ['./', 'index.html', 'config.js', 'js/ops.js', 'js/export.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('google.com') || u.hostname.endsWith('googleusercontent.com')) return; // veri isteği: önbelleğe alma
  // Ağ önce, olmazsa önbellek: güncellemeler hemen görünür, internetsiz de açılır.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && (u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net' || u.hostname.startsWith('fonts.'))) {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html')))
  );
});

// Service worker: caches the app shell so it opens fast and works offline.
// Live data (Apps Script) and weather are always fetched from the network, never cached here.
const CACHE = 'aq-shell-v11';
const SHELL = ['./', './index.html', './styles.css?v=10', './app.js?v=10', './config.js?v=10', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.includes('script.google') || u.hostname.includes('googleusercontent') || u.hostname.includes('open-meteo') || u.hostname.includes('met.no') || u.hostname.includes('wttr.in')) return;
  // network first for our own files (so updates show up), cache as fallback
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; })
    .catch(() => caches.match(e.request)));
});

/* Service Worker von PROfessor (Spec Abschnitt 12): App-Hülle und Seiten für Heute, Plan und Klassenbuch.
 * Daten (Termine, Schülerlisten, Outbox) liegen in IndexedDB und werden von der App selbst verwaltet;
 * API-Aufrufe gehen nie durch einen Cache. */
const VERSION = 'v3';
const STATIC = `sp-static-${VERSION}`;
const PAGES = `sp-pages-${VERSION}`;
const OFFLINE = '/offline';
/** Seiten, die offline aus dem Cache kommen dürfen (Spec: nur Heute, Stundenplan und Klassenbuch). */
const OFFLINE_ROUTES = [/^\/heute\/?$/, /^\/plan\/?$/, /^\/klassenbuch(\/[^/]+)?\/?$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.add(new Request(OFFLINE, { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('sp-') && k !== STATIC && k !== PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/icons/') ||
  url.pathname === '/manifest.webmanifest';

const offlineRoute = (url) => OFFLINE_ROUTES.some((r) => r.test(url.pathname));

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC)).put(request, res.clone());
  return res;
}

/** Netz zuerst; erfolgreiche Seiten (ohne Umleitung, z. B. zum Login) werden für offline gemerkt. */
async function page(request, url) {
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected && offlineRoute(url))
      (await caches.open(PAGES)).put(url.pathname + url.search, res.clone());
    return res;
  } catch {
    const cache = await caches.open(PAGES);
    const hit =
      (await cache.match(url.pathname + url.search)) ||
      (await cache.match(url.pathname, { ignoreSearch: true }));
    if (hit) return hit;
    return (await caches.match(OFFLINE)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Seitenaufrufe; Next-Datenabrufe (RSC) gehen ans Netz, offline fällt Next selbst auf einen Seitenaufruf zurück
  if (request.mode === 'navigate') event.respondWith(page(request, url));
});

/** Seiten samt ihrer Skripte und Styles vorab in den Cache legen (von der App nach dem Vorabladen geschickt). */
async function cachePages(urls, refresh) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  for (const path of urls) {
    try {
      if (!refresh && (await pages.match(path))) continue;
      const res = await fetch(path, { credentials: 'same-origin' });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
      for (const a of assets)
        if (!(await statics.match(a))) await statics.add(a).catch(() => undefined);
    } catch {
      // offline oder Seite nicht erlaubt: überspringen
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-pages' && Array.isArray(data.urls))
    event.waitUntil(
      cachePages(data.urls.filter((u) => typeof u === 'string' && u.startsWith('/'))),
    );
  if (data.type === 'clear')
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith('sp-pages')).map((k) => caches.delete(k))),
        ),
    );
});

/* Web-Push (Spec Abschnitt 12): Texte ohne Namen, Details lädt die App nach dem Öffnen. */
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const title = data.title || 'PROfessor';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'sp',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/monochrome-512.png',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
      lang: 'de-AT',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

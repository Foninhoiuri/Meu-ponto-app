/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope;

const CACHE = 'app-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req)) as Promise<Response>),
    );
  }
});

const TITULO_PADRAO = 'Meu Ponto';

self.addEventListener('push', (e) => {
  let data: any = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: TITULO_PADRAO, body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || TITULO_PADRAO, { 
      body: data.body || '', 
      icon: '/icone.png', 
      badge: '/icone.png', 
      data: data.url || '/' 
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if ('focus' in c) {
          (c as any).focus();
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

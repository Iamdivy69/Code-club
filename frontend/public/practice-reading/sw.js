const CACHE = 'practice-reading-public-v1';
const PREFIX = 'practice-reading-public-';
const PATH = /^\/api\/practice\/reading\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
let epoch = 0;
let writes = Promise.resolve();
function mutate(action) {
  const next = writes.then(action);
  writes = next.catch(() => {});
  return next;
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'CLEAR') return;
  epoch++;
  event.waitUntil(mutate(async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX)).map(key => caches.delete(key)));
  }));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search || !PATH.test(url.pathname)) return;
  const generation = epoch;
  event.respondWith((async () => {
    const request = new Request(url.href, { credentials: 'omit', cache: 'no-store' });
    try {
      const response = await fetch(request);
      if (response.status === 404 || response.status === 403 || response.status === 410) {
        await mutate(async () => (await caches.open(CACHE)).delete(request));
      } else if (response.ok && response.headers.get('X-CodeClub-Public-Reading') === '1'
        && response.headers.get('Content-Type')?.includes('application/json')) {
        const copy = response.clone();
        await mutate(async () => {
          if (generation === epoch) await (await caches.open(CACHE)).put(request, copy);
        });
      }
      return response;
    } catch {
      const cached = await (await caches.open(CACHE)).match(request);
      if (cached && generation === epoch) {
        const headers = new Headers(cached.headers);
        headers.set('X-CodeClub-Offline', '1');
        return new Response(cached.body, { status: 200, headers });
      }
      return new Response(JSON.stringify({ message: 'Connect to load this public problem for the first time.' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  })());
});

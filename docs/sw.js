// OPIc 30 service worker: page network-first, audio cache-first (lazy), optional full prefetch
const VER = "v2";
const CORE = "opic30-core-" + VER, AUDIO = "opic30-audio";
self.addEventListener("install", e => { e.waitUntil(caches.open(CORE).then(c => c.addAll(["./", "./index.html", "./manifest.webmanifest"]).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.open(AUDIO).then(async c => { for (const req of await c.keys()) if (req.url.includes("silence_")) await c.delete(req); }).catch(() => {}).then(() => caches.keys()).then(ks => Promise.all(ks.filter(k => k.startsWith("opic30-core-") && k !== CORE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/audio/")) {
    e.respondWith(caches.open(AUDIO).then(async c => { const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }));
    return;
  }
  if (url.pathname.endsWith("version.json")) { e.respondWith(fetch(e.request, { cache: "no-store" }).catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } }))); return; }
  // page & manifest: network first, fall back to cache
  e.respondWith(fetch(e.request).then(r => { if (r.ok && e.request.method === "GET") caches.open(CORE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(h => h || caches.match("./index.html"))));
});
self.addEventListener("message", async e => {
  if (e.data?.type === "prefetch" && Array.isArray(e.data.urls)) {
    const c = await caches.open(AUDIO); let done = 0;
    for (const u of e.data.urls) { try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch (x) {} done++; if (done % 10 === 0 || done === e.data.urls.length) e.source?.postMessage({ type: "prefetch-progress", done, total: e.data.urls.length }); }
  }
});

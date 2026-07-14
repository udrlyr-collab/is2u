const CACHE = "is2u-shell-v1";
const SHELL = ["/offline", "/icon.svg"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin || new URL(event.request.url).pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
});
self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : { title: "그대로 멈춰라", body: "작은 순간이 도착했어요.", url: "/home" };
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, data: { url: payload.url }, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: payload.missionId ? `mission-${payload.missionId}` : "is2u", renotify: false }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/home", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => { const existing = windows.find((client) => client.url === target); return existing ? existing.focus() : clients.openWindow(target); }));
});

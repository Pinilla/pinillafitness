self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Time to check in", {
      body: "You haven't checked in today. Lift or stretch?",
      icon: "icon-192.png",
      badge: "badge.png",
      tag: "check-in",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openApp());
});

async function openApp() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows[0]) return windows[0].focus();
  return self.clients.openWindow("/");
}

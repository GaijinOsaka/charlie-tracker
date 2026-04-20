// Push notification handler for Charlie Tracker
// Imported by Workbox-generated service worker via importScripts

// Handle incoming push notifications
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error("Failed to parse push notification data:", e);
  }

  const notificationOptions = {
    body: data.body || "New notification",
    icon: data.icon || "/icons/icon-192.png",
    tag: data.tag || "default",
    data: data.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      { action: "open", title: "Open" },
      { action: "close", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Charlie Tracker",
      notificationOptions,
    ),
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") {
    return;
  }

  const messageId = event.notification.data?.messageId;
  const url = messageId ? `/messages/${messageId}` : "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if ("focus" in client) {
            return client.focus().then(() => {
              client.postMessage({ type: "NAVIGATE_TO_MESSAGE", messageId });
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      }),
  );
});

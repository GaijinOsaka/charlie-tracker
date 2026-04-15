// Service Worker for Charlie Tracker

// Workbox manifest injection point
self.__WB_MANIFEST = [];

// Handle incoming push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('Failed to parse push notification data:', e);
  }

  const notificationOptions = {
    body: data.body || 'New notification',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'default', // Prevents duplicate notifications for same tag
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Open',
      },
      {
        action: 'close',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Charlie Tracker', notificationOptions)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const messageId = event.notification.data.messageId;
  const url = messageId ? `/messages/${messageId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus().then(() => {
            // Post message to app to navigate to message
            client.postMessage({ type: 'NAVIGATE_TO_MESSAGE', messageId });
          });
        }
      }
      // App not open, open it
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

---
title: PWA push notifications via Workbox generateSW + importScripts
date: 2026-05-12
module: PWA / Push Notifications
problem_type: best_practice
component: tooling
severity: high
applies_when: Adding or modifying push notification handling in a vite-plugin-pwa project
tags: [pwa, push-notifications, service-worker, workbox, vite, vapid]
related_components: [service_worker, edge_function]
---

# PWA push notifications via Workbox generateSW + importScripts

## Context

Charlie Tracker is a vite-plugin-pwa app that uses Workbox to generate its service
worker. Push notifications need a `push` event listener and a
`notificationclick` listener inside the active service worker. A Workbox-generated
SW does not include those handlers by default, so a naive `generateSW` setup will
register a SW that silently never fires `push`.

A common (and wrong) reaction is to switch to `injectManifest` and hand-author the
entire service worker. That works, but it forfeits Workbox's runtime caching
configuration and is more code to maintain. The simpler, equally effective
approach is `generateSW` with `workbox.importScripts` pointing at a small
hand-written file that contains only the push handlers.

This doc captures the working architecture so future contributors do not
re-derive it or regress to `injectManifest`.

## Guidance

Use `strategies: 'generateSW'` and pull a hand-written push handler file in via
`workbox.importScripts`. Keep runtime caching rules declarative in
`vite.config.js`. Keep the imperative `push` and `notificationclick` listeners
in `public/push-sw.js`.

**`vite.config.js`**

```js
VitePWA({
  registerType: "autoUpdate",
  strategies: "generateSW",
  srcDir: "public",
  filename: "service-worker.js",
  workbox: {
    importScripts: ["/push-sw.js"],
    globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
    runtimeCaching: [
      { urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i, handler: "NetworkOnly" },
      { urlPattern: /^https:\/\/.*\.supabase\.co\/realtime\/.*/i, handler: "NetworkOnly" },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        },
      },
    ],
  },
  manifest: {
    /* name, icons, theme_color, etc. */
  },
});
```

**`public/push-sw.js`** (imported into the generated SW at runtime)

```js
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error("Failed to parse push notification data:", e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Charlie Tracker", {
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
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;

  const messageId = event.notification.data?.messageId;
  const url = messageId ? `/messages/${messageId}` : "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            return client.focus().then(() => {
              client.postMessage({ type: "NAVIGATE_TO_MESSAGE", messageId });
            });
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
```

**VAPID public key conversion** (client subscribe code)

The browser requires the VAPID public key as a `Uint8Array`, not a base64 string.
URL-safe base64 must be normalised (`-` to `+`, `_` to `/`, pad to multiple of 4)
before decoding.

```js
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
});
```

**Sending pushes from the backend**

Push payloads are sent server-side (Supabase Edge Function or n8n) using the
`web-push` library with the VAPID private key. Payload keys must match what
`push-sw.js` reads (`title`, `body`, `icon`, `tag`, `data`).

**Icons**

Place icon files in `public/icons/` and reference them as `/icons/icon-192.png`
(root-relative). Vite copies `public/` verbatim into `dist/`, so the path is
stable in dev and production.

## Why This Matters

- `generateSW` alone produces a Workbox-managed service worker with no `push`
  or `notificationclick` listeners. Subscriptions succeed, the SW activates,
  the database row is written, and yet no notification ever appears. The
  failure is silent because nothing in the pipeline errors.
- `workbox.importScripts` is the documented escape hatch for adding custom
  event listeners to a generated SW. The generated `service-worker.js` calls
  `importScripts('/push-sw.js')` at the top, which registers the listeners
  inside the same SW global scope before Workbox sets up its own routes. This
  gives you both Workbox's caching rules and your handwritten push handlers
  without maintaining a full service worker by hand.
- `injectManifest` is the other documented option, but it forces you to
  author the entire SW yourself and re-implement (or import) Workbox's
  precache and runtime cache logic. For an app that needs runtime caching for
  Supabase plus a small push handler, `generateSW + importScripts` is the
  lower-friction choice.
- VAPID keys are URL-safe base64. Passing the raw string to
  `applicationServerKey` either throws `DOMException` or silently rejects.
  The conversion function is mandatory, not optional.
- Line breaks inside the VAPID key value in `.env` produce the same silent
  `DOMException`. Store keys as a single unbroken line.

## When to Apply

- Adding push notifications to any vite-plugin-pwa project.
- Modifying push payload shape — keep `public/push-sw.js` and the backend
  sender in lockstep on field names.
- Reviewing a PR that proposes switching to `injectManifest` "to support
  push" — push is already supported here; redirect to `importScripts`.
- Investigating a report of "subscription works but no notifications" —
  check that `workbox.importScripts` still points at `/push-sw.js` and that
  `/push-sw.js` is being served (open it directly in the browser).

## Examples

A working push flow looks like this end to end:

1. Client calls `navigator.serviceWorker.register('/service-worker.js')`. The
   generated SW runs `importScripts('/push-sw.js')` on activation, attaching
   the `push` and `notificationclick` listeners.
2. Client calls `reg.pushManager.subscribe({ applicationServerKey:
   urlBase64ToUint8Array(VAPID_PUBLIC) })` and persists the subscription to
   the `push_subscriptions` table in Supabase.
3. A backend trigger (Edge Function or n8n) calls `web-push.sendNotification`
   with the stored subscription and a JSON payload
   `{ title, body, icon, tag, data: { messageId } }`.
4. The SW `push` listener parses the payload and calls
   `self.registration.showNotification` with `requireInteraction: true`,
   vibrate pattern, and Open/Dismiss actions.
5. When the user taps the notification, `notificationclick` focuses an
   existing window (or opens `/messages/{messageId}`) and posts a
   `NAVIGATE_TO_MESSAGE` message that the React app reacts to.

If any step is broken, the symptom is usually "subscribe succeeds, nothing
appears". The diagnostic is to use DevTools Application Push to fire a
synthetic push and watch whether the `push` listener runs — if it does not,
`importScripts` is wrong or `/push-sw.js` is 404ing.

## Related

- `vite.config.js` — Workbox config with `importScripts: ['/push-sw.js']`
- `public/push-sw.js` — push and notificationclick handlers
- Supabase Edge Function that sends pushes via `web-push`
- vite-plugin-pwa docs on `generateSW` vs `injectManifest`
- Workbox docs on `importScripts` option

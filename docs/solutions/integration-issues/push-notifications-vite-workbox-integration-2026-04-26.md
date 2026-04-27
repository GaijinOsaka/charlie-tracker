---
title: PWA push notifications fail silently with vite-plugin-pwa and Workbox
date: 2026-04-26
category: integration-issues
module: PWA / Push Notifications
problem_type: integration_issue
component: tooling
symptoms:
  - Push subscription succeeds but notifications never appear
  - Service worker registers but does not handle push events
  - VAPID subscription call throws DOMException without clear message
  - Notification icons show broken image in notification tray
root_cause: config_error
resolution_type: config_change
severity: high
tags: [pwa, push-notifications, service-worker, workbox, vite, vapid]
---

# PWA push notifications fail silently with vite-plugin-pwa and Workbox

## Problem

Push notifications appeared to subscribe correctly (Supabase `push_subscriptions` table populated, no JS errors) but no notifications ever arrived. The service worker registered fine but the `push` event handler was never reached.

## Symptoms

- `PushManager.subscribe()` succeeds; subscription stored in DB
- No notifications appear on any device
- Service worker shows as active in DevTools but has no `push` event listener
- Switching to `injectManifest` mode causes build errors about missing `sw.js`
- VAPID subscription throws `DOMException` when public key is pasted with spaces or line breaks
- Notification icons produce broken image in the OS notification tray

## What Didn't Work

- Generating the service worker with `generateSW` strategy — this auto-generates a SW that has no custom event handlers; `push` event never fires because the generated file has no listener
- Passing `applicationServerKey` as a raw base64 string without converting to `Uint8Array` — browsers reject this silently or throw a DOMException
- Using absolute icon paths without verifying the file is in `public/` — icons 404 silently

## Solution

**1. Switch Workbox strategy from `generateSW` to `injectManifest`**

In `vite.config.js`:
```js
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'public',
  filename: 'sw.js',
  // ...manifest config
})
```

This tells Workbox to inject the precache manifest into your own `public/sw.js` rather than generating a SW from scratch. Your custom `push` event handler survives.

**2. Add push event handler to `public/sw.js`**

```js
// Must call importScripts or Workbox injectManifest will inject here
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'Charlie Tracker';
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icons/icon-192x192.png',
    badge: data.badge ?? '/icons/badge-72x72.png',
    data: { url: data.url ?? '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

**3. Convert VAPID public key correctly**

```js
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY),
});
```

**4. Send from backend, not from client**

Push payloads must be sent from the server (Supabase Edge Function or n8n) using the `web-push` library with the VAPID private key. The payload keys must match what the SW expects:

```json
{ "title": "...", "body": "...", "icon": "/icons/icon-192x192.png", "url": "/" }
```

**5. Icon paths**

Place all icon files in `public/icons/`. Reference them as `/icons/icon-192x192.png` (root-relative). Vite copies `public/` as-is to `dist/`.

## Why This Works

`generateSW` produces a complete service worker file managed entirely by Workbox — there is no opportunity to add a `push` event listener. `injectManifest` instead takes your handwritten `public/sw.js` and injects the Workbox precache manifest into it, leaving all other code intact. Your `push` handler survives the build.

VAPID keys use URL-safe base64 (dash/underscore instead of plus/slash); browsers require the raw `Uint8Array` form for the crypto operation. The conversion function handles padding and character substitution.

## Prevention

- Always use `injectManifest` when push notifications are needed; reserve `generateSW` for cache-only PWAs
- Add a smoke test: after deploying, use DevTools → Application → Push to verify the `push` event fires and a notification appears before wiring up the backend sender
- Store VAPID keys in `.env` as a single unbroken line — line breaks in the key string cause silent DOMException failures

## Related Issues

- Supabase Edge Function `send-push-notification` — uses `web-push` npm module with VAPID private key stored as Edge Function secret
- PWA manifest config: `vite-plugin-pwa` docs on `injectManifest` strategy

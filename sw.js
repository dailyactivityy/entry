// Minimal service worker so the browser treats this as an installable PWA.
// It does not cache the app data (data always loads fresh from Google).
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {
  // pass-through, no caching of dynamic data
  return;
});

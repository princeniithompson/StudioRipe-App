const CACHE_NAME = 'studioripe-cache-v1';

// Install event - caching the single file (though the shell itself caches it as an APK)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // Pass through everything, as this app relies on live API calls and IndexedDB
  event.respondWith(fetch(event.request).catch(() => new Response('Offline')));
});

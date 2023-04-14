/* eslint-disable */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.0.0/workbox-sw.js');
const VERSION = 'v1';


workbox.routing.registerRoute(
  new RegExp('/*'),
  new workbox.strategies.NetworkFirst({
    cacheName: `static-${VERSION}`,
  })
);


self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');
  self.skipWaiting();
});


self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  //Remove previous cached data from disk.
  evt.waitUntil(
    caches.keys().then(async (keyList) => {
      const promises = await Promise.all(keyList.map((key) => {
        if (key !== `static-${VERSION}`) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key)
        }
        return new Promise(resolve => resolve())
      }));
      return promises
    })
  );
  self.clients.claim();
});
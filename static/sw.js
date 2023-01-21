/* eslint-disable */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.0.0/workbox-sw.js');

  workbox.routing.registerRoute(
    new RegExp('/*'),
    new workbox.strategies.NetworkFirst()
  );


  self.addEventListener('install', (evt) => {
    console.log('[ServiceWorker] Install');
    self.skipWaiting();
  });

  self.addEventListener('activate', (evt) => {
    console.log('[ServiceWorker] Activate');
    self.clients.claim();
  });

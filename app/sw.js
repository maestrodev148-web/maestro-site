// Maestro Mobile — service worker (NETWORK-FIRST app shell, offline fallback).
//
// HONESTY/ROBUSTNESS NOTES:
//  - Registered ONLY in a secure context (HTTPS or localhost) — see main.tsx.
//  - NEVER touches the desktop API (/v1, /mcp, /status) — those are always network-only,
//    so a stale cache can never answer a command with old data (no-lie).
//  - NETWORK-FIRST for navigations/HTML (the app shell): a NEW build is ALWAYS picked up
//    when online. A remote-control app is useless offline anyway, and a cache-first shell
//    caused a real bug — fixes never reached the phone (it kept serving old cached JS).
//  - Hashed build assets (/assets/*) are immutable per build → cache-first is safe & fast.
//  - Bump CACHE version to purge the old (cache-first) shell on activate.

const CACHE = 'maestro-mobile-v6';

// ΒΑΣΗ ΔΙΑΔΡΟΜΗΣ — υπολογίζεται από τη θέση του ίδιου του sw.js.
// Έτσι δουλεύει και στη ρίζα (Android/dev) και σε υπο-φάκελο (iPhone PWA).
const BASE = new URL('./', self.location).pathname; // π.χ. '/' ή '/maestro-site/app/'
const SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}icon.svg`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
  `${BASE}apple-touch-icon.png`,
  `${BASE}manifest.webmanifest`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Desktop API calls are ALWAYS live — never serve them from cache.
  if (/(^|\/)(v1|mcp|status)(\/|$)/.test(url.pathname)) return;
  // Only manage our own origin's static assets.
  if (url.origin !== self.location.origin) return;
  // Only manage files inside our own base path (never touch the rest of the site).
  if (!url.pathname.startsWith(BASE)) return;

  // NAVIGATIONS / HTML shell → NETWORK-FIRST: always get the latest app when online,
  // fall back to cache only when offline. This guarantees new builds actually load.
  const isShell =
    req.mode === 'navigate' || url.pathname === BASE || url.pathname === `${BASE}index.html`;
  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(`${BASE}index.html`))),
    );
    return;
  }

  // Hashed/static assets → cache-first (immutable per build; new builds = new hashes).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(`${BASE}index.html`)),
    ),
  );
});

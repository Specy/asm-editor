/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { base, version } from '$service-worker'

const sw = self as unknown as ServiceWorkerGlobalScope

const IMMUTABLE_PREFIX_CACHE = 'asm-editor-immutable-'
const RUNTIME_PREFIX_CACHE = 'asm-editor-runtime-'

// Content-hashed assets. Serving these from cache can never be stale: the URL
// changes whenever the bytes do.
const IMMUTABLE_CACHE = `${IMMUTABLE_PREFIX_CACHE}${version}`
// Everything else (HTML, /static). Always revalidated against the network.
const RUNTIME_CACHE = `${RUNTIME_PREFIX_CACHE}${version}`

// Keep the current generation of hashed assets plus one previous, so a tab still
// running the old build can finish its lazy imports after a deploy. Bounded so the
// cache can't grow until the browser evicts the whole origin (which would take
// IndexedDB, and the user's saved projects, with it).
const KEEP_IMMUTABLE_GENERATIONS = 2

// Matched by prefix rather than the `build` manifest: that manifest omits the Vite
// worker chunks (Monaco's editor/json/html/css/ts workers, ~9MB).
const IMMUTABLE_PREFIX = `${base}/_app/immutable/`

// Only the shell is precached; the build is ~137MB. Everything else is cached as
// it is used, which is what makes previously-visited pages work offline.
const SHELL = `${base}/404.html`

function isCacheable(request: Request, response: Response) {
    return (
        response.status === 200 &&
        // Excludes opaque cross-origin replies.
        response.type === 'basic' &&
        // A redirected response replayed to a navigation makes respondWith throw.
        !response.redirected &&
        // Partial body — storing it would hand back a truncated asset later.
        !request.headers.has('range')
    )
}

async function store(cacheName: string, request: Request, response: Response) {
    if (!isCacheable(request, response)) return
    try {
        const cache = await caches.open(cacheName)
        await cache.put(request, response.clone())
    } catch {
        // Quota exhaustion must not propagate: the fetch already succeeded, and
        // letting it escape would turn storage pressure into hard load failures.
    }
}

async function respond(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith(IMMUTABLE_PREFIX)) {
        // Unscoped match, so an asset unchanged since the last deploy is reused
        // from the previous generation instead of being downloaded again.
        const cached = await caches.match(request)
        if (cached) return cached
        const response = await fetch(request)
        await store(IMMUTABLE_CACHE, request, response)
        return response
    }

    // Network-first: online, the newest deploy always wins, so nothing goes stale.
    try {
        const response = await fetch(request)
        await store(RUNTIME_CACHE, request, response)
        return response
    } catch (error) {
        // Offline only.
        const cached = await caches.match(request, { cacheName: RUNTIME_CACHE })
        if (cached) return cached
        if (request.mode === 'navigate') {
            const shell = await caches.match(SHELL, { cacheName: RUNTIME_CACHE })
            if (shell) return shell
        }
        throw error
    }
}

sw.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(RUNTIME_CACHE)
            await cache.add(SHELL).catch(() => {})
            // Activate immediately rather than waiting for every tab to close, so
            // a deploy takes effect without an extra reload.
            await sw.skipWaiting()
        })()
    )
})

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys()
            const keep = new Set([IMMUTABLE_CACHE, RUNTIME_CACHE])

            // `version` is a Date.now() timestamp by default, so a plain sort is
            // chronological. A customised kit.version.name just makes the retained
            // set arbitrary rather than newest-first — still bounded either way.
            keys.filter((key) => key.startsWith(IMMUTABLE_PREFIX_CACHE) && key !== IMMUTABLE_CACHE)
                .sort()
                .reverse()
                .slice(0, KEEP_IMMUTABLE_GENERATIONS - 1)
                .forEach((key) => keep.add(key))

            // Drops superseded runtime caches, expired immutable generations, and
            // anything an older worker left behind (including the Workbox cache).
            for (const key of keys) {
                if (!keep.has(key)) await caches.delete(key)
            }

            await sw.clients.claim()
        })()
    )
})

sw.addEventListener('fetch', (event) => {
    // Must stay import.meta.env.DEV — `dev` from $app/environment is not importable
    // in a service worker and fails with "__SVELTEKIT_APP_VERSION__ is not defined".
    if (import.meta.env.DEV) return

    const { request } = event
    if (request.method !== 'GET') return

    const url = new URL(request.url)
    // Leave cross-origin (Google Fonts, gstatic) and extension schemes alone.
    if (url.origin !== sw.location.origin) return
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return

    event.respondWith(respond(request))
})

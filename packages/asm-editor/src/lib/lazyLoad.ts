/**
 * A load made the first time it is asked for, such as a chunk's dynamic import, and shared by every
 * call after it while it lasts and once it has succeeded. One that failed (offline, or a chunk a
 * deploy removed) is forgotten, so the next call loads again, where keeping it would fail every
 * later call for the rest of the session even with the network back.
 *
 * Kept apart from `utils.ts`, which imports the Project and its stores.
 */
export function lazyLoad<T>(load: () => Promise<T>): () => Promise<T> {
    let loading: Promise<T> | undefined
    return () => {
        if (!loading) {
            loading = load()
            loading.catch(() => {
                loading = undefined
            })
        }
        return loading
    }
}

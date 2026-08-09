import { browser } from '$app/environment'

const REQUESTED_KEY = 'asm-editor_storage-persist-requested'

export async function requestPersistentStorage(): Promise<void> {
    if (!browser) return
    try {
        if (!navigator.storage?.persist) return
        if (await navigator.storage.persisted()) return
        if (localStorage.getItem(REQUESTED_KEY)) return
        localStorage.setItem(REQUESTED_KEY, '1')
        await navigator.storage.persist()
    } catch {}
}

import { browser } from '$app/environment'
import { HOVER_QUERY, PHONE_QUERY, TABLET_QUERY, type DeviceClass } from './deviceClass'

export type Viewport = {
    readonly deviceClass: DeviceClass
    readonly canHover: boolean
}

function read(): Viewport {
    if (!browser) return { deviceClass: 'desktop', canHover: true }
    return {
        deviceClass: window.matchMedia(PHONE_QUERY).matches
            ? 'phone'
            : window.matchMedia(TABLET_QUERY).matches
              ? 'tablet'
              : 'desktop',
        canHover: window.matchMedia(HOVER_QUERY).matches
    }
}

/**
 * The viewport's device class and pointer, kept current. Read synchronously the first time, so a
 * phone never mounts the desktop arrangement for one frame (and a Monaco editor with it) before
 * switching. Call it while a component initialises: the listeners live as long as that component.
 */
export function watchViewport(): Viewport {
    const state: { deviceClass: DeviceClass; canHover: boolean } = $state(read())
    $effect(() => {
        const queries = [PHONE_QUERY, TABLET_QUERY, HOVER_QUERY].map((q) => window.matchMedia(q))
        const update = () => {
            const next = read()
            state.deviceClass = next.deviceClass
            state.canHover = next.canHover
        }
        for (const query of queries) query.addEventListener('change', update)
        return () => {
            for (const query of queries) query.removeEventListener('change', update)
        }
    })
    return state
}

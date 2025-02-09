import { writable } from 'svelte/store'

type NavigationDiretion = 'forward' | 'back'

function removeRoot(url: string) {
    return url.replace(/^\/+/, '')
}

function createNavigationStore() {
    const { subscribe, set, update } = writable({
        current: '',
        direction: 'forward' as NavigationDiretion
    })

    function navigatingTo(toUrl: string, fromUrl: string, params?: URLSearchParams) {
        let goingBack = false
        try {
            const back = params?.get('b')
            if (back) {
                goingBack = back === '1'
            } else {
                const from = removeRoot(fromUrl)
                const to = removeRoot(toUrl)
                goingBack = from.split('/').length >= to.split('/').length && from !== ''
            }
        } catch (e) {
            console.error(e)
        }
        set({
            current: toUrl,
            direction: goingBack ? 'back' : 'forward'
        })
    }
    return {
        subscribe,
        navigatingTo
    }
}

export const navigationStore = createNavigationStore()

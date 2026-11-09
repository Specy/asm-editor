import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { COURSES_SCOPE } from '#lib/search/scope.ts'

//the model and the indexes are the search worker's business: a search box only asks for them
const searchClient = vi.hoisted(() => ({
    warm: vi.fn()
}))
vi.mock('#lib/search/searchClient.svelte.ts', () => ({ searchClient }))

const { closeSearchPalette, openSearchPalette, registerPaletteScope, searchPalette, warmSearch } =
    await import('./paletteState.svelte')

afterEach(() => {
    closeSearchPalette()
    vi.clearAllMocks()
})

describe('a search box', () => {
    it("starts loading its palette's index when pointed at, not before", () => {
        const unregister = registerPaletteScope('page', COURSES_SCOPE)
        try {
            expect(searchClient.warm).not.toHaveBeenCalled()
            warmSearch('page')
            expect(searchClient.warm).toHaveBeenCalledWith(COURSES_SCOPE)
        } finally {
            unregister()
        }
    })

    it('opens its palette with what was typed into it, and loads the index then too', () => {
        const unregister = registerPaletteScope('page', COURSES_SCOPE)
        try {
            openSearchPalette('m')
            openSearchPalette('x')
            expect(searchPalette.query).toBe('x')
            expect(searchPalette.open).toBe(true)
            expect(searchClient.warm).toHaveBeenCalledWith(COURSES_SCOPE)
        } finally {
            unregister()
        }
    })

    it('asks for no index while no palette of its kind is mounted', () => {
        warmSearch('site')
        expect(searchClient.warm).toHaveBeenCalledWith(undefined)
    })
})

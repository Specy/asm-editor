/** Short numbers for a cache's long key strings (`ListingDocuments`, `PseudocodeClient`). */
import { describe, expect, it } from 'vite-plus/test'
import { KeyIds } from './keyIds'

describe('key ids', () => {
    it('give a string the same id while it is used, forgetting the one used longest ago', () => {
        const ids = new KeyIds(2)
        const a = ids.of('a')
        const b = ids.of('b')
        expect(ids.of('a')).toBe(a)
        //`b` was used longest ago
        const c = ids.of('c')
        expect(ids.of('a')).toBe(a)
        expect(ids.of('c')).toBe(c)
        const again = ids.of('b')
        expect(again).not.toBe(b)
        //never an id given before, cleared or not
        ids.clear()
        expect(new Set([a, b, c, again, ids.of('a')]).size).toBe(5)
    })
})

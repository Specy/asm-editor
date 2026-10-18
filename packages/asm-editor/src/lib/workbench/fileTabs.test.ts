import { describe, expect, it } from 'vite-plus/test'
import {
    closeTab,
    initialTabs,
    keepTab,
    openTab,
    previewTab,
    removeTab,
    renameTab,
    retainTabs
} from './fileTabs'

describe('openTab', () => {
    it('appends a new File and shows it', () => {
        const tabs = openTab(initialTabs('main.s'), 'lib/io.s')
        expect(tabs).toEqual({ paths: ['main.s', 'lib/io.s'], active: 'lib/io.s' })
    })

    it('focuses an open File without moving it', () => {
        const tabs = openTab(openTab(initialTabs('main.s'), 'lib/io.s'), 'main.s')
        expect(tabs).toEqual({ paths: ['main.s', 'lib/io.s'], active: 'main.s' })
    })

    it('ignores an empty path', () => {
        const tabs = initialTabs('main.s')
        expect(openTab(tabs, '')).toBe(tabs)
    })
})

describe('previewTab and keepTab', () => {
    it('opens a File in preview at the end of the row, then another in its place', () => {
        const one = previewTab(initialTabs('main.s'), 'a.s')
        expect(one).toEqual({ paths: ['main.s', 'a.s'], active: 'a.s', preview: 'a.s' })
        const two = previewTab(openTab(one, 'main.s'), 'b.s')
        expect(two).toEqual({ paths: ['main.s', 'b.s'], active: 'b.s', preview: 'b.s' })
    })

    it('only focuses a File already open, kept or in preview, leaving the preview tab alone', () => {
        const tabs = { paths: ['main.s', 'a.s'], active: 'a.s', preview: 'a.s' }
        expect(previewTab(tabs, 'main.s')).toEqual({ ...tabs, active: 'main.s' })
        expect(openTab(tabs, 'main.s')).toEqual({ ...tabs, active: 'main.s' })
        expect(previewTab(tabs, 'a.s')).toBe(tabs)
    })

    it('opens a File kept open beside the preview tab, which stays in preview', () => {
        const tabs = { paths: ['main.s', 'a.s'], active: 'a.s', preview: 'a.s' }
        expect(openTab(tabs, 'b.s')).toEqual({
            paths: ['main.s', 'a.s', 'b.s'],
            active: 'b.s',
            preview: 'a.s'
        })
    })

    it('keeps the File in preview open, so the next preview opens beside it', () => {
        const kept = keepTab(previewTab(initialTabs('main.s'), 'a.s'), 'a.s')
        expect(kept).toEqual({ paths: ['main.s', 'a.s'], active: 'a.s' })
        expect(previewTab(kept, 'b.s').paths).toEqual(['main.s', 'a.s', 'b.s'])
        //keeping a File that is not in preview changes nothing
        expect(keepTab(kept, 'main.s')).toBe(kept)
    })

    it('follows the File in preview through a rename, and drops it when it closes or goes', () => {
        const tabs = { paths: ['main.s', 'a.s'], active: 'main.s', preview: 'a.s' }
        expect(renameTab(tabs, 'a.s', 'lib/a.s').preview).toBe('lib/a.s')
        expect(closeTab(tabs, 'a.s')).toEqual({ paths: ['main.s'], active: 'main.s' })
        expect(removeTab(tabs, 'a.s', 'main.s')).toEqual({ paths: ['main.s'], active: 'main.s' })
        expect(closeTab(tabs, 'main.s')).toEqual({ paths: ['a.s'], active: 'a.s', preview: 'a.s' })
    })
})

describe('closeTab', () => {
    const three = { paths: ['a', 'b', 'c'], active: 'b' }

    it('shows the right neighbour of the shown tab it closes', () => {
        expect(closeTab(three, 'b')).toEqual({ paths: ['a', 'c'], active: 'c' })
    })

    it('shows the left neighbour when the shown tab was the last of the row', () => {
        expect(closeTab({ ...three, active: 'c' }, 'c')).toEqual({ paths: ['a', 'b'], active: 'b' })
    })

    it('keeps the shown tab when another one closes', () => {
        expect(closeTab(three, 'a')).toEqual({ paths: ['b', 'c'], active: 'b' })
    })

    it('allows an empty group after closing the last tab', () => {
        const one = initialTabs('main.s')
        expect(closeTab(one, 'main.s')).toEqual({ paths: [], active: '' })
    })
})

describe('renameTab', () => {
    it('keeps the renamed File in its place and shown', () => {
        const tabs = { paths: ['a', 'b', 'c'], active: 'b' }
        expect(renameTab(tabs, 'b', 'lib/b')).toEqual({
            paths: ['a', 'lib/b', 'c'],
            active: 'lib/b'
        })
    })

    it('does not open the same path twice when moved onto an open tab', () => {
        const tabs = { paths: ['a', 'b'], active: 'a' }
        expect(renameTab(tabs, 'a', 'b')).toEqual({ paths: ['b'], active: 'b' })
    })

    it('leaves the row alone for a File that is not open', () => {
        const tabs = { paths: ['a'], active: 'a' }
        expect(renameTab(tabs, 'z', 'y')).toBe(tabs)
    })
})

describe('retainTabs and removeTab', () => {
    it('shows the nearest survivor to the right of a removed shown tab', () => {
        const tabs = { paths: ['a', 'b', 'c', 'd'], active: 'b' }
        expect(retainTabs(tabs, (path) => path !== 'b' && path !== 'c', 'main')).toEqual({
            paths: ['a', 'd'],
            active: 'd'
        })
    })

    it('falls back to the Entry path when nothing survives', () => {
        const tabs = { paths: ['out.txt'], active: 'out.txt' }
        expect(removeTab(tabs, 'out.txt', 'main.s')).toEqual({
            paths: ['main.s'],
            active: 'main.s'
        })
    })

    it('returns the same row when every tab survives', () => {
        const tabs = { paths: ['a', 'b'], active: 'a' }
        expect(retainTabs(tabs, () => true, 'main')).toBe(tabs)
    })
})

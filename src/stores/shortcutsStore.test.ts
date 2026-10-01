import { describe, expect, it } from 'vitest'
import { modShortcutKey, shortcutLabel, shortcutsStore, ShortcutAction } from './shortcutsStore'

function keydown(init: KeyboardEventInit & { code: string }): KeyboardEvent {
    return {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...init
    } as KeyboardEvent
}

describe('command-key shortcuts', () => {
    it('reads Ctrl+K as Mod+KeyK off a Mac, whichever Ctrl', () => {
        expect(modShortcutKey(keydown({ code: 'KeyK', ctrlKey: true }))).toBe('Mod+KeyK')
        expect(modShortcutKey(keydown({ code: 'KeyK' }))).toBeNull()
        expect(modShortcutKey(keydown({ code: 'ControlRight', ctrlKey: true }))).toBeNull()
        expect(modShortcutKey(keydown({ code: 'KeyK', ctrlKey: true, altKey: true }))).toBeNull()
    })

    it('binds Search the documentation to Mod+KeyK', () => {
        expect(shortcutsStore.get('Mod+KeyK')?.type).toBe(ShortcutAction.SearchDocumentation)
    })

    it('labels keys the way a reader writes them', () => {
        expect(shortcutLabel('Mod+KeyK')).toBe('Ctrl+K')
        expect(shortcutLabel('ShiftLeft+KeyD')).toBe('Shift+D')
        expect(shortcutLabel('ShiftLeft+ArrowDown')).toBe('Shift+↓')
    })
})

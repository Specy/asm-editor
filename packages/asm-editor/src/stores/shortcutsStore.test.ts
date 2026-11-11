import { describe, expect, it } from 'vite-plus/test'
import {
    modShortcutKey,
    shortcutLabel,
    shortcutParts,
    shortcutsStore,
    ShortcutAction
} from './shortcutsStore'

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

    it('binds Search the Project to Mod+Shift+KeyF, which Ctrl+Shift+F is read as', () => {
        expect(shortcutsStore.get('Mod+Shift+KeyF')?.type).toBe(ShortcutAction.SearchProject)
        expect(modShortcutKey(keydown({ code: 'KeyF', ctrlKey: true, shiftKey: true }))).toBe(
            'Mod+Shift+KeyF'
        )
    })

    it('binds Step over and Step out beside Step and Undo, on the other two arrows', () => {
        expect(shortcutsStore.get('ShiftLeft+ArrowDown')?.type).toBe(ShortcutAction.Step)
        expect(shortcutsStore.get('ShiftLeft+ArrowRight')?.type).toBe(ShortcutAction.StepOver)
        expect(shortcutsStore.get('ShiftLeft+ArrowLeft')?.type).toBe(ShortcutAction.StepOut)
        expect(shortcutLabel('ShiftLeft+ArrowRight')).toBe('Shift+→')
    })

    it('labels keys the way a reader writes them', () => {
        expect(shortcutLabel('Mod+KeyK')).toBe('Ctrl+K')
        expect(shortcutLabel('Mod+Shift+KeyF')).toBe('Ctrl+Shift+F')
        expect(shortcutLabel('ShiftLeft+KeyD')).toBe('Shift+D')
        expect(shortcutLabel('ShiftLeft+ArrowDown')).toBe('Shift+↓')
        //the arrow marked, which ShortcutKeys draws as an icon
        expect(shortcutParts('ShiftLeft+ArrowRight')).toEqual([
            { text: 'Shift' },
            { text: '+' },
            { text: '→', arrow: 'right' }
        ])
    })
})

import { describe, expect, it, vi } from 'vite-plus/test'
import type { MonacoType } from './Monaco'
import {
    lineActionContextKey,
    lineActionDescriptor,
    navigationActions,
    navigationButtonStep,
    navigationKeyStep
} from './editorLineActions'

describe('a line action as Monaco registers it', () => {
    it('takes its keys only while the editor text has the keyboard, not Find or the palette', () => {
        const run = vi.fn()
        const action = {
            id: 'asm-editor.patchInstruction',
            label: 'Patch instruction…',
            keybindings: (monaco: MonacoType) => [monaco.KeyCode.Space],
            available: () => true,
            run: () => undefined
        }
        const monaco = { KeyCode: { Space: 10 } } as unknown as MonacoType
        const descriptor = lineActionDescriptor(action, monaco, run)
        expect(descriptor).toMatchObject({
            id: 'asm-editor.patchInstruction',
            label: 'Patch instruction…',
            keybindings: [10],
            precondition: lineActionContextKey(action),
            keybindingContext: 'editorTextFocus',
            contextMenuGroupId: '1_modification'
        })
        expect(descriptor.run).toBe(run)
    })
})

describe('Go Back and Go Forward', () => {
    it('are on Alt+← and Alt+→, first in the navigation group, while there is somewhere to go', () => {
        const navigation = { canGoBack: true, canGoForward: false, back: vi.fn(), forward: vi.fn() }
        const monaco = {
            KeyMod: { Alt: 512 },
            KeyCode: { LeftArrow: 15, RightArrow: 17 }
        } as unknown as MonacoType
        const [back, forward] = navigationActions(navigation)
        expect(lineActionDescriptor(back, monaco, () => {})).toMatchObject({
            id: 'asm-editor.goBack',
            label: 'Go Back',
            keybindings: [512 | 15],
            contextMenuGroupId: 'navigation'
        })
        expect(forward.keybindings?.(monaco)).toEqual([512 | 17])
        expect([back.available(0), forward.available(0)]).toEqual([true, false])
        back.run(0)
        expect(navigation.back).toHaveBeenCalledOnce()
    })

    it('take Alt+← and Alt+→ alone, and the mouse’s back and forward buttons', () => {
        const key = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
            navigationKeyStep({
                key,
                altKey: true,
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
                ...modifiers
            })
        expect([key('ArrowLeft'), key('ArrowRight')]).toEqual(['back', 'forward'])
        //Shift+Alt+← is Monaco's shrink selection, Ctrl+Alt+← a word part
        expect(key('ArrowLeft', { shiftKey: true })).toBeUndefined()
        expect(key('ArrowLeft', { ctrlKey: true })).toBeUndefined()
        expect(key('ArrowLeft', { altKey: false })).toBeUndefined()
        expect([3, 4, 0, 2].map((button) => navigationButtonStep({ button }))).toEqual([
            'back',
            'forward',
            undefined,
            undefined
        ])
    })
})

import { describe, expect, it, vi } from 'vite-plus/test'
import type { MonacoType } from './Monaco'
import { lineActionContextKey, lineActionDescriptor } from './editorLineActions'

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

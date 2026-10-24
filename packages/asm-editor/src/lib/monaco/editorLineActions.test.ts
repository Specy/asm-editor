import { describe, expect, it, vi } from 'vite-plus/test'
import type { MonacoType } from './Monaco'
import {
    annotationActions,
    debuggingActions,
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
        expect([back.available(0, 0), forward.available(0, 0)]).toEqual([true, false])
        back.run(0, 0)
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

describe('Toggle Breakpoint and Run to Cursor', () => {
    it('are on F9 and Ctrl+F10, in a group Monaco lists before Patch instruction…', () => {
        const debugging = {
            canToggleBreakpoint: (line: number) => line === 2,
            toggleBreakpoint: vi.fn(),
            canRunToCursor: (line: number) => line === 3,
            runToCursor: vi.fn()
        }
        const monaco = {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { F9: 67, F10: 68 }
        } as unknown as MonacoType
        const [toggle, runTo] = debuggingActions(debugging)
        expect(lineActionDescriptor(toggle, monaco, () => {})).toMatchObject({
            id: 'asm-editor.toggleBreakpoint',
            label: 'Toggle Breakpoint',
            keybindings: [67],
            keybindingContext: 'editorTextFocus',
            contextMenuGroupId: '1_debug',
            contextMenuOrder: 1
        })
        expect(lineActionDescriptor(runTo, monaco, () => {})).toMatchObject({
            id: 'asm-editor.runToCursor',
            label: 'Run to Cursor',
            keybindings: [2048 | 68],
            contextMenuGroupId: '1_debug',
            contextMenuOrder: 2
        })
        //offered on the lines the pane says, and run there
        expect(
            [1, 2, 3].map((line) => [toggle.available(line, 0), runTo.available(line, 0)])
        ).toEqual([
            [false, false],
            [true, false],
            [false, true]
        ])
        toggle.run(2, 0)
        runTo.run(3, 0)
        expect(debugging.toggleBreakpoint).toHaveBeenCalledWith(2)
        expect(debugging.runToCursor).toHaveBeenCalledWith(3)
    })
})

describe('Rename…, Comment… and the rest', () => {
    const monaco = {
        KeyMod: { CtrlCmd: 2048, Shift: 1024 },
        KeyCode: { KeyN: 44, F2: 60, Semicolon: 85, KeyZ: 56, KeyY: 55 }
    } as unknown as MonacoType

    function annotations() {
        return {
            canRename: vi.fn((line: number, column: number) => line === 1 && column === 9),
            rename: vi.fn(),
            canResetName: vi.fn(() => false),
            resetName: vi.fn(),
            canComment: vi.fn((line: number) => line === 1),
            comment: vi.fn(),
            canCommentFunction: vi.fn(() => true),
            commentFunction: vi.fn(),
            canDeleteComment: vi.fn(() => false),
            deleteComment: vi.fn(),
            canUndo: true,
            undo: vi.fn(),
            canRedo: false,
            redo: vi.fn()
        }
    }

    it('are on n and F2, ;, and Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, the editor text’s only', () => {
        const actions = annotationActions(annotations())
        const described = actions.map((action) => lineActionDescriptor(action, monaco, () => {}))
        expect(described.map(({ id, label, keybindings }) => ({ id, label, keybindings }))).toEqual(
            [
                { id: 'asm-editor.rename', label: 'Rename…', keybindings: [44, 60] },
                { id: 'asm-editor.comment', label: 'Comment…', keybindings: [85] },
                {
                    id: 'asm-editor.functionComment',
                    label: 'Function comment…',
                    keybindings: undefined
                },
                { id: 'asm-editor.resetName', label: 'Reset name', keybindings: undefined },
                { id: 'asm-editor.deleteComment', label: 'Delete comment', keybindings: undefined },
                {
                    id: 'asm-editor.undoAnnotation',
                    label: 'Undo rename or comment',
                    keybindings: [2048 | 56]
                },
                {
                    id: 'asm-editor.redoAnnotation',
                    label: 'Redo rename or comment',
                    keybindings: [2048 | 1024 | 56, 2048 | 55]
                }
            ]
        )
        //in a group of their own, after the debugging one and before Patch instruction…, in order
        for (const [index, descriptor] of described.entries())
            expect(descriptor).toMatchObject({
                keybindingContext: 'editorTextFocus',
                contextMenuGroupId: '1_edit_annotations',
                contextMenuOrder: index + 1
            })
        //Monaco sorts the groups after `navigation` by localeCompare
        const groups = ['1_debug', '1_edit_annotations', '1_modification']
        expect([...groups].reverse().sort((a, b) => a.localeCompare(b))).toEqual(groups)
    })

    it('are offered where the pane says, at the cursor’s line and column, and run there', () => {
        const pane = annotations()
        const [rename, comment, fn, reset, remove, undo, redo] = annotationActions(pane)
        expect(rename.available(1, 9)).toBe(true)
        expect(rename.available(1, 2)).toBe(false)
        expect(pane.canRename).toHaveBeenLastCalledWith(1, 2)
        expect([comment.available(1, 0), comment.available(2, 0)]).toEqual([true, false])
        expect([fn.available(5, 0), reset.available(1, 9), remove.available(1, 0)]).toEqual([
            true,
            false,
            false
        ])
        expect([undo.available(0, 0), redo.available(0, 0)]).toEqual([true, false])
        rename.run(1, 9)
        comment.run(1, 0)
        fn.run(5, 0)
        undo.run(0, 0)
        expect(pane.rename).toHaveBeenCalledWith(1, 9)
        expect(pane.comment).toHaveBeenCalledWith(1)
        expect(pane.commentFunction).toHaveBeenCalledWith(5)
        expect(pane.undo).toHaveBeenCalledOnce()
    })
})

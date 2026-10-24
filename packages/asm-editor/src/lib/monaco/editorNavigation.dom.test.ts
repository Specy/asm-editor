/**
 * How an editor showing a Listing or a Pseudocode takes the mouse and the keys
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decisions 7
 * and 8), on a stand-in for Monaco's editor whose events the tests send: which names are
 * followable is `followableNameAt`'s, tested with the Listing and Pseudocode providers.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'
import type { EditorNavigation } from './editorLineActions'
import type { FollowableName } from './followNames'
import { followNamesAndHistory } from './editorNavigation'

const CONTENT_TEXT = 6
const GUTTER = 2

/** `strcmp@plt` on line 3, a link to line 40, and no other name anywhere. */
const STRCMP: FollowableName = {
    range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 20 },
    resource: { toString: () => 'asm-editor://session/live/crackme#listing' } as monaco.Uri,
    line: 40
}
vi.mock('./followNames', () => ({
    followableNameAt: (_monaco: unknown, _model: unknown, position: monaco.IPosition) =>
        position.lineNumber === 3 && position.column >= 10 && position.column < 20
            ? STRCMP
            : undefined
}))

const monacoStub = { editor: { MouseTargetType: { CONTENT_TEXT } } } as unknown as MonacoType

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

type Target = { type: number; position: monaco.IPosition | null }

/** The editor, its element, what the hooks were told, and a way to send each kind of event. */
function editor(navigation?: EditorNavigation) {
    const element = document.createElement('div')
    const text = document.createElement('div')
    element.append(text)
    document.body.append(element)
    const listeners = {
        keyDown: [] as ((event: monaco.IKeyboardEvent) => void)[],
        mouseMove: [] as ((event: monaco.editor.IEditorMouseEvent) => void)[],
        mouseLeave: [] as (() => void)[]
    }
    const listen =
        <T>(list: T[]) =>
        (listener: T) => {
            list.push(listener)
            return {
                dispose: () => {
                    if (list.includes(listener)) list.splice(list.indexOf(listener), 1)
                }
            }
        }
    let pointed: Target | null = null
    const fake = {
        getModel: () => ({}) as monaco.editor.ITextModel,
        getTargetAtClientPoint: () => pointed,
        onKeyDown: listen(listeners.keyDown),
        onMouseMove: listen(listeners.mouseMove),
        onMouseLeave: listen(listeners.mouseLeave)
    }
    const followed: FollowableName[] = []
    const shown: (monaco.IRange | undefined)[] = []
    let current = navigation
    const dispose = followNamesAndHistory(monacoStub, fake as never, element, {
        navigation: () => current,
        follow: (name) => followed.push(name),
        showFollowable: (range) => shown.push(range)
    })
    disposers.push(dispose)
    return {
        followed,
        shown,
        listeners,
        dispose,
        setNavigation: (next?: EditorNavigation) => (current = next),
        point: (target: Target | null) => (pointed = target),
        move: (target: Target) =>
            listeners.mouseMove.forEach((listener) =>
                listener({ target } as monaco.editor.IEditorMouseEvent)
            ),
        leave: () => listeners.mouseLeave.forEach((listener) => listener()),
        doubleClick: (button = 0) =>
            text.dispatchEvent(new MouseEvent('dblclick', { button, bubbles: true })),
        /** A mouse button event on the text; whether it was kept from the browser and Monaco. */
        button(type: string, button: number) {
            const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
            let reachedMonaco = false
            const monacoListener = () => (reachedMonaco = true)
            text.addEventListener(type, monacoListener, { once: true })
            text.dispatchEvent(event)
            text.removeEventListener(type, monacoListener)
            return { prevented: event.defaultPrevented, reachedMonaco }
        },
        /** A key Monaco hands its listeners, and what they did with it. */
        key(key: string, modifiers: Partial<KeyboardEvent> = { altKey: true }) {
            const event = {
                browserEvent: {
                    key,
                    altKey: false,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    ...modifiers
                },
                preventDefault: vi.fn(),
                stopPropagation: vi.fn()
            }
            listeners.keyDown.forEach((listener) => listener(event as never))
            return {
                prevented: event.preventDefault.mock.calls.length > 0,
                stopped: event.stopPropagation.mock.calls.length > 0
            }
        }
    }
}

/** A history with `back` and `forward` places, recording which way it was moved. */
function history(back: boolean, forward: boolean) {
    const moves: string[] = []
    const navigation: EditorNavigation = {
        canGoBack: back,
        canGoForward: forward,
        back: () => moves.push('back'),
        forward: () => moves.push('forward')
    }
    return { navigation, moves }
}

describe('a followable name', () => {
    it('is drawn as a link while the mouse is over it, and no longer once it leaves', () => {
        const view = editor()
        view.move({ type: CONTENT_TEXT, position: { lineNumber: 3, column: 12 } })
        view.move({ type: CONTENT_TEXT, position: { lineNumber: 4, column: 12 } })
        view.move({ type: CONTENT_TEXT, position: { lineNumber: 3, column: 12 } })
        //over the gutter beside it, the text is not pointed at
        view.move({ type: GUTTER, position: { lineNumber: 3, column: 1 } })
        view.move({ type: CONTENT_TEXT, position: { lineNumber: 3, column: 15 } })
        view.leave()
        expect(view.shown).toEqual([
            STRCMP.range,
            undefined,
            STRCMP.range,
            undefined,
            STRCMP.range,
            undefined
        ])
    })

    it('is followed on a double-click with the main button, and nothing else is', () => {
        const view = editor()
        view.point({ type: CONTENT_TEXT, position: { lineNumber: 3, column: 11 } })
        view.doubleClick(2)
        expect(view.followed).toEqual([])
        view.doubleClick()
        expect(view.followed).toEqual([STRCMP])
        //a word that is no name, and the gutter
        view.point({ type: CONTENT_TEXT, position: { lineNumber: 7, column: 11 } })
        view.doubleClick()
        view.point({ type: GUTTER, position: { lineNumber: 3, column: 11 } })
        view.doubleClick()
        view.point(null)
        view.doubleClick()
        expect(view.followed).toEqual([STRCMP])
    })
})

describe('Alt+← and Alt+→', () => {
    it('are left to Monaco, which goes back or forward, while there is somewhere to go', () => {
        const { navigation } = history(true, true)
        const view = editor(navigation)
        //kept from the browser's Back and Monaco's word moves, not from Monaco's Go Back
        expect(view.key('ArrowLeft')).toEqual({ prevented: true, stopped: false })
        expect(view.key('ArrowRight')).toEqual({ prevented: true, stopped: false })
    })

    it('go nowhere at all with nowhere to go, the browser included', () => {
        const view = editor(history(false, true).navigation)
        expect(view.key('ArrowLeft')).toEqual({ prevented: true, stopped: true })
        expect(view.key('ArrowRight')).toEqual({ prevented: true, stopped: false })
    })

    it('are left alone in an editor with no history, and with another modifier', () => {
        const view = editor()
        expect(view.key('ArrowLeft')).toEqual({ prevented: false, stopped: false })
        view.setNavigation(history(false, false).navigation)
        expect(view.key('ArrowLeft', { altKey: true, shiftKey: true })).toEqual({
            prevented: false,
            stopped: false
        })
        expect(view.key('ArrowLeft', { altKey: false })).toEqual({
            prevented: false,
            stopped: false
        })
    })
})

describe("the mouse's back and forward buttons", () => {
    it('move through the history on their release, before Monaco and the browser see them', () => {
        const { navigation, moves } = history(true, true)
        const view = editor(navigation)
        const kept = { prevented: true, reachedMonaco: false }
        expect(view.button('mousedown', 3)).toEqual(kept)
        expect(moves).toEqual([])
        expect(view.button('mouseup', 3)).toEqual(kept)
        expect(view.button('auxclick', 3)).toEqual(kept)
        expect(view.button('mouseup', 4)).toEqual(kept)
        expect(moves).toEqual(['back', 'forward'])
        //the main button is Monaco's
        expect(view.button('mousedown', 0)).toEqual({ prevented: false, reachedMonaco: true })
    })

    it('are left alone in an editor with no history, and once it is disposed', () => {
        const view = editor()
        expect(view.button('mouseup', 3)).toEqual({ prevented: false, reachedMonaco: true })
        const { navigation, moves } = history(true, true)
        view.setNavigation(navigation)
        view.dispose()
        expect(view.button('mouseup', 3)).toEqual({ prevented: false, reachedMonaco: true })
        expect(view.listeners.keyDown).toEqual([])
        expect(moves).toEqual([])
    })
})

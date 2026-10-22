import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'
import { followableNameAt, type FollowableName } from './followNames'
import { navigationButtonStep, navigationKeyStep, type EditorNavigation } from './editorLineActions'

/** What `followNamesAndHistory` uses of a Monaco editor. */
export type NavigableEditor = Pick<
    monaco.editor.ICodeEditor,
    'getModel' | 'getTargetAtClientPoint' | 'onKeyDown' | 'onMouseMove' | 'onMouseLeave'
>

/**
 * The mouse and the keys of an editor showing a Listing or a Pseudocode
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decisions 7
 * and 8), on its `element`:
 *
 * - a name it can follow is drawn as a link while the mouse is over it (`showFollowable`), and a
 *   double-click follows it (`follow`), as Go to Definition does; a single click only places the
 *   cursor;
 * - Alt+← and Alt+→ are the browser's Back and Forward, and on a Mac Monaco's moves by word: with
 *   a history (`navigation`) they are Go Back and Go Forward, which Monaco runs while there is
 *   somewhere to go, and which nothing else gets when there is not, so the browser never leaves the
 *   page;
 * - the mouse's back and forward buttons move through the history there rather than the
 *   browser's, caught on their way down to the editor, before Monaco, and going on their release.
 *
 * `navigation` is read at each event, since what the editor shows changes. Answers what removes
 * the listeners.
 */
export function followNamesAndHistory(
    monacoInstance: MonacoType,
    editor: NavigableEditor,
    element: HTMLElement,
    hooks: {
        navigation: () => EditorNavigation | undefined
        follow: (name: FollowableName) => void
        showFollowable: (range: monaco.IRange | undefined) => void
    }
): () => void {
    const contentText = monacoInstance.editor.MouseTargetType.CONTENT_TEXT
    const follow = (event: MouseEvent) => {
        const model = editor.getModel()
        const target = editor.getTargetAtClientPoint(event.clientX, event.clientY)
        if (!model || event.button !== 0 || target?.type !== contentText || !target.position) return
        const name = followableNameAt(monacoInstance, model, target.position)
        if (name) hooks.follow(name)
    }
    const moveInHistory = (event: MouseEvent) => {
        const navigation = hooks.navigation()
        const step = navigation && navigationButtonStep(event)
        if (!step) return
        event.preventDefault()
        event.stopPropagation()
        if (event.type === 'mouseup') navigation[step]()
    }
    const buttonEvents = ['mousedown', 'mouseup', 'auxclick'] as const
    element.addEventListener('dblclick', follow)
    for (const type of buttonEvents)
        element.addEventListener(type, moveInHistory, { capture: true })
    const disposables = [
        editor.onMouseMove((event) => {
            const model = editor.getModel()
            hooks.showFollowable(
                model && event.target.type === contentText && event.target.position
                    ? followableNameAt(monacoInstance, model, event.target.position)?.range
                    : undefined
            )
        }),
        editor.onMouseLeave(() => hooks.showFollowable(undefined)),
        editor.onKeyDown((event) => {
            const navigation = hooks.navigation()
            const step = navigation && navigationKeyStep(event.browserEvent)
            if (!step) return
            event.preventDefault()
            if (!(step === 'back' ? navigation.canGoBack : navigation.canGoForward))
                event.stopPropagation()
        })
    ]
    return () => {
        element.removeEventListener('dblclick', follow)
        for (const type of buttonEvents)
            element.removeEventListener(type, moveInHistory, { capture: true })
        for (const disposable of disposables) disposable.dispose()
    }
}

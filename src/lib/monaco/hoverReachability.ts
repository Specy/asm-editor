import type monaco from 'monaco-editor'

/**
 * Monaco's content hover controller, as much of it as this file needs. `getContribution` is public
 * API but the controller's class is not exported, and only these two members are used: the flag
 * that suppresses the controller's own mouse-driven hiding, and the hide it still has to perform
 * once the pointer leaves for good.
 */
type ContentHoverController = monaco.editor.IEditorContribution & {
    shouldKeepOpenOnEditorMouseMoveOrLeave: boolean
    hideContentHover(): void
}

const CONTENT_HOVER_CONTRIBUTION = 'editor.contrib.contentHover'
/** The class Monaco puts on the hover's resizable root — the one this app's hover styles target. */
const HOVER_WIDGET = '.monaco-resizable-hover'

const NOTHING_TO_DISPOSE: monaco.IDisposable = { dispose() {} }

/**
 * Lets the pointer reach the hover popup when the editor renders its overflowing widgets into a
 * node of our own (`overflowWidgetsDomNode`), which this app does so the popup is not painted
 * under the panels around the editor.
 *
 * That relocation puts the hover outside the editor's DOM node, so moving the pointer onto the
 * popup reads to Monaco as the pointer leaving the editor. Its mouse-leave path hides the hover
 * right away — no `hidingDelay` grace, unlike the mouse-move path — unless its own hit test says
 * the pointer is already more than three pixels inside the widget. A pointer crossing the widget's
 * edge is never more than three pixels inside on the event that reports the crossing, so the popup
 * vanished the moment it was reached, however slowly or quickly the pointer approached.
 *
 * Monaco has a flag for exactly this ("the pointer is somewhere I know about, stop hiding on your
 * own"), so hold it for as long as the pointer is over this editor's hover, and take over the one
 * hide the editor can no longer see: leaving the popup for somewhere that is not the editor.
 */
export function keepHoverReachable(
    editor: monaco.editor.ICodeEditor,
    overflowWidgets: HTMLElement
): monaco.IDisposable {
    const controller = editor.getContribution<ContentHoverController>(CONTENT_HOVER_CONTRIBUTION)
    //A Monaco upgrade that renames either of these leaves the hover behaving as it did before this
    //workaround, rather than throwing on every mouse move.
    if (
        !controller ||
        typeof controller.shouldKeepOpenOnEditorMouseMoveOrLeave !== 'boolean' ||
        typeof controller.hideContentHover !== 'function'
    ) {
        return NOTHING_TO_DISPOSE
    }
    const document = overflowWidgets.ownerDocument
    let pointerWasOnHover = false

    const onPointerCrossing = (event: MouseEvent) => {
        //`mouseout` reports the element being left and carries the one being entered, and the
        //browser dispatches it before the `mousemove` for the same position — before Monaco's
        //leave handling, therefore — so in both cases the element the pointer is arriving at is
        //the one to test.
        const arriving = event.type === 'mouseout' ? event.relatedTarget : event.target
        const onHover =
            arriving instanceof Element &&
            overflowWidgets.contains(arriving) &&
            arriving.closest(HOVER_WIDGET) !== null
        controller.shouldKeepOpenOnEditorMouseMoveOrLeave = onHover
        //The editor stopped seeing the pointer when it first entered the popup, so when the pointer
        //leaves the popup for anything other than the editor, nobody else is left to close it.
        const backOverEditor = arriving instanceof Node && editor.getDomNode()?.contains(arriving)
        if (pointerWasOnHover && !onHover && !backOverEditor) controller.hideContentHover()
        pointerWasOnHover = onHover
    }

    //Capture phase, on the document, to run before both of Monaco's leave paths: the `mouseleave`
    //listener on the editor's view node, and the document-level `mousemove` monitor it installs to
    //catch the leaves browsers fail to report.
    document.addEventListener('mousemove', onPointerCrossing, true)
    document.addEventListener('mouseout', onPointerCrossing, true)
    return {
        dispose() {
            document.removeEventListener('mousemove', onPointerCrossing, true)
            document.removeEventListener('mouseout', onPointerCrossing, true)
            controller.shouldKeepOpenOnEditorMouseMoveOrLeave = false
        }
    }
}

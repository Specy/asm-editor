import type monaco from 'monaco-editor'

/**
 * Brings the program's current line to the middle of an editor: at once the first time in each
 * model the editor shows, smoothly after that, as a Step moves it. Monaco keeps the first visible
 * line where it is whenever the editor's size changes, which stops a smooth scroll part of the
 * way, and a Build changes that size just as it reveals the program counter in the Build's model:
 * the debug column opens and the Listing's notice grows a line. Scrolled smoothly there, `main`
 * was left out of sight, a line's height into the scroll.
 */
export class CurrentLineReveal {
    private modelKey: string | undefined

    reveal(
        editor: Pick<monaco.editor.IStandaloneCodeEditor, 'revealLineInCenter'>,
        scroll: Pick<typeof monaco.editor.ScrollType, 'Smooth' | 'Immediate'>,
        modelKey: string,
        lineNumber: number
    ) {
        const jump = this.modelKey !== modelKey
        this.modelKey = modelKey
        editor.revealLineInCenter(lineNumber, jump ? scroll.Immediate : scroll.Smooth)
    }
}

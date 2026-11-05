import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import {
    marsDisplayEquals,
    normalizeMarsDisplay,
    type MarsDisplayOrigin,
    type ProjectDisplay
} from './mars/marsDisplay'
import { rewriteScreenDirective } from './mars/screenDirective'
import { normalizeX86Display, x86DisplayEquals, type X86Display } from './X86/x86Display'
import {
    rewriteX86ScreenDirective,
    x86CommentStyle,
    x86ScreenDirectiveFile
} from './X86/x86ScreenDirective'

/**
 * A Program's **Display configuration**, in its Target's shape: MARS's and RARS's five bitmap
 * display parameters on MIPS and RISC-V (`mars/marsDisplay.ts`), the framebuffer's width and height
 * on x86 (`X86/x86Display.ts`). The M68K and the Z80 have none: their programs size their own
 * Screen. A Program stores the shape of its Project's Target, and everything that reads one asks
 * here rather than for one shape's fields.
 *
 * Plain TypeScript, no runes and no DOM.
 */
export type ProgramDisplay = ProjectDisplay | X86Display

/** A display together with where it came from, which the Display section shows. */
export type ProgramDisplayConfiguration = {
    display: ProgramDisplay
    origin: MarsDisplayOrigin
    /** MIPS and RISC-V: the label a directive's `base=` named, when it named one. */
    baseLabel?: string
}

/**
 * Whether a display is MARS's five fields rather than x86's two. Asked this way round because
 * MARS's shape has x86's two fields too, so only it can be told apart by what it has.
 */
export function isMarsDisplay(display: ProgramDisplay): display is ProjectDisplay {
    return 'baseAddress' in display
}

/** A stored display, or none, in the shape a language's Programs have and within its ranges. */
export function programDisplay(
    language: AvailableLanguages,
    display: Partial<ProjectDisplay> | undefined
): ProgramDisplay {
    return language === 'X86' ? normalizeX86Display(display) : normalizeMarsDisplay(display)
}

/** Whether two displays configure the same Screen, so the GUI can tell a change from a rebuild. */
export function programDisplayEquals(a: ProgramDisplay, b: ProgramDisplay): boolean {
    if (isMarsDisplay(a) && isMarsDisplay(b)) return marsDisplayEquals(a, b)
    return !isMarsDisplay(a) && !isMarsDisplay(b) && x86DisplayEquals(a, b)
}

/**
 * The File whose `@screen` comment states a Program's display: its Entry file, except on x86, where
 * a Generated assembly Entry's comments are its C or C++ source's, which the compiler drops.
 * `entrySource` is that source's path, from the Entry's Compilation record.
 */
export function screenDirectiveFile(
    language: AvailableLanguages,
    files: Readonly<Record<string, unknown>>,
    entry: string,
    entrySource: string | undefined
): string {
    return language === 'X86' ? x86ScreenDirectiveFile(files, entry, entrySource) : entry
}

/**
 * The File at `path` with its `@screen` comment rewritten to say what the user chose, in its own
 * comment style, or `null` when it has none; see `rewriteScreenDirective` and
 * `rewriteX86ScreenDirective`.
 */
export function rewriteProgramScreenDirective(
    language: AvailableLanguages,
    path: string,
    code: string,
    before: ProgramDisplay,
    after: ProgramDisplay
): string | null {
    if (language === 'X86')
        return rewriteX86ScreenDirective(
            code,
            x86CommentStyle(path),
            normalizeX86Display(before),
            normalizeX86Display(after)
        )
    return rewriteScreenDirective(code, normalizeMarsDisplay(before), normalizeMarsDisplay(after))
}

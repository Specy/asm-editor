import type { Screen } from './Screen'

const BACKSPACE = '\b'

/**
 * Draws the echo of typed input at the Screen's text cursor, for the environments whose simulator
 * has a single output window
 * ([ADR 0003](../../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)): EASy68K's
 * traps and the Z80's console ports. The Terminal hands over the characters as typed, `\n` for the
 * Enter that ended a line and `\b` for a backspace that erased one; the Screen has no notion of
 * erasing, so a backspace is a step left and a blank cell over what was there.
 */
export function echoToScreen(screen: Screen, text: string): void {
    for (const character of text) {
        if (character !== BACKSPACE) {
            screen.writeText(character)
            continue
        }
        const column = Math.max(0, screen.cursorColumn - 1)
        screen.setCursor(column, screen.cursorRow)
        screen.writeText(' ')
        screen.setCursor(column, screen.cursorRow)
    }
}

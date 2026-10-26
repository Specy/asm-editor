import { ScopedTheme, ThemeStore } from '#stores/themeStore.svelte.ts'
import { EDITOR_FONT } from '#lib/monaco/editorFont.ts'
import { assemblyPaletteStyle } from './assemblyPalette'

/**
 * The custom properties a code block is painted by: the colours the editor's theme is made from
 * (`#lib/monaco/assemblyTokenColors.ts`) and the editor's font, so a block reads as the editor
 * would show it. The colours follow the secondary surface the page is drawn on, the same one the
 * editor draws on: the theme a layout dresses its subtree in, or the reader's own. It reads the
 * theme stores, so a component that calls it inside `$derived` follows them.
 */
export function codeBlockStyle(): string {
    const palette = assemblyPaletteStyle(
        ThemeStore.isColorDark(
            ScopedTheme.theme?.theme.secondary.color ?? ThemeStore.theme.secondary.color
        )
    )
    return [
        palette,
        `--example-font-family: ${EDITOR_FONT.fontFamily}`,
        `--example-font-size: ${EDITOR_FONT.fontSize}px`,
        `--example-line-height: ${EDITOR_FONT.lineHeight}px`
    ].join('; ')
}

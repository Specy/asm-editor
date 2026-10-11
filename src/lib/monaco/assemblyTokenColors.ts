/**
 * The colours of the tokens the assembly grammars emit, for a dark and a light editor surface. The
 * editor's theme (`./editorTheme.ts`) makes its rules for them from this table, and the static code
 * blocks that stand in for an editor (`#lib/content/assemblyPalette.ts`) paint with the same one,
 * so a block reads as the editor that replaces it.
 *
 * Monaco matches a rule to a token by its leading segments, so `number` also colours
 * `number.float` and `keyword` colours `keyword.instruction`. `number`, `number.hex`, `string`,
 * `tag` and the light `variable.predefined` are the colours Monaco's own `vs-dark` and `vs` themes
 * give them, spelled out here because a code block cannot read a theme it has not loaded.
 */
export const ASSEMBLY_TOKEN_COLORS = {
    dark: {
        comment: '#1f619a',
        keyword: '#ff9d00',
        directive: '#f26e6e',
        'variable.predefined': '#8673ff',
        'data-register': '#8673ff',
        'address-register': '#c26ef2',
        condition: '#c26ef2',
        number: '#b5cea8',
        'number.hex': '#5bb498',
        'number.immediate': '#47d3a8',
        string: '#ce9178',
        tag: '#569cd6'
    },
    light: {
        comment: '#506696',
        keyword: '#473fd8',
        directive: '#9f3b3b',
        'variable.predefined': '#4864aa',
        'data-register': '#037280',
        'address-register': '#9909eb',
        condition: '#9909eb',
        number: '#098658',
        'number.hex': '#3030c0',
        'number.immediate': '#006d4c',
        string: '#a31515',
        tag: '#800000'
    }
} as const

export type AssemblyThemeToken = keyof (typeof ASSEMBLY_TOKEN_COLORS)['dark']

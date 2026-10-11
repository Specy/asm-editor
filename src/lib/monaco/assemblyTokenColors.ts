/**
 * The colours of the tokens the assembly grammars emit, for a dark and a light editor surface. The
 * editor's theme (`./editorTheme.ts`) makes its rules for them from this table, and the static code
 * blocks that stand in for an editor (`#lib/content/assemblyPalette.ts`) paint with the same one,
 * so a block reads as the editor that replaces it.
 *
 * Monaco matches a rule to a token by its leading segments, so `number` also colours
 * `number.float` and `keyword` colours `keyword.instruction`, while `keyword.size` is its own.
 * `number`, `number.hex`, `string` and the light `variable.predefined` are the colours Monaco's own
 * `vs-dark` and `vs` themes give them, and `invalid` theirs for it, spelled out here because a code
 * block cannot read a theme it has not loaded.
 */
export const ASSEMBLY_TOKEN_COLORS = {
    dark: {
        comment: '#1f619a',
        keyword: '#ff9d00',
        'keyword.size': '#569cd6',
        directive: '#f26e6e',
        'variable.predefined': '#8673ff',
        'data-register': '#8673ff',
        'address-register': '#c26ef2',
        condition: '#c26ef2',
        number: '#b5cea8',
        'number.hex': '#5bb498',
        'number.immediate': '#47d3a8',
        string: '#ce9178',
        invalid: '#f44747'
    },
    light: {
        comment: '#506696',
        keyword: '#473fd8',
        'keyword.size': '#795e26',
        directive: '#9f3b3b',
        'variable.predefined': '#4864aa',
        'data-register': '#037280',
        'address-register': '#9909eb',
        condition: '#9909eb',
        number: '#098658',
        'number.hex': '#3030c0',
        'number.immediate': '#006d4c',
        string: '#a31515',
        invalid: '#cd3131'
    }
} as const

export type AssemblyThemeToken = keyof (typeof ASSEMBLY_TOKEN_COLORS)['dark']

/**
 * How each token is drawn besides its colour: a comment in italics, a word the assembler refuses
 * struck through, so it reads as an error and not as the directive red beside it.
 */
export const ASSEMBLY_TOKEN_FONT_STYLES: Partial<Record<AssemblyThemeToken, string>> = {
    comment: 'italic',
    invalid: 'strikethrough'
}

/**
 * The colours Monaco gives a bracket by how deeply it is nested, cycling through them, and the one
 * for a closing bracket nothing opened. Its own defaults, set on the theme from here so the code
 * blocks colour their brackets the same.
 */
export const ASSEMBLY_BRACKET_COLORS = {
    dark: { levels: ['#ffd700', '#da70d6', '#179fff'], unexpected: '#ff1212cc' },
    light: { levels: ['#0431fa', '#319331', '#7b3814'], unexpected: '#ff1212cc' }
} as const

/** Every Monaco editor and the static code blocks that stand in for one share these font settings. */
export const EDITOR_FONT = {
    //`--font-mono`'s names: Fira Code, then its stand-ins sized to its widths (styles/fonts.css)
    fontFamily: "'Fira Code', 'Fira Code fallback', 'Fira Code fallback Consolas', monospace",
    //the weight styles/fonts.css draws Fira Code's default in, named so that Monaco measures what
    //it draws
    fontWeight: '500',
    fontSize: 16,
    lineHeight: 22
} as const

/** Every Monaco editor and the static code blocks that stand in for one share these font settings. */
export const EDITOR_FONT = {
    fontFamily: "'Fira Code', monospace",
    //the weight global.css draws Fira Code's default in, named so that Monaco measures what it draws
    fontWeight: '500',
    fontSize: 16,
    lineHeight: 22
} as const

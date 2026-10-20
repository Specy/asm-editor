declare module 'monaco-editor/languages/definitions/cpp/cpp.js' {
    /**
     * Monaco's one C/C++ grammar, which its `c` and `cpp` language ids share. The file has no
     * declarations of its own; these are the parts `./cppHighlight.ts` reads.
     */
    export const conf: import('monaco-editor').languages.LanguageConfiguration
    export const language: import('monaco-editor').languages.IMonarchLanguage & {
        keywords: string[]
        operators: string[]
    }
}

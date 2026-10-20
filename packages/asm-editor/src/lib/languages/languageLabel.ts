/** Display names are separate from the identifiers saved in projects and URLs. */
export function languageLabel(language: string): string {
    return language.toLowerCase() === 'x86' ? 'x86-64' : language
}

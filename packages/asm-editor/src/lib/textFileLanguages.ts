/**
 * The language a text File that is neither the Target's assembly nor C or C++ is highlighted as,
 * by its extension as a C File's is: Markdown notes, a Python solver, JSON, plain text. Each is a
 * language Monaco defines itself, so nothing has to be registered for it. An extension not listed
 * here keeps the Target's assembly, as every text File had before, since an include File's
 * extension is anyone's guess.
 */
const TEXT_FILE_LANGUAGES = new Map(
    Object.entries({
        md: 'markdown',
        markdown: 'markdown',
        txt: 'plaintext',
        text: 'plaintext',
        log: 'plaintext',
        csv: 'plaintext',
        tsv: 'plaintext',
        py: 'python',
        json: 'json',
        js: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        ts: 'typescript',
        sh: 'shell',
        bash: 'shell',
        yml: 'yaml',
        yaml: 'yaml',
        ini: 'ini',
        cfg: 'ini',
        conf: 'ini',
        toml: 'ini',
        xml: 'xml',
        svg: 'xml',
        html: 'html',
        htm: 'html',
        css: 'css',
        rs: 'rust',
        go: 'go',
        java: 'java',
        rb: 'ruby',
        lua: 'lua',
        sql: 'sql',
        ps1: 'powershell',
        bat: 'bat',
        cmd: 'bat'
    } as const)
)

export type TextFileLanguage = typeof TEXT_FILE_LANGUAGES extends Map<string, infer L> ? L : never

const LANGUAGE_IDS = new Set<string>(TEXT_FILE_LANGUAGES.values())

/** The language of a text File by its extension, when it names one of the formats above. */
export function textFileLanguage(path: string): TextFileLanguage | undefined {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    //`.gitignore` is a name, not an extension
    if (dot <= 0) return undefined
    return TEXT_FILE_LANGUAGES.get(name.slice(dot + 1).toLowerCase())
}

export function isTextFileLanguage(language: string): language is TextFileLanguage {
    return LANGUAGE_IDS.has(language)
}

/** A Markdown File, which the Workbench can show as its Preview as well as its text. */
export function isMarkdownPath(path: string): boolean {
    return textFileLanguage(path) === 'markdown'
}

/** Shared byte and path rules for persistence, assembly, and the FileSystem. */
export type FileEncoding = 'plain' | 'base64'
export type ProjectFile = Readonly<{ encoding: FileEncoding; content: string }>
export type ProjectFiles = Readonly<Record<string, ProjectFile>>
export const FILE_ENCODINGS: readonly FileEncoding[] = ['plain', 'base64']
export const FILE_BYTE_LIMIT = 16 * 1024 * 1024
export const FILE_COUNT_LIMIT = 4096
export const PATH_BYTE_LIMIT = 1024
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export class ProjectFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectFormatError'
    }
}

export function isValidFilePath(path: string): boolean {
    return (
        typeof path === 'string' &&
        path.length > 0 &&
        encoder.encode(path).length <= PATH_BYTE_LIMIT &&
        decoder.decode(encoder.encode(path)) === path &&
        !path.includes('\\') &&
        !Array.from(path).some((character) => {
            const code = character.charCodeAt(0)
            return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
        }) &&
        path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    )
}

export function resolveFilePath(path: string): string {
    const parts: string[] = []
    for (const part of path.replace(/^\//, '').split('/')) {
        if (part === '.') continue
        if (part === '..') {
            if (!parts.length) throw new ProjectFormatError('Path escapes the Project root')
            parts.pop()
        } else parts.push(part)
    }
    const result = parts.join('/')
    if (!isValidFilePath(result)) throw new ProjectFormatError(`Invalid file path: ${path}`)
    return result
}

export function fileBytes(file: ProjectFile): Uint8Array {
    if (file.encoding === 'plain') {
        const bytes = encoder.encode(file.content)
        if (decoder.decode(bytes) !== file.content)
            throw new ProjectFormatError('Text contains an unpaired surrogate')
        return bytes
    }
    if (
        file.encoding !== 'base64' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)
    ) {
        throw new ProjectFormatError('Invalid file encoding or base64 content')
    }
    const raw = atob(file.content)
    if (btoa(raw) !== file.content) throw new ProjectFormatError('Noncanonical base64 content')
    return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function bytesFile(bytes: Uint8Array): ProjectFile {
    try {
        return Object.freeze({ encoding: 'plain', content: decoder.decode(bytes) })
    } catch {
        let raw = ''
        for (let i = 0; i < bytes.length; i += 8192)
            raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
        return Object.freeze({ encoding: 'base64', content: btoa(raw) })
    }
}

/** Rebuilds an archive's chosen storage representation without changing any of its bytes. */
export function projectFileFromBytes(bytes: Uint8Array, encoding: FileEncoding): ProjectFile {
    const automatic = bytesFile(bytes)
    if (encoding === 'plain') {
        if (automatic.encoding !== 'plain') {
            throw new ProjectFormatError('A plain File contains invalid UTF-8')
        }
        return automatic
    }
    if (encoding !== 'base64') throw new ProjectFormatError('Invalid file encoding')
    let raw = ''
    for (let i = 0; i < bytes.length; i += 8192) {
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    return Object.freeze({ encoding: 'base64', content: btoa(raw) })
}

export function fileText(file: ProjectFile): string {
    try {
        return decoder.decode(fileBytes(file))
    } catch {
        throw new ProjectFormatError('File is not readable UTF-8 text')
    }
}

export function cleanFiles(raw: unknown): ProjectFiles {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ProjectFormatError('Files must be a path-to-file map')
    const entries = Object.entries(raw)
    if (entries.length > FILE_COUNT_LIMIT)
        throw new ProjectFormatError('Project exceeds the 4,096-file limit')
    const files: Record<string, ProjectFile> = Object.create(null)
    let size = 0
    for (const [path, value] of entries) {
        if (!isValidFilePath(path)) throw new ProjectFormatError(`Invalid file path: ${path}`)
        if (
            !value ||
            typeof value !== 'object' ||
            typeof value.content !== 'string' ||
            !FILE_ENCODINGS.includes(value.encoding)
        ) {
            throw new ProjectFormatError(`Invalid contents or encoding for ${path}`)
        }
        if (value.content.length > (FILE_BYTE_LIMIT * 4) / 3 + 4)
            throw new ProjectFormatError('Project exceeds the 16 MiB file limit')
        const bytes = fileBytes(value)
        size += bytes.length
        if (size > FILE_BYTE_LIMIT)
            throw new ProjectFormatError('Project exceeds the 16 MiB file limit')
        files[path] = Object.freeze({ encoding: value.encoding, content: value.content })
    }
    for (const path of Object.keys(files)) {
        const parts = path.split('/')
        parts.pop()
        while (parts.length) {
            if (hasOwn(files, parts.join('/')))
                throw new ProjectFormatError(`File/directory collision: ${path}`)
            parts.pop()
        }
    }
    return Object.freeze(files)
}

export type BuildSources = Readonly<{ files: ProjectFiles; entry: string }>

export type BuildInput = string | BuildSources

export function normalizeBuildInput(input: BuildInput): BuildSources {
    if (typeof input !== 'string') {
        if (!isValidFilePath(input.entry)) {
            throw new ProjectFormatError(`Invalid entry path: ${input.entry}`)
        }
        return Object.freeze({ files: cleanFiles(input.files), entry: input.entry })
    }
    return Object.freeze({
        files: cleanFiles({ main: { encoding: 'plain', content: input } }),
        entry: 'main'
    })
}

export function updateEntryText(sources: BuildSources, text: string): BuildSources {
    return Object.freeze({
        entry: sources.entry,
        files: cleanFiles({
            ...sources.files,
            [sources.entry]: { encoding: 'plain', content: text }
        })
    })
}

export function sourceText(sources: BuildSources): string {
    const file = sources.files[sources.entry]
    if (!file) throw new ProjectFormatError(`Entry file not found: ${sources.entry}`)
    return fileText(file)
}

export function assemblyFiles(sources: BuildSources): Record<string, string | Uint8Array> {
    return Object.fromEntries(
        Object.entries(sources.files).map(([path, file]) => {
            try {
                return [path, fileText(file)]
            } catch {
                return [path, fileBytes(file)]
            }
        })
    )
}

/** Text-only assemblers must not receive unrelated binary assets as bogus source strings. */
export function textAssemblyFiles(sources: BuildSources): Record<string, string> {
    sourceText(sources)
    return Object.fromEntries(
        Object.entries(sources.files).flatMap(([path, file]) => {
            try {
                return [[path, fileText(file)]]
            } catch {
                return []
            }
        })
    )
}

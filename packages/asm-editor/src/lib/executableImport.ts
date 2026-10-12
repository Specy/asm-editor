import { makeProject, makeProjectFromExternal, type ExternalImport } from './Project.svelte'
import { looksLikeZip, makeProjectFromArchive } from './projectArchive'
import { bytesFile } from './projectFiles'
import { executableKind, type ExecutableKind } from './executables'

/** Undefined leaves text and Project archives to their existing importers. */
export function makeProjectFromExecutable(
    bytes: Uint8Array,
    name: string,
    kind: ExecutableKind = executableKind(bytes)
): ExternalImport | undefined {
    if (kind === 'none') return undefined
    if (kind !== 'supported') throw new Error(kind.unsupported)
    return {
        project: makeProject({
            language: 'X86',
            name,
            files: { [name]: bytesFile(bytes) },
            entry: name
        })
    }
}

/** What the Projects page's Import made of a file, and how it may be saved back. */
export type ImportedFile = {
    imported: ExternalImport
    /**
     * An Executable is imported into a new Project, never saved back over the file it came from:
     * saving writes a Project, which would replace the ELF.
     */
    executable: boolean
    /** A Project archive saves back as an archive, anything else as a source file. */
    archive: boolean
}

/**
 * Reads a file the Projects page imports: an ELF, recognised by its bytes since CTF binaries rarely
 * have an extension, before a Project archive (a zip, or an `.asmproj` or `.zip` name) and text.
 * Throws for an ELF the editor cannot run, with the reason, and for anything else that is not text
 * (an image, a PDF), which would otherwise become a Project of replacement characters.
 */
export function importFile(bytes: Uint8Array, fileName: string): ImportedFile {
    const kind = executableKind(bytes)
    if (kind !== 'none')
        return {
            imported: makeProjectFromExecutable(bytes, fileName, kind)!,
            executable: true,
            archive: false
        }
    const archive = looksLikeZip(bytes)
    return {
        imported:
            archive || /\.(?:asmproj|zip)$/i.test(fileName)
                ? makeProjectFromArchive(bytes)
                : makeProjectFromExternal(importedText(bytes, fileName)),
        executable: false,
        archive
    }
}

/** A text file's contents: valid UTF-8 without NUL characters, which no source or Project has. */
function importedText(bytes: Uint8Array, fileName: string): string {
    let text: string
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        text = '\0'
    }
    if (text.includes('\0'))
        throw new Error(
            `${fileName} is not a Project: it is neither text, a Project archive nor an x86-64 Linux executable`
        )
    return text
}

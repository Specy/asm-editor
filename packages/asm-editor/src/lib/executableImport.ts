import { makeProject, type ExternalImport } from './Project.svelte'
import { bytesFile } from './projectFiles'
import { executableKind } from './executables'

/** Undefined leaves text and Project archives to their existing importers. */
export function makeProjectFromExecutable(
    bytes: Uint8Array,
    name: string
): ExternalImport | undefined {
    const file = bytesFile(bytes)
    const kind = executableKind(file)
    if (kind === 'none') return undefined
    if (kind !== 'supported') throw new Error(kind.unsupported)
    return { project: makeProject({ language: 'X86', name, files: { [name]: file }, entry: name }) }
}

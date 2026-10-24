import { executableKind } from '#lib/executables.ts'
import type { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

/** The Project an upload writes into, and what its host does once the Files are in. */
export interface UploadDestination {
    fileSystem: FileSystem
    language: AvailableLanguages
    /** Whether the Project had a Program before the upload. */
    hadProgram: boolean
    /** Whether the File at `path` is a Program's Entry. */
    isEntry: (path: string) => boolean
    /**
     * Whether changes to the Files are refused now: a Debug session or a test run may start while
     * a question is open.
     */
    locked: () => boolean
    /** The paths written, in order, once every file is: the host shows them. */
    onAdded: (paths: string[]) => void
    /** Makes the File at `path` a Program's Entry; without it none is offered. */
    onNewProgram?: (path: string) => void
}

/**
 * Writes files from the computer into `folder` ('' is the Project's root), asking before one
 * replaces a File: the Explorer's upload and drops, a drop on an editor pane and the empty
 * editor's ELF upload. A file that fails is reported and skipped. In an x86 Project that had a
 * Program, an Executable that is no Entry is then offered a Program of its own
 * ([programs-plan.md](../../../../../docs/design/programs-plan.md), decision 12); one with none
 * makes its first Program from the upload without asking. The paths written, in order.
 */
export async function writeUploads(
    uploaded: Iterable<File>,
    folder: string,
    destination: UploadDestination
): Promise<string[]> {
    const { fileSystem, language } = destination
    const added: string[] = []
    let executable: string | undefined
    for (const file of uploaded) {
        const path = folder ? `${folder}/${file.name}` : file.name
        try {
            if (fileSystem.files[path]) {
                const replace = await Prompt.confirm(`${path} already exists. Replace it?`)
                if (!replace) continue
            }
            //a Debug session or a test run may have started while the question was open
            if (destination.locked()) break
            const bytes = new Uint8Array(await file.arrayBuffer())
            fileSystem.writeBytes(path, bytes, true)
            added.push(path)
            //only an x86 Project runs ELFs: elsewhere an ELF is just a File
            if (language !== 'X86') continue
            const kind = executableKind(bytes)
            if (kind === 'supported') executable = path
            else if (kind !== 'none') toast.warn(`${path}: ${kind.unsupported}`)
        } catch (error) {
            console.error(error)
            toast.error(error instanceof Error ? error.message : 'File operation failed')
        }
    }
    if (!added.length) return added
    destination.onAdded(added)
    const { onNewProgram } = destination
    if (destination.hadProgram && executable && onNewProgram && !destination.isEntry(executable)) {
        //a Debug session may have started while the question was open
        if ((await Prompt.confirm(`Create a program for ${executable}?`)) && !destination.locked())
            onNewProgram(executable)
    }
    return added
}

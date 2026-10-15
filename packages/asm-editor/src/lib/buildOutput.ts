import { commandLineProgram } from './commandLine'
import {
    encodeBase64,
    type BuildSources,
    type ProjectFile,
    type ProjectFiles
} from './projectFiles'

/**
 * The executable a Build linked from its sources, shown beside the Project's Files and never saved
 * with them ([ADR 0050](../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)):
 * only x86 Builds link one. It lasts until the next Build starts.
 */
export type BuildOutput = {
    /**
     * Where it is: the Entry path without its extension, or for compiled code the source File's,
     * the name the Command line starts the program under (`main` for `main.asm` and `main.c`).
     */
    readonly path: string
    readonly bytes: Uint8Array
    /** Counts the Build outputs an Emulator made, so that one Build's is told from the next's. */
    readonly generation: number
    /** What it was built from, which the live Files are compared with to tell it is stale. */
    readonly sources: BuildSources
}

/** Where a Build of these sources places the program it links ([file-views.md](../../../../docs/design/file-views.md), decision 18). */
export function buildOutputPath(sources: BuildSources): string {
    return commandLineProgram(sources.entry, false, sources.entrySource)
}

/**
 * What of the Project's already has the Build output's path: a File, which wins, as `ld` would
 * overwrite a File the person owns; or a folder, where no File can go.
 */
export function buildOutputCollision(
    files: ProjectFiles,
    path: string
): 'file' | 'folder' | undefined {
    if (Object.hasOwn(files, path)) return 'file'
    const folder = `${path}/`
    return Object.keys(files).some((other) => other.startsWith(folder)) ? 'folder' : undefined
}

/** The Log's note for a Build output a Project's File or folder kept from its path. */
export function buildOutputCollisionNote(path: string, collision: 'file' | 'folder'): string {
    return `\`${path}\` is already a ${collision === 'file' ? 'File' : 'folder'} of the Project, so the built program is not shown; rename one of them.`
}

const records = new WeakMap<BuildOutput, ProjectFile>()

/**
 * The Build output as the record the views read a File from: stored as bytes, as an uploaded
 * Executable is, and made once for each Build output.
 */
export function buildOutputFile(output: BuildOutput): ProjectFile {
    let file = records.get(output)
    if (!file) {
        file = Object.freeze({ encoding: 'base64', content: encodeBase64(output.bytes) })
        records.set(output, file)
    }
    return file
}

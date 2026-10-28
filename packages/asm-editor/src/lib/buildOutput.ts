import { commandLineProgram } from './commandLine'
import {
    buildConfigurationKey,
    FILE_COUNT_LIMIT,
    isValidFilePath,
    type BuildConfiguration,
    type BuildSources,
    type ProjectFile,
    type ProjectFiles
} from './projectFiles'
import { contentFingerprint, fileFingerprint } from './sourceCompilation/fingerprints'

/**
 * Each File's fingerprint, kept by its record, which a change replaces rather than alters: telling
 * whether Build outputs are stale runs at every change to the Files, and fingerprints every File a
 * Build read, of which a keystroke changes one.
 */
const fingerprints = new WeakMap<ProjectFile, string>()
function fingerprintOf(file: ProjectFile | undefined): string | undefined {
    if (!file) return undefined
    let fingerprint = fingerprints.get(file)
    if (fingerprint === undefined) {
        fingerprint = fileFingerprint(file)!
        fingerprints.set(file, fingerprint)
    }
    return fingerprint
}

/**
 * Saved Project metadata on a **Build output**, the File an x86 Build saved the program it linked
 * in ([ADR 0056](../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)): what
 * it was built from and what it saved, by fingerprints, as a Compilation record names Generated
 * assembly's inputs ([ADR 0028](../../../../docs/adr/0028-persist-compilation-records-with-transient-source-maps.md)).
 * A Project keeps one for each path a Build saved a program at, and none once that File is renamed
 * or removed.
 */
export type BuildRecord = {
    /** The Entry the Build built, its Program's. */
    entry: string
    /**
     * Where it saved the program: the Entry path without its extension, and with `.S68` for an
     * M68K S-record (`BuildOutputFormat`).
     */
    outputPath: string
    /** Each File the Build read, but the Build outputs, by its content's fingerprint. */
    inputs: Readonly<Record<string, string>>
    /** The fingerprint of its Build configuration: the assembler, the Runtime library, the start. */
    configuration: string
    /** The fingerprint of the File it saved. */
    outputFingerprint: string
}

/**
 * What a Build's output is: the `executable` an x86 Build links, saved as bytes at the Entry path
 * without its extension, as `ld -o main` names it; or the `srecord` an M68K Build writes while
 * `m68kSRecordOutput` is on, EASy68K's S-record of the program, saved as text beside it as
 * `main.S68`, the name EASy68K's assembler gives it. That switch is off until the Build output
 * format is chosen ([m68k-machine.md](../../../../docs/design/m68k-machine.md), decision 32).
 */
export type BuildOutputFormat = 'executable' | 'srecord'

/** How a Build output of `format` is stored as a File: an executable's bytes, an S-record's text. */
export function buildOutputEncoding(format: BuildOutputFormat): 'base64' | 'plain' {
    return format === 'srecord' ? 'plain' : 'base64'
}

/** What a Workbench does with the program a Build linked, see `GenericEmulator.setBuildOutputHost`. */
export type BuildOutputHost = {
    /**
     * What a person's Build does with the program it linked for `path`: `save` it as the Build
     * output, replacing what is there; `present` it to the running program alone, as a Project that
     * cannot change has it; or leave it out, with the Log's `note` saying why. It asks the person
     * before replacing a File that is not a Build output nobody changed since, and an aborted
     * `signal` takes the question back.
     */
    claim(path: string, signal: AbortSignal): Promise<BuildOutputClaim>
    /**
     * Saves the program at `path`, stored as `format` is (`buildOutputEncoding`), with the record
     * of what `sources` built it from.
     */
    save(sources: BuildSources, path: string, bytes: Uint8Array, format: BuildOutputFormat): void
    /**
     * Whether the File at `path` is a Build output nobody changed since, whose place a Testcase's
     * program takes in that Testcase's own FileSystem.
     */
    isBuildOutput(path: string): boolean
}

export type BuildOutputClaim = 'save' | 'present' | { note: string }

/**
 * How the Workbench shows a Build output nobody changed since its Build: the Entry of the Program
 * it was built for, and whether its sources have changed since (From an earlier Build).
 */
export type BuildOutputState = { readonly entry: string; readonly stale: boolean }

/**
 * Where a Build of these sources saves the program it links ([file-views.md](../../../../docs/design/file-views.md),
 * decision 18): the name the Command line runs it as, `main` for `main.asm`, and for an M68K
 * S-record that name with EASy68K's extension, `main.S68` for `main.x68`.
 */
export function buildOutputPath(
    sources: BuildSources,
    format: BuildOutputFormat = 'executable'
): string {
    const program = commandLineProgram(sources.entry, false, sources.entrySource)
    return format === 'srecord' ? `${program}.S68` : program
}

/** What of the Project's already has the Build output's path: a File, or a folder. */
export function buildOutputCollision(
    files: ProjectFiles,
    path: string
): 'file' | 'folder' | undefined {
    if (Object.hasOwn(files, path)) return 'file'
    const folder = `${path}/`
    return Object.keys(files).some((other) => other.startsWith(folder)) ? 'folder' : undefined
}

/**
 * The Log's note for a program a Build did not save: a folder, or the Entry or the source it was
 * compiled from, is where it would go, the person kept the File there, or saving it failed
 * (`unsaved`, with the failure as `detail`), as at the Project's 16 MiB limit.
 */
export function buildOutputNote(
    path: string,
    reason: 'folder' | 'source' | 'kept' | 'unsaved',
    detail = ''
): string {
    if (reason === 'unsaved')
        return `The built program could not be saved as \`${path}\`: ${detail}`
    if (reason === 'folder')
        return `\`${path}\` is a folder of the Project, so the built program is not saved; rename one of them.`
    if (reason === 'source')
        return `\`${path}\` is the program's own source, so the built program is not saved; give it an extension, such as \`${path}.asm\`.`
    return `\`${path}\` was kept, so the built program is not saved; rename one of them to save it.`
}

/** What a Build asks before it replaces the File at `path`, which `record` says a Build made. */
export function buildOutputQuestion(path: string, record: BuildRecord | undefined): string {
    return record
        ? `${path} was changed since a Build saved it. Building replaces it with the program it links, without the changes made to its bytes, its renames and its comments. Replace it?`
        : `${path} already exists. Building replaces it with the program it links. Replace it?`
}

/** The fingerprint a record keeps of a Build configuration. */
export function buildConfigurationFingerprint(configuration: BuildConfiguration): string {
    return contentFingerprint(buildConfigurationKey(configuration))
}

/**
 * The record of a Build of `sources` that saved `output` at `outputPath`. Its inputs are the
 * Files it read but the Build outputs, `outputs`, which a Build makes rather than reads: one
 * Program's Build does not leave another's From an earlier Build.
 */
export function makeBuildRecord(
    sources: BuildSources,
    outputPath: string,
    output: ProjectFile,
    outputs: readonly string[]
): BuildRecord {
    const inputs = Object.entries(sources.files).flatMap(([path, file]) =>
        path === outputPath || outputs.includes(path) ? [] : [[path, fingerprintOf(file)!] as const]
    )
    return {
        entry: sources.entry,
        outputPath,
        inputs: Object.fromEntries(inputs),
        configuration: buildConfigurationFingerprint(sources),
        outputFingerprint: fingerprintOf(output)!
    }
}

/**
 * Whether `file` is the program `record`'s Build saved, as it saved it: the same bytes and no
 * Annotations. Such a File is derived: a Build replaces it without asking, and it is left out
 * wherever the Project leaves the browser, since a Build makes it again.
 */
export function isUntouchedBuildOutput(record: BuildRecord, file: ProjectFile | undefined) {
    return !!file && !file.annotations && fingerprintOf(file) === record.outputFingerprint
}

/** The record of the Build that saved the File at `path`, if one did. */
export function buildRecordAt(
    records: readonly BuildRecord[] | undefined,
    path: string
): BuildRecord | undefined {
    return records?.find((record) => record.outputPath === path)
}

/** The paths of the Build outputs among `files` that nobody has changed since their Build. */
export function untouchedBuildOutputs(
    files: ProjectFiles,
    records: readonly BuildRecord[] | undefined
): Set<string> {
    return new Set(
        (records ?? [])
            .filter((record) => isUntouchedBuildOutput(record, files[record.outputPath]))
            .map((record) => record.outputPath)
    )
}

/**
 * Whether a Build output is from an earlier Build than its Program's sources would make now
 * (`live`, none once the Program is gone): another Build configuration, or a File it was built from
 * changed or gone. A File added since does not count, since a Build that succeeded without it read
 * nothing of it.
 */
export function buildOutputStale(
    record: BuildRecord,
    live: BuildSources | undefined,
    files: ProjectFiles
): boolean {
    if (!live || live.entry !== record.entry) return true
    if (buildConfigurationFingerprint(live) !== record.configuration) return true
    return Object.entries(record.inputs).some(
        ([path, fingerprint]) => fingerprintOf(files[path]) !== fingerprint
    )
}

const FINGERPRINT = /^[a-f0-9]{32}$/
const isFingerprint = (value: unknown): value is string =>
    typeof value === 'string' && FINGERPRINT.test(value)
const isPath = (value: unknown): value is string =>
    typeof value === 'string' && isValidFilePath(value)

/**
 * Saved Build records, from storage, an archive or a share link: what cannot be used is dropped,
 * one by one, since a record is only ever about a File the Project has without it, and a Project
 * always loads. One record per output path, the last kept.
 */
export function cleanBuildRecords(raw: unknown): BuildRecord[] | undefined {
    if (!Array.isArray(raw)) return undefined
    const byOutput = new Map<string, BuildRecord>()
    for (const value of raw.slice(-FILE_COUNT_LIMIT)) {
        if (!value || typeof value !== 'object') continue
        const { entry, outputPath, inputs, configuration, outputFingerprint } = value as Record<
            string,
            unknown
        >
        if (
            !isPath(entry) ||
            !isPath(outputPath) ||
            entry === outputPath ||
            !isFingerprint(configuration) ||
            !isFingerprint(outputFingerprint) ||
            !inputs ||
            typeof inputs !== 'object' ||
            Array.isArray(inputs)
        )
            continue
        const entries = Object.entries(inputs)
        if (
            entries.length > FILE_COUNT_LIMIT ||
            !entries.every(([path, fingerprint]) => isPath(path) && isFingerprint(fingerprint))
        )
            continue
        byOutput.delete(outputPath)
        byOutput.set(outputPath, {
            entry,
            outputPath,
            inputs: Object.fromEntries(entries) as Record<string, string>,
            configuration,
            outputFingerprint
        })
    }
    return byOutput.size ? [...byOutput.values()] : undefined
}

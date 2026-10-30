/**
 * Build records and the Build outputs they describe: what a Build was built from, when its output
 * is stale or changed, and that a Build output nobody changed leaves the browser with none of the
 * Project's ways out ([ADR 0056](../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).
 */
import { describe, expect, it } from 'vite-plus/test'
import { unzipSync } from 'fflate'
import lzstring from 'lz-string'
import { serializer } from '#lib/json.ts'
import { createSharePayload } from '#lib/utils.ts'
import {
    buildOutputEncoding,
    buildOutputPath,
    buildOutputStale,
    cleanBuildRecords,
    isUntouchedBuildOutput,
    makeBuildRecord,
    untouchedBuildOutputs,
    type BuildRecord
} from '#lib/buildOutput.ts'
import { makeProject, normalizeProjectData, withoutBuildOutputs } from '#lib/Project.svelte.ts'
import {
    isLegacyLinkedFileCompatible,
    isSingleSourceProject,
    projectDownload,
    projectToArchive
} from '#lib/projectArchive.ts'
import {
    encodeBase64,
    overwriteBytes,
    type BuildSources,
    type ProjectFile
} from '#lib/projectFiles.ts'

const plain = (content: string): ProjectFile => ({ encoding: 'plain', content })
const program = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0])
const built: ProjectFile = { encoding: 'base64', content: encodeBase64(program) }

/** `main.asm`, and `main` as a Build of it saved it, with its record. */
function project() {
    const sources: BuildSources = { entry: 'main.asm', files: { 'main.asm': plain('nop') } }
    const created = makeProject({
        language: 'X86',
        entry: 'main.asm',
        files: sources.files,
        openTabs: ['main.asm', 'main'],
        activeTab: 'main'
    })
    created.fileSystem.writeBytes('main', program, true, 'base64')
    created.recordBuild(makeBuildRecord(sources, 'main', created.files.main, []))
    created.setFileView('main', 'hex')
    created.setOpenTabs(['main.asm', 'main'], 'main')
    return created
}

describe('where a Build saves its output', () => {
    it('names an executable as the Command line runs it, and an S-record with EASy68K’s extension', () => {
        const sources = (entry: string): BuildSources => ({ entry, files: {} })
        expect(buildOutputPath(sources('src/main.asm'))).toBe('src/main')
        expect(buildOutputPath(sources('main.x68'), 'srecord')).toBe('main.S68')
        expect(buildOutputPath(sources('src/game.s'), 'srecord')).toBe('src/game.S68')
        //an executable is bytes, an S-record text to be read
        expect(buildOutputEncoding('executable')).toBe('base64')
        expect(buildOutputEncoding('srecord')).toBe('plain')
    })
})

describe('a Build record', () => {
    it('fingerprints each File the Build read but the Build outputs, and its configuration', () => {
        const sources: BuildSources = {
            entry: 'main.asm',
            entrySymbol: '_start',
            files: { 'main.asm': plain('nop'), main: built, other: built, 'lib.inc': plain('') }
        }
        const record = makeBuildRecord(sources, 'main', built, ['other'])
        expect(record.entry).toBe('main.asm')
        expect(record.outputPath).toBe('main')
        expect(Object.keys(record.inputs)).toEqual(['main.asm', 'lib.inc'])
        //the same configuration however its Generated assembly paths are ordered
        const reordered = makeBuildRecord(
            { ...sources, compiledLanguages: { 'b.c.asm': 'c', 'a.c.asm': 'cpp' } },
            'main',
            built,
            []
        )
        const ordered = makeBuildRecord(
            { ...sources, compiledLanguages: { 'a.c.asm': 'cpp', 'b.c.asm': 'c' } },
            'main',
            built,
            []
        )
        expect(reordered.configuration).toBe(ordered.configuration)
        expect(reordered.configuration).not.toBe(record.configuration)
    })

    it('says its output is untouched only while it holds the bytes the Build saved, alone', () => {
        const record = makeBuildRecord({ entry: 'main.asm', files: {} }, 'main', built, [])
        expect(isUntouchedBuildOutput(record, built)).toBe(true)
        expect(isUntouchedBuildOutput(record, undefined)).toBe(false)
        expect(
            isUntouchedBuildOutput(record, { ...built, content: encodeBase64(program.slice(1)) })
        ).toBe(false)
        expect(
            isUntouchedBuildOutput(
                record,
                overwriteBytes(built, [{ offset: 0, bytes: Uint8Array.of(0x90) }])!.file
            )
        ).toBe(false)
        expect(
            isUntouchedBuildOutput(record, { ...built, annotations: { names: { '0x0': 'x' } } })
        ).toBe(false)
    })

    it('is stale once its Program would build something else', () => {
        const files = { 'main.asm': plain('nop'), main: built }
        const sources: BuildSources = { entry: 'main.asm', files }
        const record = makeBuildRecord(sources, 'main', built, [])
        expect(buildOutputStale(record, sources, files)).toBe(false)
        //a File added since was not read
        const added = { ...files, 'notes.txt': plain('') }
        expect(buildOutputStale(record, { ...sources, files: added }, added)).toBe(false)
        const edited = { ...files, 'main.asm': plain('nop\nnop') }
        expect(buildOutputStale(record, { ...sources, files: edited }, edited)).toBe(true)
        expect(buildOutputStale(record, { ...sources, entrySymbol: '_start' }, files)).toBe(true)
        expect(buildOutputStale(record, undefined, files)).toBe(true)
    })
})

describe('saved Build records', () => {
    const record = makeBuildRecord(
        { entry: 'main.asm', files: { 'main.asm': plain('nop') } },
        'main',
        built,
        []
    )

    it('are read one by one, dropping what cannot be used, one per output path', () => {
        const later = { ...record, entry: 'other.asm' }
        expect(cleanBuildRecords(undefined)).toBeUndefined()
        expect(cleanBuildRecords('records')).toBeUndefined()
        expect(
            cleanBuildRecords([
                record,
                { ...record, outputPath: '../main' },
                { ...record, outputPath: 'main.asm' },
                { ...record, configuration: 'nope' },
                { ...record, inputs: { 'main.asm': 'nope' } },
                { ...record, inputs: [] },
                null,
                later
            ])
        ).toEqual([later])
    })

    it('are kept with the Project only while its output is one of its Files', () => {
        const data = normalizeProjectData({
            language: 'X86',
            entry: 'main.asm',
            files: { 'main.asm': plain('nop'), main: built },
            builds: [record, { ...record, outputPath: 'gone' }] as BuildRecord[]
        })
        expect(data.builds).toEqual([record])
        expect(untouchedBuildOutputs(data.files, data.builds)).toEqual(new Set(['main']))
    })

    it('go when the File is renamed or removed, which makes it the person’s own', () => {
        const renamed = project()
        renamed.fileSystem.rename('main', 'bin/main')
        expect(renamed.builds).toEqual([])
        const removed = project()
        removed.fileSystem.remove('main')
        expect(removed.builds).toEqual([])
    })

    it('are saved with the Project, and come back with it', () => {
        const saved = project()
        const reopened = makeProject(saved.toObject())
        expect(reopened.builds).toEqual(saved.builds)
        expect(reopened.files.main).toEqual(built)
    })
})

describe('a Project leaving the browser', () => {
    it('leaves out the Build outputs nobody changed, their records and the tabs on them', () => {
        const data = withoutBuildOutputs(project().toObject())
        expect(Object.keys(data.files)).toEqual(['main.asm'])
        expect(data.builds).toBeUndefined()
        expect(data.openTabs).toEqual(['main.asm'])
        expect(data.activeTab).toBeUndefined()
        expect(data.fileViews).toBeUndefined()
        expect(data.programs).toEqual({ 'main.asm': expect.anything() })
    })

    it('keeps a Build output the person changed, with its record', () => {
        const changed = project()
        changed.fileSystem.annotate('main', { names: { '0x0': 'start' } })
        const data = withoutBuildOutputs(changed.toObject())
        expect(Object.keys(data.files).sort()).toEqual(['main', 'main.asm'])
        expect(data.builds).toHaveLength(1)
    })

    it('in a share link', () => {
        const payload = serializer.parse<{ files: object; builds?: unknown }>(
            lzstring.decompressFromEncodedURIComponent(createSharePayload(project()))
        )
        expect(Object.keys(payload.files)).toEqual(['main.asm'])
        expect(payload.builds).toBeUndefined()
    })

    it('in an archive', () => {
        const entries = Object.keys(unzipSync(projectToArchive(project())))
        expect(entries).toContain('files/main.asm')
        expect(entries).not.toContain('files/main')
    })

    it('as one source File, which a Build output does not stop it being', () => {
        const single = project()
        expect(isSingleSourceProject(single)).toBe(true)
        expect(isLegacyLinkedFileCompatible(single.toObject())).toBe(true)
        const download = projectDownload(single)
        expect(download.kind).toBe('source')
        expect(download.contents).not.toContain(built.content)
        expect(single.toExternal()).not.toContain('"main"')
        //a Build output the person changed is theirs, which only an archive holds
        single.fileSystem.annotate('main', { names: { '0x0': 'start' } })
        expect(isSingleSourceProject(single)).toBe(false)
        expect(projectDownload(single).kind).toBe('archive')
    })
})

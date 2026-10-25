import { describe, expect, it } from 'vite-plus/test'
import { unzipSync, zipSync } from 'fflate'
import lzstring from 'lz-string'
import { serializer } from '#lib/json.ts'
import { createSharePayload } from '#lib/utils.ts'
import {
    makeProject,
    makeProjectFromExternal,
    type Program,
    type StoredProject
} from '#lib/Project.svelte.ts'
import {
    isLegacyLinkedFileCompatible,
    isSingleSourceProject,
    looksLikeZip,
    makeProjectFromArchive,
    projectArchiveName,
    projectDownload,
    projectToArchive
} from '#lib/projectArchive.ts'
import { bytesFile, fileBytes, ProjectFormatError, type ProjectFile } from '#lib/projectFiles.ts'

const encoder = new TextEncoder()

describe('Project archives', () => {
    it('round trips metadata, bigints, paths, exact text and binary bytes', () => {
        const project = makeProject({
            id: 'archive-id',
            name: 'Archive test',
            description: 'all fields',
            language: 'MIPS',
            entry: 'src/main.mips',
            openTabs: ['src/lib.mips', 'src/main.mips'],
            activeTab: 'src/lib.mips',
            files: {
                'src/main.mips': { encoding: 'plain', content: 'include "lib.mips"\n\n' },
                'src/lib.mips': { encoding: 'plain', content: 'jr $ra\n' },
                'data/raw.bin': { encoding: 'base64', content: '/wAB' }
            },
            testcases: [
                {
                    input: [],
                    expectedOutput: '',
                    startingRegisters: {},
                    expectedRegisters: { v0: 12n },
                    startingMemory: [],
                    expectedMemory: []
                }
            ]
        })

        const archive = projectToArchive(project)
        const imported = makeProjectFromArchive(archive).project
        expect(looksLikeZip(archive)).toBe(true)
        expect(imported.selectedProgram).toBe('src/main.mips')
        expect(imported.openTabs).toEqual(['src/lib.mips', 'src/main.mips'])
        expect(imported.activeTab).toBe('src/lib.mips')
        expect(imported.code).toBe('include "lib.mips"\n\n')
        expect(imported.selected?.testcases[0]?.expectedRegisters.v0).toBe(12n)
        expect(imported.files['data/raw.bin']?.encoding).toBe('base64')
        expect(fileBytes(imported.files['data/raw.bin']!)).toEqual(
            new Uint8Array([0xff, 0x00, 0x01])
        )
    })

    it('preserves an empty Files map and a configured missing Entry', () => {
        const project = makeProject({ language: 'Z80', files: {}, entry: 'missing.z80' })
        const imported = makeProjectFromArchive(projectToArchive(project)).project
        expect(imported.files).toEqual({})
        expect(Object.keys(imported.programs)).toEqual(['missing.z80'])
        expect(imported.selectedProgram).toBe('missing.z80')
    })

    it('rejects non-project ZIPs and traversal paths instead of treating them as source', () => {
        expect(() =>
            makeProjectFromArchive(zipSync({ 'readme.txt': encoder.encode('hello') }))
        ).toThrow(ProjectFormatError)
        const manifest = encoder.encode(
            JSON.stringify({
                version: 1,
                project: {
                    id: '',
                    name: 'Bad',
                    description: '',
                    language: 'M68K',
                    entry: 'main.m68k',
                    settings: {},
                    createdAt: 0,
                    updatedAt: 0,
                    testcases: []
                },
                files: { '../escape': { encoding: 'plain' } }
            })
        )
        expect(() =>
            makeProjectFromArchive(
                zipSync({ 'project.json': manifest, 'files/../escape': encoder.encode('bad') })
            )
        ).toThrow(ProjectFormatError)
    })

    it('rejects bytes that contradict a plain manifest encoding', () => {
        const manifest = encoder.encode(
            JSON.stringify({
                version: 1,
                project: {
                    id: '',
                    name: 'Bad UTF-8',
                    description: '',
                    language: 'M68K',
                    entry: 'main.m68k',
                    settings: {},
                    createdAt: 0,
                    updatedAt: 0,
                    testcases: []
                },
                files: { 'main.m68k': { encoding: 'plain' } }
            })
        )
        expect(() =>
            makeProjectFromArchive(
                zipSync({ 'project.json': manifest, 'files/main.m68k': new Uint8Array([0xff]) })
            )
        ).toThrow('invalid UTF-8')
    })

    it('creates a safe dedicated filename', () => {
        expect(projectArchiveName(' My / Project ')).toBe('My___Project.asmproj')
    })
})

describe('the single Project download', () => {
    it('gives a one-File Project its source with the metadata block, losing nothing', async () => {
        const project = makeProject({
            name: 'My / Project',
            description: 'a description',
            language: 'MIPS',
            entry: 'main.mips',
            files: { 'main.mips': { encoding: 'plain', content: 'li $v0, 10\n' } },
            testcases: [
                {
                    input: [],
                    expectedOutput: 'done\n',
                    startingRegisters: {},
                    expectedRegisters: { v0: 12n },
                    startingMemory: [],
                    expectedMemory: []
                }
            ]
        })
        const download = projectDownload(project)
        expect(download.kind).toBe('source')
        expect(download.fileName).toBe('My___Project.mips')
        expect(typeof download.contents).toBe('string')

        const { project: reimported, notice } = await makeProjectFromExternal(
            download.contents as string
        )
        expect(notice).toBeUndefined()
        expect(reimported.name).toBe('My / Project')
        expect(reimported.description).toBe('a description')
        expect(reimported.language).toBe('MIPS')
        expect(reimported.selected?.testcases[0]?.expectedRegisters.v0).toBe(12n)
        //The text format has always trimmed the code's trailing whitespace, since the metadata
        //block follows it; everything else comes back byte for byte.
        expect(reimported.code).toBe('li $v0, 10')
        expect(Object.keys(reimported.files)).toEqual(['main.mips'])
    })

    it('gives a multi-File Project the archive instead', () => {
        const project = makeProject({
            name: 'Multi',
            language: 'M68K',
            entry: 'main.m68k',
            files: {
                'main.m68k': { encoding: 'plain', content: 'nop\n' },
                'lib.m68k': { encoding: 'plain', content: 'rts\n' }
            }
        })
        const download = projectDownload(project)
        expect(download.kind).toBe('archive')
        expect(download.fileName).toBe('Multi.asmproj')
        expect(looksLikeZip(download.contents as Uint8Array)).toBe(true)
        const { project: reimported } = makeProjectFromArchive(download.contents as Uint8Array)
        expect(reimported.files).toEqual(project.files)
    })

    it('gives a lone binary File the archive, which a source file could not hold', () => {
        const download = projectDownload(
            makeProject({
                name: 'Binary',
                entry: 'main.m68k',
                files: { 'main.m68k': { encoding: 'base64', content: 'AA==' } }
            })
        )
        expect(download.kind).toBe('archive')
        expect(download.fileName).toBe('Binary.asmproj')
    })
})

/**
 * A Project holds Programs since ADR 0054, and archives keep the oldest-version rule they already
 * followed: a Project with one Program is written in the shape before Programs, as version 1 or 2,
 * which older editors read, and only one with several or none takes version 3
 * ([programs-plan.md](../../../../docs/design/programs-plan.md), decisions 3 and 4).
 */
describe('Programs in an archive', () => {
    const testcase = {
        input: [],
        expectedOutput: 'sorted',
        startingRegisters: {},
        expectedRegisters: { a0: 3n },
        startingMemory: [],
        expectedMemory: []
    }
    const files = {
        'main.s': { encoding: 'plain', content: 'nop' },
        'sort.s': { encoding: 'plain', content: 'nop' }
    }
    //the second byte overwritten with `A`
    const edits = [{ offset: 1, remove: 1, insert: 'QQ==' }]
    function several(): StoredProject {
        return {
            language: 'RISC-V',
            files,
            programs: {
                'main.s': { settings: { undoEnabled: false }, testcases: [] },
                'sort.s': {
                    settings: { programArguments: '3 1 2' },
                    testcases: [testcase],
                    display: { unitWidth: 4 }
                },
                'gone.s': { settings: {}, testcases: [] }
            },
            selectedProgram: 'sort.s'
        }
    }
    type Manifest = {
        version: number
        project: { entry?: string; programs?: Record<string, Program>; selectedProgram?: string }
        files: Record<string, { edits?: unknown[] }>
    }
    //through the serializer, since Testcases with bigints are written by superjson
    const manifestOf = (archive: Uint8Array) =>
        serializer.parse<Manifest>(new TextDecoder().decode(unzipSync(archive)['project.json']))

    it('writes one Program in the shape before Programs, as version 1, edited Files too', () => {
        const one = makeProject({ language: 'RISC-V', files, entry: 'sort.s' })
        const manifest = manifestOf(projectToArchive(one))
        expect(manifest.version).toBe(1)
        expect(manifest.project).toMatchObject({ entry: 'sort.s', settings: {}, testcases: [] })
        expect(manifest.project).not.toHaveProperty('programs')
        expect(manifest.project).not.toHaveProperty('selectedProgram')
        //a File holds its current bytes (ADR 0063): Byte edits saved before are applied, and an
        //archive holds them as the File
        const edited = makeProject({
            language: 'RISC-V',
            files: {
                ...files,
                'data.bin': { encoding: 'base64', content: '/wAB', edits } as ProjectFile
            },
            entry: 'sort.s'
        })
        const archive = projectToArchive(edited)
        expect(manifestOf(archive).version).toBe(1)
        expect(manifestOf(archive).files['data.bin']).toEqual({ encoding: 'base64' })
        expect([...unzipSync(archive)['files/data.bin']]).toEqual([0xff, 0x41, 1])
    })

    it('round trips several Programs, a missing Entry and the selection through version 3', () => {
        const project = makeProject(several())
        const archive = projectToArchive(project)
        const manifest = manifestOf(archive)
        expect(manifest.version).toBe(3)
        expect(Object.keys(manifest.project.programs ?? {})).toEqual(['main.s', 'sort.s', 'gone.s'])
        expect(manifest.project.selectedProgram).toBe('sort.s')
        for (const field of ['entry', 'settings', 'testcases', 'display'])
            expect(manifest.project).not.toHaveProperty(field)
        const imported = makeProjectFromArchive(archive).project
        expect(imported.programs).toEqual(project.programs)
        expect(imported.selectedProgram).toBe('sort.s')
        expect(imported.program('sort.s')?.testcases[0]?.expectedRegisters.a0).toBe(3n)
        expect(imported.program('sort.s')?.display?.unitWidth).toBe(4)
    })

    it('round trips a Project without a Program through version 3, still without one', () => {
        const project = makeProject({ ...several(), programs: {} })
        const archive = projectToArchive(project)
        expect(manifestOf(archive).version).toBe(3)
        const imported = makeProjectFromArchive(archive).project
        expect(imported.programs).toEqual({})
        expect(imported.selectedProgram).toBeUndefined()
        expect(Object.keys(imported.files)).toEqual(['main.s', 'sort.s'])
    })

    it('writes an edited File as its bytes in a version 3 archive', () => {
        const project = makeProject({
            ...several(),
            files: {
                ...files,
                'data.bin': { encoding: 'base64', content: '/wAB', edits } as ProjectFile
            }
        })
        const archive = projectToArchive(project)
        expect(manifestOf(archive).version).toBe(3)
        expect(manifestOf(archive).files['data.bin'].edits).toBeUndefined()
        expect([...fileBytes(makeProjectFromArchive(archive).project.files['data.bin'])]).toEqual([
            0xff, 0x41, 1
        ])
    })

    it('reads each version by its own shape, and refuses one that does not match it', () => {
        const metadata = {
            id: '',
            name: 'Versions',
            description: '',
            language: 'MIPS',
            createdAt: 0,
            updatedAt: 0
        }
        const legacy = { entry: 'main.s', settings: {}, testcases: [] }
        const programs = { 'main.s': { settings: {}, testcases: [] } }
        const archive = (version: number, project: Record<string, unknown>) =>
            zipSync({
                'project.json': encoder.encode(
                    JSON.stringify({
                        version,
                        project: { ...metadata, ...project },
                        files: { 'main.s': { encoding: 'plain' } }
                    })
                ),
                'files/main.s': encoder.encode('nop')
            })
        for (const version of [1, 2])
            expect(makeProjectFromArchive(archive(version, legacy)).project.programs).toEqual(
                programs
            )
        expect(makeProjectFromArchive(archive(3, { programs })).project.programs).toEqual(programs)
        expect(() => makeProjectFromArchive(archive(3, legacy))).toThrow('Malformed Project')
        expect(() => makeProjectFromArchive(archive(2, { programs }))).toThrow('Malformed Project')
        for (const broken of [
            { programs: { 'main.s': { testcases: [] } } },
            { programs: { 'main.s': { settings: {}, testcases: {} } } },
            { programs: { 'main.s': { settings: {}, testcases: [], display: 3 } } },
            { programs: { '../main.s': { settings: {}, testcases: [] } } },
            { programs: { 'main.s': 'main' } },
            { programs: [] },
            { programs, selectedProgram: 7 }
        ])
            expect(
                () => makeProjectFromArchive(archive(3, broken)),
                JSON.stringify(broken)
            ).toThrow(/Malformed (Program|Project)/)
    })

    it('offers the single-file export only for one Program whose Entry is the only File', () => {
        const one = makeProject({ files: { 'main.s': files['main.s'] }, entry: 'main.s' })
        expect(isSingleSourceProject(one)).toBe(true)
        expect(isLegacyLinkedFileCompatible(one.toObject())).toBe(true)
        expect(projectDownload(one).kind).toBe('source')
        const elsewhere = makeProject({ files: { 'main.s': files['main.s'] }, entry: 'gone.s' })
        expect(isSingleSourceProject(elsewhere)).toBe(false)
        const two = makeProject({ files: { 'main.s': files['main.s'] }, entry: 'main.s' })
        two.createProgram('gone.s')
        expect(isSingleSourceProject(two)).toBe(false)
        expect(isLegacyLinkedFileCompatible(two.toObject())).toBe(false)
        expect(projectDownload(two).kind).toBe('archive')
        two.removeProgram('gone.s')
        two.removeProgram('main.s')
        expect(isSingleSourceProject(two)).toBe(false)
        expect(projectDownload(two).kind).toBe('archive')
    })
})

/**
 * Share links follow the archives' rule: one Program travels in the shape before Programs, which a
 * cached older app still opens, and several or none in the new one
 * ([programs-plan.md](../../../../docs/design/programs-plan.md), decision 4).
 */
describe('Programs in a share link', () => {
    const shared = (payload: string) =>
        serializer.parse<StoredProject & Record<string, unknown>>(
            lzstring.decompressFromEncodedURIComponent(payload)
        )
    const files = {
        'main.s': { encoding: 'plain', content: 'nop' },
        'sort.s': { encoding: 'plain', content: 'nop' }
    }

    it('carries one Program as the earlier shape, which opens as the same Program', () => {
        const project = makeProject({
            language: 'MIPS',
            files,
            entry: 'sort.s',
            settings: { programArguments: '3 1 2' },
            testcases: [
                {
                    input: [],
                    expectedOutput: '1 2 3',
                    startingRegisters: {},
                    expectedRegisters: { v0: 10n },
                    startingMemory: [],
                    expectedMemory: []
                }
            ]
        })
        const payload = shared(createSharePayload(project))
        expect(payload.entry).toBe('sort.s')
        expect(payload).not.toHaveProperty('programs')
        const opened = makeProject()
        opened.set({ ...payload, id: 'share' })
        expect(opened.programs).toEqual(project.programs)
        expect(opened.selectedProgram).toBe('sort.s')
        expect(opened.selected?.testcases[0]?.expectedRegisters.v0).toBe(10n)
    })

    it('carries several Programs, or none, as Programs with the selection', () => {
        const project = makeProject({
            language: 'MIPS',
            files,
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'sort.s': { settings: { undoEnabled: false }, testcases: [] }
            },
            selectedProgram: 'main.s'
        })
        const payload = shared(createSharePayload(project))
        expect(payload).not.toHaveProperty('entry')
        const opened = makeProject()
        opened.set({ ...payload, id: 'share' })
        expect(opened.programs).toEqual(project.programs)
        expect(opened.selectedProgram).toBe('main.s')

        project.removeProgram('main.s')
        project.removeProgram('sort.s')
        const none = makeProject()
        none.set({ ...shared(createSharePayload(project)), id: 'share' })
        expect(none.programs).toEqual({})
        expect(none.selectedProgram).toBeUndefined()
    })
})

describe('large binary Files', () => {
    /**
     * The base64 validator used to be a regex with a starred group over the whole string, which
     * overflowed V8's backtrack arena above roughly 4.5 million characters. Any binary File past
     * about 3.3 MiB therefore failed with a raw RangeError — a fifth of the documented 16 MiB limit,
     * and not even a ProjectFormatError the UI could report.
     */
    it('round-trips a binary File far larger than the old regex ceiling', () => {
        const bytes = new Uint8Array(4 * 1024 * 1024)
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff
        const file = bytesFile(bytes)
        expect(file.encoding).toBe('base64')
        const back = fileBytes(file)
        //Compared by hand: a deep-equality assertion over four million elements is the slow part.
        expect(back.length).toBe(bytes.length)
        let differences = 0
        for (let i = 0; i < bytes.length; i++) if (back[i] !== bytes[i]) differences++
        expect(differences).toBe(0)
    })

    it('still rejects content that is not canonical base64', () => {
        expect(() => fileBytes({ encoding: 'base64', content: 'not base64!!' })).toThrow(
            ProjectFormatError
        )
        expect(() => fileBytes({ encoding: 'base64', content: 'QQ' })).toThrow(ProjectFormatError)
    })
})

describe('Byte edits a Project saved before, in an archive', () => {
    const edits = [{ offset: 1, remove: 2, insert: 'QUI=' }]
    const metadata = {
        id: '',
        name: 'Edited',
        description: '',
        language: 'X86',
        entry: 'chall',
        settings: {},
        createdAt: 0,
        updatedAt: 0,
        testcases: []
    }
    /** A version `version` archive whose `chall` is `ff 00 01 02` with `archivedEdits` beside it. */
    const archive = (version: number, archivedEdits: unknown) =>
        zipSync({
            'project.json': encoder.encode(
                JSON.stringify({
                    version,
                    project: metadata,
                    files: { chall: { encoding: 'base64', edits: archivedEdits } }
                })
            ),
            'files/chall': new Uint8Array([0xff, 0, 1, 2])
        })
    const manifestOf = (archive: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(unzipSync(archive)['project.json']))

    it('are applied as the archive is read, and written again as the File', () => {
        const imported = makeProjectFromArchive(archive(2, edits)).project
        //a File holds its current bytes (ADR 0063)
        expect(imported.files.chall).toEqual({ encoding: 'base64', content: '/0FCAg==' })
        const written = projectToArchive(imported)
        expect(manifestOf(written).version).toBe(1)
        expect(manifestOf(written).files.chall).toEqual({ encoding: 'base64' })
        expect([...unzipSync(written)['files/chall']]).toEqual([0xff, 0x41, 0x42, 2])
    })

    it('are read with an insertion and a deletion', () => {
        const kept = [
            { offset: 2, remove: 0, insert: 'QUI=' },
            { offset: 0, remove: 1, insert: '' }
        ]
        const imported = makeProjectFromArchive(archive(2, kept)).project.files.chall
        expect([...fileBytes(imported)]).toEqual([0, 0x41, 0x42, 1, 2])
    })

    it('are refused in a version 1 manifest, and when they do not fit the original', () => {
        expect(() => makeProjectFromArchive(archive(1, edits))).toThrow('Malformed manifest')
        expect(() => makeProjectFromArchive(archive(2, 'edits'))).toThrow('Malformed manifest')
        expect(() =>
            makeProjectFromArchive(archive(2, [{ offset: 3, remove: 2, insert: 'QUI=' }]))
        ).toThrow('past the end')
        //version 5 was never released
        expect(() => makeProjectFromArchive(archive(5, edits))).toThrow('Unsupported')
    })

    it('are applied in a share link, which carries the File as its bytes', () => {
        const project = makeProject({
            language: 'X86',
            entry: 'chall',
            files: { chall: { encoding: 'base64', content: '/wABAg==', edits } as ProjectFile }
        })
        const payload = createSharePayload(project)
        const shared = makeProject(
            serializer.parse(lzstring.decompressFromEncodedURIComponent(payload))
        )
        expect(shared.files.chall).toEqual({ encoding: 'base64', content: '/0FCAg==' })
    })
})

/**
 * Version 4 gives a File's manifest entry its Annotations
 * ([annotations-and-search.md](../../../../docs/design/annotations-and-search.md), decision 21),
 * written only when some File has them, in the shape after Programs.
 */
describe('Annotations in an archive', () => {
    const annotations = {
        names: { '0x1139': 'check' },
        comments: { '0x1150': 'compares the password\nwith "hunter2"' },
        functionComments: { '0x1139': 'Checks the flag.' },
        locals: { '0x1139': { 'stack:-0x98': 'password' } }
    }
    const edits = [{ offset: 1, remove: 2, insert: 'QUI=' }]
    function annotatedProject() {
        return makeProject({
            language: 'X86',
            entry: 'chall',
            files: {
                chall: { encoding: 'base64', content: '/0FCAg==', annotations },
                'notes.txt': { encoding: 'plain', content: 'hunter2?' }
            }
        })
    }
    const manifestOf = (archive: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(unzipSync(archive)['project.json']))
    const metadata = {
        id: '',
        name: 'Annotated',
        description: '',
        language: 'X86',
        createdAt: 0,
        updatedAt: 0
    }
    const programs = { chall: { settings: {}, testcases: [] } }
    const archive = (version: number, entry: unknown, project: object = { programs }) =>
        zipSync({
            'project.json': encoder.encode(
                JSON.stringify({
                    version,
                    project: { ...metadata, ...project },
                    files: { chall: entry }
                })
            ),
            'files/chall': new Uint8Array([0xff, 0, 1, 2])
        })

    it('keeps them in the manifest as version 4, the shape after Programs, and reads them back', () => {
        const project = annotatedProject()
        const download = projectToArchive(project)
        const manifest = manifestOf(download)
        expect(manifest.version).toBe(4)
        //one Program, which needs no Programs before Annotations, still takes the shape after them
        expect(manifest.project.programs).toEqual({ chall: { settings: {}, testcases: [] } })
        expect(manifest.project).not.toHaveProperty('entry')
        expect(manifest.files).toEqual({
            chall: { encoding: 'base64', annotations },
            'notes.txt': { encoding: 'plain' }
        })
        expect([...unzipSync(download)['files/chall']]).toEqual([0xff, 0x41, 0x42, 2])
        const imported = makeProjectFromArchive(download).project
        expect(imported.files.chall).toEqual({
            encoding: 'base64',
            content: '/0FCAg==',
            annotations
        })
        expect(imported.files['notes.txt']).toEqual({ encoding: 'plain', content: 'hunter2?' })
        expect(imported.programs).toEqual(project.programs)
        expect(imported.selectedProgram).toBe('chall')
    })

    it('stays in the oldest version that holds the Project without any', () => {
        const project = annotatedProject()
        project.fileSystem.annotate('chall', undefined)
        expect(manifestOf(projectToArchive(project)).version).toBe(1)
        project.createProgram('notes.txt')
        expect(manifestOf(projectToArchive(project)).version).toBe(3)
    })

    it('keeps them on a text File and on several Programs alike', () => {
        const project = makeProject({
            language: 'X86',
            files: {
                'main.asm': { encoding: 'plain', content: 'nop', annotations },
                'other.asm': { encoding: 'plain', content: 'nop' }
            },
            programs: {
                'main.asm': { settings: {}, testcases: [] },
                'other.asm': { settings: {}, testcases: [] }
            }
        })
        const download = projectToArchive(project)
        expect(manifestOf(download).version).toBe(4)
        expect(makeProjectFromArchive(download).project.files['main.asm'].annotations).toEqual(
            annotations
        )
    })

    it('reads older versions, and refuses Annotations where no version holds them', () => {
        for (const version of [2, 3]) {
            const project =
                version === 3 ? { programs } : { entry: 'chall', settings: {}, testcases: [] }
            expect(
                makeProjectFromArchive(archive(version, { encoding: 'base64', edits }, project))
                    .project.files.chall
            ).toEqual({ encoding: 'base64', content: '/0FCAg==' })
            expect(() =>
                makeProjectFromArchive(
                    archive(version, { encoding: 'base64', annotations }, project)
                )
            ).toThrow('Malformed manifest File entry: chall')
        }
        expect(() =>
            makeProjectFromArchive(
                archive(
                    1,
                    { encoding: 'base64', annotations },
                    { entry: 'chall', settings: {}, testcases: [] }
                )
            )
        ).toThrow('Malformed manifest File entry: chall')
        //version 4 takes a File without any, and refuses the shape before Programs
        expect(
            makeProjectFromArchive(archive(4, { encoding: 'base64' })).project.files.chall
        ).toEqual({ encoding: 'base64', content: '/wABAg==' })
        expect(() =>
            makeProjectFromArchive(
                archive(
                    4,
                    { encoding: 'base64', annotations },
                    { entry: 'chall', settings: {}, testcases: [] }
                )
            )
        ).toThrow('Malformed Project metadata')
    })

    it('refuses Annotations that do not hold up, as a saved Project refuses them', () => {
        expect(() =>
            makeProjectFromArchive(archive(4, { encoding: 'base64', annotations: 'names' }))
        ).toThrow('Malformed manifest File entry: chall')
        expect(() =>
            makeProjectFromArchive(archive(4, { encoding: 'base64', annotations: [] }))
        ).toThrow('Malformed manifest File entry: chall')
        expect(() =>
            makeProjectFromArchive(
                archive(4, { encoding: 'base64', annotations: { names: { main: 'check' } } })
            )
        ).toThrow('chall has a rename or comment at a bad address (main).')
        expect(() =>
            makeProjectFromArchive(
                archive(4, { encoding: 'base64', annotations: { names: { '0x1': 'rax' } } })
            )
        ).toThrow('“rax” is an x86 register. Choose another name.')
        expect(() =>
            makeProjectFromArchive(archive(4, { encoding: 'base64', annotations: { notes: {} } }))
        ).toThrow("chall has damaged renames or comments and can't be opened.")
    })

    it('never gives a one-File Project with Annotations as its source text, which loses them', () => {
        const one = makeProject({
            files: { 'main.s': { encoding: 'plain', content: 'nop' } },
            entry: 'main.s'
        })
        expect(isSingleSourceProject(one)).toBe(true)
        one.fileSystem.annotate('main.s', { comments: { '0x0': 'the start' } })
        expect(isSingleSourceProject(one)).toBe(false)
        expect(isLegacyLinkedFileCompatible(one.toObject())).toBe(false)
        const download = projectDownload(one)
        expect(download.kind).toBe('archive')
        expect(
            makeProjectFromArchive(download.contents as Uint8Array).project.files['main.s']
                .annotations
        ).toEqual({ comments: { '0x0': 'the start' } })
    })
})

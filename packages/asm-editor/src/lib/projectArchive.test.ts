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
import { bytesFile, fileBytes, ProjectFormatError } from '#lib/projectFiles.ts'

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

    it('writes one Program in the shape before Programs, as version 1, or 2 with Byte edits', () => {
        const one = makeProject({ language: 'RISC-V', files, entry: 'sort.s' })
        const manifest = manifestOf(projectToArchive(one))
        expect(manifest.version).toBe(1)
        expect(manifest.project).toMatchObject({ entry: 'sort.s', settings: {}, testcases: [] })
        expect(manifest.project).not.toHaveProperty('programs')
        expect(manifest.project).not.toHaveProperty('selectedProgram')
        const edited = makeProject({
            language: 'RISC-V',
            files: { ...files, 'data.bin': { encoding: 'base64', content: '/wAB', edits } },
            entry: 'sort.s'
        })
        expect(manifestOf(projectToArchive(edited)).version).toBe(2)
        expect(manifestOf(projectToArchive(edited)).project.entry).toBe('sort.s')
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

    it('keeps Byte edits in a version 3 archive', () => {
        const project = makeProject({
            ...several(),
            files: { ...files, 'data.bin': { encoding: 'base64', content: '/wAB', edits } }
        })
        const archive = projectToArchive(project)
        expect(manifestOf(archive).version).toBe(3)
        expect(manifestOf(archive).files['data.bin'].edits).toEqual(edits)
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

describe('Byte edits in an archive', () => {
    const edits = [{ offset: 1, remove: 2, insert: 'QUI=' }]
    function editedProject() {
        return makeProject({
            language: 'X86',
            entry: 'chall',
            files: {
                chall: { encoding: 'base64', content: '/wABAg==', edits },
                'notes.txt': { encoding: 'plain', content: 'hunter2?' }
            }
        })
    }
    const manifestOf = (archive: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(unzipSync(archive)['project.json']))
    const originalOf = (archive: Uint8Array, path: string) => [
        ...unzipSync(archive)[`files/${path}`]
    ]

    it('keeps the original bytes under files/ and the edits in the manifest, as version 2', () => {
        const archive = projectToArchive(editedProject())
        const manifest = manifestOf(archive)
        expect(manifest.version).toBe(2)
        expect(manifest.files).toEqual({
            chall: { encoding: 'base64', edits },
            'notes.txt': { encoding: 'plain' }
        })
        expect(originalOf(archive, 'chall')).toEqual([0xff, 0, 1, 2])
        const imported = makeProjectFromArchive(archive).project
        expect(imported.files.chall).toEqual({ encoding: 'base64', content: '/wABAg==', edits })
        expect([...fileBytes(imported.files.chall)]).toEqual([0xff, 0x41, 0x42, 2])
        expect(imported.files['notes.txt']).toEqual({ encoding: 'plain', content: 'hunter2?' })
    })

    it('keeps an insertion and a deletion, which a later version may save', () => {
        const kept = [
            { offset: 2, remove: 0, insert: 'QUI=' },
            { offset: 0, remove: 1, insert: '' }
        ]
        const project = makeProject({
            language: 'MIPS',
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'chall.bin': { encoding: 'base64', content: '/wABAg==', edits: kept }
            }
        })
        const archive = projectToArchive(project)
        expect(manifestOf(archive).files['chall.bin']).toEqual({ encoding: 'base64', edits: kept })
        expect(originalOf(archive, 'chall.bin')).toEqual([0xff, 0, 1, 2])
        const imported = makeProjectFromArchive(archive).project.files['chall.bin']
        expect(imported).toEqual({ encoding: 'base64', content: '/wABAg==', edits: kept })
        expect([...fileBytes(imported)]).toEqual([0, 0x41, 0x42, 1, 2])
    })

    it('stays version 1 without any, which older editors read', () => {
        const project = editedProject()
        project.fileSystem.writeBytes('chall', new Uint8Array([0xff, 0x41, 0x42, 2]))
        const archive = projectToArchive(project)
        const manifest = manifestOf(archive)
        expect(manifest.version).toBe(1)
        expect(manifest.files.chall).toEqual({ encoding: 'base64' })
        expect(makeProjectFromArchive(archive).project.files.chall).toEqual({
            encoding: 'base64',
            content: '/0FCAg=='
        })
    })

    it('refuses edits in a version 1 manifest and edits that do not fit the original', () => {
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
        const archive = (version: number, archivedEdits: unknown) =>
            zipSync({
                'project.json': encoder.encode(
                    JSON.stringify({
                        version,
                        project: metadata,
                        files: { chall: { encoding: 'base64', edits: archivedEdits } }
                    })
                ),
                'files/chall': new Uint8Array([0xff, 0])
            })
        expect(() => makeProjectFromArchive(archive(1, edits))).toThrow('Malformed manifest')
        expect(() => makeProjectFromArchive(archive(2, 'edits'))).toThrow('Malformed manifest')
        expect(() => makeProjectFromArchive(archive(2, edits))).toThrow('past the end')
        expect(() => makeProjectFromArchive(archive(4, edits))).toThrow('Unsupported')
    })

    it('travels in a share link', () => {
        const payload = createSharePayload(editedProject())
        const shared = makeProject(
            serializer.parse(lzstring.decompressFromEncodedURIComponent(payload))
        )
        expect(shared.files.chall.edits).toEqual(edits)
        expect([...fileBytes(shared.files.chall)]).toEqual([0xff, 0x41, 0x42, 2])
    })
})

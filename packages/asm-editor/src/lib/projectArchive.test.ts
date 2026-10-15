import { describe, expect, it } from 'vite-plus/test'
import { unzipSync, zipSync } from 'fflate'
import lzstring from 'lz-string'
import { serializer } from '#lib/json.ts'
import { createSharePayload } from '#lib/utils.ts'
import { makeProject, makeProjectFromExternal } from '#lib/Project.svelte.ts'
import {
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
        expect(imported.entry).toBe('src/main.mips')
        expect(imported.openTabs).toEqual(['src/lib.mips', 'src/main.mips'])
        expect(imported.activeTab).toBe('src/lib.mips')
        expect(imported.code).toBe('include "lib.mips"\n\n')
        expect(imported.testcases[0]?.expectedRegisters.v0).toBe(12n)
        expect(imported.files['data/raw.bin']?.encoding).toBe('base64')
        expect(fileBytes(imported.files['data/raw.bin']!)).toEqual(
            new Uint8Array([0xff, 0x00, 0x01])
        )
    })

    it('preserves an empty Files map and a configured missing Entry', () => {
        const project = makeProject({ language: 'Z80', files: {}, entry: 'missing.z80' })
        const imported = makeProjectFromArchive(projectToArchive(project)).project
        expect(imported.files).toEqual({})
        expect(imported.entry).toBe('missing.z80')
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
        expect(reimported.testcases[0]?.expectedRegisters.v0).toBe(12n)
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
        expect(() => makeProjectFromArchive(archive(3, edits))).toThrow('Unsupported')
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

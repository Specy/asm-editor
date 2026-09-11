import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { makeProject } from '$lib/Project.svelte'
import {
    looksLikeZip,
    makeProjectFromArchive,
    projectArchiveName,
    projectToArchive,
    projectToSingleSource
} from '$lib/projectArchive'
import { bytesFile, fileBytes, ProjectFormatError } from '$lib/projectFiles'

const encoder = new TextEncoder()

describe('Project archives', () => {
    it('round trips metadata, bigints, paths, exact text and binary bytes', () => {
        const project = makeProject({
            id: 'archive-id',
            name: 'Archive test',
            description: 'all fields',
            language: 'MIPS',
            entry: 'src/main.mips',
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

    it("exports the raw Entry when it is the Project's only File", () => {
        const project = makeProject({
            language: 'MIPS',
            entry: 'src/lesson.mips',
            files: {
                'src/lesson.mips': { encoding: 'plain', content: 'li $v0, 10\n' }
            }
        })
        const source = projectToSingleSource(project)
        expect(source?.fileName).toBe('lesson.mips')
        expect(new TextDecoder().decode(source?.bytes)).toBe('li $v0, 10\n')
    })

    it('does not offer a lossy source export for multi-file, binary or missing-Entry Projects', () => {
        expect(
            projectToSingleSource(
                makeProject({
                    files: {
                        'main.m68k': { encoding: 'plain', content: '' },
                        'lib.m68k': { encoding: 'plain', content: '' }
                    }
                })
            )
        ).toBeNull()
        expect(
            projectToSingleSource(
                makeProject({
                    entry: 'main.m68k',
                    files: { 'main.m68k': { encoding: 'base64', content: 'AA==' } }
                })
            )
        ).toBeNull()
        expect(projectToSingleSource(makeProject({ files: {}, entry: 'main.m68k' }))).toBeNull()
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

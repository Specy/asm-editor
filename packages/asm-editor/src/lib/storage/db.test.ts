import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { Db } from './db'
import { makeProject } from '#lib/Project.svelte.ts'

/**
 * The one migration a user's browser runs without asking: opening the app after the files map
 * arrived rewrites every stored project from its version 1 `code`. It is tested here against a
 * database created the way version 1 created it, under a fake IndexedDB, because a mistake in it
 * costs every user every project they have.
 */

const DB_NAME = 'mips-m68k-db'

async function createVersionOneDatabase(rows: Record<string, unknown>[]): Promise<void> {
    const legacy = new Dexie(DB_NAME)
    legacy.version(1).stores({ projects: '++id' })
    await legacy.table('projects').bulkAdd(rows)
    legacy.close()
}

const legacyRow = {
    id: 'abcdefg',
    code: '    move.l #1, d0',
    language: 'M68K',
    name: 'Before the files map',
    description: 'stored by version 1',
    createdAt: 1,
    updatedAt: 2,
    testcases: []
}

describe('the version 2 upgrade', () => {
    beforeEach(() => {
        //a fresh factory per test: Dexie reads it from here, and the fake keeps no state across them
        Dexie.dependencies.indexedDB = new IDBFactory()
    })

    it('rewrites a version 1 row into files, an entry and no decisions', async () => {
        await createVersionOneDatabase([legacyRow])
        const db = new Db()
        const project = await db.getProject('abcdefg')
        expect(project.files).toEqual({
            'main.m68k': { encoding: 'plain', content: '    move.l #1, d0' }
        })
        expect(project.entry).toBe('main.m68k')
        expect(project.settings).toEqual({})
        expect(project.name).toBe('Before the files map')
        expect(project.updatedAt).toBe(2)
        //the row itself no longer carries the old field
        const row = (await db.projects.get('abcdefg')) as unknown as Record<string, unknown>
        expect(row.code).toBeUndefined()
        expect(row.entry).toBe('main.m68k')
        db.close()
    })

    it('keeps every row, whatever its language', async () => {
        await createVersionOneDatabase([
            legacyRow,
            { ...legacyRow, id: 'hijklmn', language: 'RISC-V', code: 'li a7, 10\necall' },
            { ...legacyRow, id: 'opqrstu', language: 'Z80', code: 'halt' }
        ])
        const db = new Db()
        const projects = await db.getProjects()
        expect(projects.map((project) => [project.id, project.entry, project.code])).toEqual([
            ['abcdefg', 'main.m68k', '    move.l #1, d0'],
            ['hijklmn', 'main.riscv', 'li a7, 10\necall'],
            ['opqrstu', 'main.z80', 'halt']
        ])
        db.close()
    })

    it('round trips optional open tabs and their active path through browser storage', async () => {
        const db = new Db()
        try {
            const project = makeProject({
                language: 'MIPS',
                entry: 'main.mips',
                files: {
                    'main.mips': { encoding: 'plain', content: 'nop' },
                    'lib.mips': { encoding: 'plain', content: 'jr $ra' }
                },
                openTabs: ['lib.mips', 'main.mips'],
                activeTab: 'lib.mips'
            })
            await db.addProject(project)
            const loaded = await db.getProject(project.id)
            expect(loaded.openTabs).toEqual(['lib.mips', 'main.mips'])
            expect(loaded.activeTab).toBe('lib.mips')
            loaded.setOpenTabs([], '')
            await db.updateProject(loaded)
            const empty = await db.getProject(project.id)
            expect(empty.openTabs).toEqual([])
            expect(empty.activeTab).toBeUndefined()
        } finally {
            db.close()
        }
    })

    it('round trips Byte edits apart from the original bytes through browser storage', async () => {
        const db = new Db()
        try {
            const edits = [{ offset: 1, remove: 2, insert: 'QUI=' }]
            const project = makeProject({
                language: 'X86',
                entry: 'chall',
                files: { chall: { encoding: 'base64', content: '/wABAg==', edits } }
            })
            await db.addProject(project)
            const loaded = await db.getProject(project.id)
            expect(loaded.files.chall).toEqual({ encoding: 'base64', content: '/wABAg==', edits })
            loaded.fileSystem.editBytes('chall', 3, new Uint8Array([0x43]))
            await db.updateProject(loaded)
            const again = await db.getProject(project.id)
            expect(again.files.chall.content).toBe('/wABAg==')
            expect(again.files.chall.edits).toEqual([{ offset: 1, remove: 3, insert: 'QUJD' }])
        } finally {
            db.close()
        }
    })

    it('round trips the views Files were last shown in, beside the open tabs', async () => {
        const db = new Db()
        try {
            const project = makeProject({
                language: 'MIPS',
                entry: 'main.mips',
                files: {
                    'main.mips': { encoding: 'plain', content: 'nop' },
                    'image.png': { encoding: 'base64', content: 'iVBORw0KGgo=' }
                },
                openTabs: ['image.png', 'main.mips']
            })
            project.setFileView('image.png', 'hex')
            await db.addProject(project)
            const loaded = await db.getProject(project.id)
            expect(loaded.fileViews).toEqual({ 'image.png': 'hex' })
            expect(loaded.openTabs).toEqual(['image.png', 'main.mips'])
            loaded.setFileView('image.png', undefined)
            await db.updateProject(loaded)
            expect((await db.getProject(project.id)).fileViews).toBeUndefined()
        } finally {
            db.close()
        }
    })

    it('skips, and keeps, a row this version cannot read', async () => {
        Dexie.dependencies.indexedDB = new IDBFactory()
        const db = new Db()
        await db.projects.add({
            ...legacyRow,
            id: 'future1',
            files: { 'main.m68k': { encoding: 'future-binary', content: 'AAAA' } },
            entry: 'main.m68k',
            settings: {}
        } as never)
        await db.projects.add({
            ...legacyRow,
            id: 'plain12',
            files: { 'main.m68k': { encoding: 'plain', content: 'nop' } },
            entry: 'main.m68k',
            settings: { fileSystemHistoryBudgetMb: 7 }
        } as never)
        const projects = await db.getProjects()
        expect(projects.map((project) => project.id)).toEqual(['plain12'])
        expect(projects[0]?.settings).toEqual({ fileSystemHistoryBudgetMb: 7 })
        expect(await db.projects.count()).toBe(2)
        db.close()
    })
})

import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { makeProject } from '#lib/Project.svelte.ts'
import { db } from '#lib/storage/db.ts'
import { makeProjectFromArchive } from '#lib/projectArchive.ts'
import { SHARE_ID } from '#lib/shareId.ts'
import { ProjectStore } from './projectsStore.svelte'

afterEach(() => vi.restoreAllMocks())

it('reads no Project until a page asks, and then only the one it asks for', async () => {
    //nothing read the list as the store loaded
    expect(ProjectStore.inited).toBe(false)
    expect(ProjectStore.projects).toEqual([])
    const stored = await db.addProject(makeProject({ name: 'one of many' }))
    const list = vi.spyOn(db, 'getProjects')
    try {
        expect((await ProjectStore.getProject(stored.id))?.name).toBe('one of many')
        expect(await ProjectStore.isStored(stored.id)).toBe(true)
        expect(await ProjectStore.isStored('missing')).toBe(false)
        expect(list).not.toHaveBeenCalled()
        expect(ProjectStore.inited).toBe(false)
    } finally {
        await db.deleteProject(stored)
    }
})

it('stores the browser copy before writing the linked file, which a closing page never finishes', async () => {
    const project = await ProjectStore.addProject(makeProject({ name: 'linked' }))
    let release!: () => void
    const writer = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) }
    const handle = {
        createWritable: () => new Promise((resolve) => (release = () => resolve(writer)))
    }
    ProjectStore.setFileHandle(project.id, handle as unknown as FileSystemFileHandle, 'archive')
    try {
        project.name = 'renamed'
        const saving = ProjectStore.save(project)
        await vi.waitFor(async () =>
            expect((await db.getProject(project.id))?.name).toBe('renamed')
        )
        expect(writer.write).not.toHaveBeenCalled()
        release()
        expect(await saving).toEqual({ linked: 'saved', local: 'saved' })
        expect(writer.close).toHaveBeenCalledOnce()
    } finally {
        ProjectStore.writableFiles.clear()
        await ProjectStore.deleteProject(project)
    }
})

it('finds a project another tab or frame saved after this one read the list', async () => {
    await ProjectStore.load()
    //what the Examples page's frame does when it saves an example: the same database, another store
    const saved = await db.addProject(makeProject({ name: 'saved elsewhere' }))
    try {
        expect(ProjectStore.projects.some((project) => project.id === saved.id)).toBe(false)
        expect((await ProjectStore.getProject(saved.id))?.name).toBe('saved elsewhere')
        expect(await ProjectStore.getProject('missing')).toBeUndefined()
    } finally {
        await ProjectStore.deleteProject(saved)
    }
})

it('puts a saved Project in place of its entry in a loaded list, without reading the list again', async () => {
    const project = await db.addProject(makeProject({ name: 'before' }))
    await ProjectStore.load()
    const list = vi.spyOn(db, 'getProjects')
    try {
        project.name = 'after'
        expect((await ProjectStore.save(project)).local).toBe('saved')
        expect(list).not.toHaveBeenCalled()
        const entry = ProjectStore.projects.find((listed) => listed.id === project.id)!
        expect(entry.name).toBe('after')
        //its own copy, which the Workbench's later changes do not reach
        expect(entry).not.toBe(project)
        expect(entry.files).toBe(project.files)
        //a millisecond later, which the list's order by when each was edited needs
        await new Promise((resolve) => setTimeout(resolve, 5))
        const added = await ProjectStore.addProject(makeProject({ name: 'added' }))
        expect(ProjectStore.projects.map((listed) => listed.name)).toEqual(['added', 'after'])
        await ProjectStore.deleteProject(added)
        expect(ProjectStore.projects.map((listed) => listed.name)).toEqual(['after'])
        expect(list).not.toHaveBeenCalled()
    } finally {
        await ProjectStore.deleteProject(project)
        ProjectStore.unload()
    }
    expect(ProjectStore.projects).toEqual([])
    expect(ProjectStore.inited).toBe(false)
})

it('reads a Project only once the saves in flight are stored', async () => {
    const project = await db.addProject(makeProject({ name: 'saving' }))
    let release!: () => void
    const update = db.updateProject.bind(db)
    vi.spyOn(db, 'updateProject').mockImplementation(
        (row, journals) =>
            new Promise<void>(
                (resolve) => (release = () => void update(row, journals).then(resolve))
            )
    )
    try {
        project.name = 'saved'
        const saving = ProjectStore.save(project)
        const read = ProjectStore.getProject(project.id)
        const listed = ProjectStore.load()
        await vi.waitFor(() => expect(release).toBeDefined())
        release()
        expect((await read)?.name).toBe('saved')
        expect((await listed).find((each) => each.id === project.id)?.name).toBe('saved')
        await saving
    } finally {
        vi.restoreAllMocks()
        await ProjectStore.deleteProject(project)
        ProjectStore.unload()
    }
})

it('gives each Workbench an Edit journal store of its own, whose reads no later save takes', () => {
    const first = ProjectStore.journalStore('a')!
    const read = vi.fn(() => ({ fingerprint: 'stale', undo: [], redo: [] }))
    first.changed('main.s', read)
    const second = ProjectStore.journalStore('a')!
    expect(second).not.toBe(first)
    expect(second.take().writes.size).toBe(0)
    expect(read).not.toHaveBeenCalled()
    expect(ProjectStore.journalStore(SHARE_ID)).toBeUndefined()
})

it('stores a save at once while an earlier save still writes the linked file, which takes the newest', async () => {
    const project = await ProjectStore.addProject(
        makeProject({ name: 'first', language: 'RISC-V', code: 'nop\n' })
    )
    let release!: () => void
    const written: string[] = []
    const handle = {
        createWritable: vi.fn(async () => {
            //the first write holds, as a slow disk does
            if (handle.createWritable.mock.calls.length === 1)
                await new Promise<void>((resolve) => (release = resolve))
            return {
                write: async (contents: string) => void written.push(contents),
                close: async () => {}
            }
        })
    }
    ProjectStore.setFileHandle(project.id, handle as unknown as FileSystemFileHandle, 'legacy')
    try {
        project.name = 'second'
        const saving = ProjectStore.save(project)
        await vi.waitFor(() => expect(handle.createWritable).toHaveBeenCalledOnce())
        expect(ProjectStore.linkedWritePending(project.id)).toBe(true)
        //typed while the linked file is written: stored at once, not after it
        project.name = 'third'
        const next = ProjectStore.save(project)
        await vi.waitFor(async () => expect((await db.getProject(project.id))?.name).toBe('third'))
        project.name = 'fourth'
        const last = ProjectStore.save(project)
        await vi.waitFor(async () => expect((await db.getProject(project.id))?.name).toBe('fourth'))
        expect(handle.createWritable).toHaveBeenCalledOnce()
        release()
        const results = await Promise.all([saving, next, last])
        expect(
            results.every((result) => result.local === 'saved' && result.linked === 'saved')
        ).toBe(true)
        //the third save's snapshot was replaced by the fourth's before its turn came
        expect(handle.createWritable).toHaveBeenCalledTimes(2)
        expect(written).toHaveLength(2)
        expect(written[0]).toContain('"second"')
        expect(written[1]).toContain('"fourth"')
        expect(ProjectStore.linkedWritePending(project.id)).toBe(false)
    } finally {
        ProjectStore.writableFiles.clear()
        await ProjectStore.deleteProject(project)
    }
})

it('writes a linked archive zipped in the background, as the save is', async () => {
    const project = await ProjectStore.addProject(
        makeProject({
            name: 'archived',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'data.bin': { encoding: 'base64', content: 'AAEC' }
            }
        })
    )
    let written: ArrayBuffer | undefined
    const writer = {
        write: vi.fn(async (data: ArrayBuffer) => void (written = data)),
        close: vi.fn(async () => {})
    }
    ProjectStore.setFileHandle(
        project.id,
        { createWritable: async () => writer } as unknown as FileSystemFileHandle,
        'archive'
    )
    try {
        expect(await ProjectStore.save(project)).toEqual({ linked: 'saved', local: 'saved' })
        const { project: read } = await makeProjectFromArchive(new Uint8Array(written!))
        expect(read.files).toEqual(project.files)
    } finally {
        ProjectStore.writableFiles.clear()
        await ProjectStore.deleteProject(project)
    }
})

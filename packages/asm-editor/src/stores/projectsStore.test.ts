import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vite-plus/test'
import { makeProject } from '#lib/Project.svelte.ts'
import { db } from '#lib/storage/db.ts'
import { ProjectStore } from './projectsStore.svelte'

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

import { importFile, type ImportedFile } from '#lib/executableImport.ts'
import { projectContentEquals, type ExternalImport, type Project } from '#lib/Project.svelte.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

/** What a file can be to be imported as a Project, as the pages that import them say it. */
export const IMPORTABLE_FILES =
    '**Assembly source files**, **.asmproj** projects, and x86-64 Linux **ELF binaries**.'

/**
 * Adds an imported Project to the store, asking before it replaces a different one with the same
 * id: the Project it saved, or undefined when the import was cancelled, failed, or was not stored
 * by the browser.
 */
export async function importProject({ project, notice }: ExternalImport) {
    try {
        if (notice) toast.warn(notice, 8000)
        const existing = await ProjectStore.getProject(project.id)
        if (!existing) {
            const proj = await ProjectStore.addProject(project)
            toast.success('Imported project!')
            return proj
        }
        const replaces = !projectContentEquals(existing.toObject(), project.toObject())
        if (replaces) {
            const override = await Prompt.confirm(
                'An existing project with this id already exists, do you want to override it?'
            )
            if (!override) {
                toast.success('Cancelled import')
                return undefined
            }
        }
        const result = await ProjectStore.save(project)
        if (result.local === 'failed') {
            toast.error('Failed to import project!')
            return undefined
        }
        toast.logPill(replaces ? 'Overriden project!' : 'Updated project!')
        return project
    } catch (e) {
        console.error(e)
        toast.error('Failed to import project!')
    }
    return undefined
}

/** Imports a file: what it became, and how it was read, or undefined when it was not. */
export async function importFromData(
    data: ArrayBuffer,
    fileName: string
): Promise<{ project: Project; read: ImportedFile } | undefined> {
    try {
        const read = await importFile(new Uint8Array(data), fileName)
        const project = await importProject(read.imported)
        return project ? { project, read } : undefined
    } catch (e) {
        console.error(e)
        toast.error(e instanceof Error ? e.message : 'Failed to import project!')
        return undefined
    }
}

/**
 * Imports each file as a copy, linked to nothing it could be saved back to: the Projects they
 * became, in order. A file that fails is reported and skipped.
 */
export async function importFiles(files: File[]): Promise<Project[]> {
    const projects: Project[] = []
    for (const file of files) {
        let data: ArrayBuffer
        try {
            data = await file.arrayBuffer()
        } catch (e) {
            console.error(e)
            toast.error(`Could not read ${file.name}`)
            continue
        }
        const result = await importFromData(data, file.name)
        if (result) projects.push(result.project)
    }
    return projects
}

import { importFile, type ImportedFile } from '#lib/executableImport.ts'
import { projectContentEquals, type ExternalImport, type Project } from '#lib/Project.svelte.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

/** What a file can be to be imported as a Project, as the pages that import them say it. */
export const IMPORTABLE_FILES =
    '.asmproj archives, assembly source files and x86-64 Linux executables'

/**
 * Adds an imported Project to the store, asking before it replaces a different one with the same
 * id: the Project it saved, or undefined when the import was cancelled or failed.
 */
export async function importProject({ project, notice }: ExternalImport) {
    try {
        if (notice) toast.warn(notice, 8000)
        const existing = await ProjectStore.getProject(project.id)
        if (existing && !projectContentEquals(existing.toObject(), project.toObject())) {
            const override = await Prompt.confirm(
                'An existing project with this id already exists, do you want to override it?'
            )
            if (override === null) {
                toast.success('Cancelled import')
                return undefined
            }
            if (!override) {
                toast.success('Cancelled import')
                return undefined
            }
            await ProjectStore.save(project)
            toast.logPill('Overriden project!')
            return project
        } else if (existing) {
            ProjectStore.save(project)
            toast.logPill('Updated project!')
            return project
        } else {
            const proj = await ProjectStore.addProject(project)
            toast.success('Imported project!')
            return proj
        }
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

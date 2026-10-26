<script lang="ts">
    import { IMPORTABLE_FILES, importFiles, importFromData } from '#lib/projectImport.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
    import ProjectCard from '#cmp/specific/project/ProjectCard.svelte'
    import { onMount } from 'svelte'
    import FaPlus from '~icons/fa-solid/plus'
    import Button from '#cmp/shared/button/Button.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { scale } from 'svelte/transition'
    import FileDropZone from '#cmp/shared/fileImporter/FileDropZone.svelte'
    import { blobDownloader, copyText, createShareLink, ShareTooLargeError } from '#lib/utils.ts'
    import FaUpload from '~icons/fa-solid/upload'
    import { toast } from '#stores/toastStore.ts'
    import { goto } from '$app/navigation'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import { resolve } from '$app/paths'
    import { projectDownload } from '#lib/projectArchive.ts'
    import { warmUpMonaco } from '#lib/monaco/warmUp.ts'
    import type { Project } from '#lib/Project.svelte.ts'
    import '#cmp/specific/workbench/workbench.css'

    let hasFileHandleSupport = false
    let fileInput: HTMLInputElement | undefined

    /**
     * Import's picker: where the browser can write back to a file, the Projects it picked are
     * linked to it and saved there; elsewhere they are imported as copies.
     */
    async function pickAndImport() {
        if (!hasFileHandleSupport) return fileInput?.click()
        let files: FileSystemFileHandle[]
        try {
            //@ts-expect-error showOpenFilePicker is not in the types
            files = await window.showOpenFilePicker({ multiple: true })
        } catch {
            return //cancelled
        }
        await importFromFileHandle(files)
    }

    /**
     * Imports each file, linking the Project it became to it where it can be written back: the
     * Projects, in order. A file that fails is reported and skipped.
     */
    async function importFromFileHandle(fileHandles: FileSystemFileHandle[]) {
        const projects: Project[] = []
        for (const fileHandle of fileHandles) {
            try {
                const blob = await fileHandle.getFile()
                // @ts-ignore -- File omits the nonstandard handle retained by the importer
                blob.handle = fileHandle
                const data = await blob.arrayBuffer()
                const result = await importFromData(data, blob.name)
                if (!result) continue
                const importedProject = result.project
                projects.push(importedProject)
                //an Executable's Project is never saved over the ELF it came from
                if (result.read.executable) continue
                ProjectStore.setFileHandle(
                    importedProject.id,
                    fileHandle,
                    result.read.archive ? 'archive' : 'legacy'
                )
                //The imported instance, not a re-read by id: the store's array may not have
                //reloaded yet, and writing back a stale row reverted the import it had just applied.
                await ProjectStore.save(importedProject) //saves the new metadata to the file
            } catch (e) {
                console.error(e)
                toast.error('Failed to import project!')
            }
        }
        return projects
    }

    //opening a project from this list is the next step for most visits
    onMount(warmUpMonaco)

    onMount(() => {
        hasFileHandleSupport = 'showOpenFilePicker' in window
        async function run() {
            await ProjectStore.load()
            try {
                if ('launchQueue' in window) {
                    //@ts-expect-error setConsumer is not in the types
                    window.launchQueue.setConsumer(async (launchParams) => {
                        const projects = await importFromFileHandle(launchParams.files)
                        //a single file opened with the app from the system opens as its Project
                        if (projects.length === 1 && launchParams.files.length === 1) {
                            await goto(resolve('/projects/[project]', { project: projects[0].id }))
                        }
                    })
                } else {
                    console.error('File Handling API is not supported!')
                }
            } catch (e) {
                console.error(e)
            }
        }

        run()
        return () => {
            if ('launchQueue' in window) {
                //@ts-expect-error launchQueue is not in the types
                window.launchQueue.setConsumer(() => {})
            }
        }
    })
</script>

<svelte:head>
    <title>Projects</title>
    <meta name="description" content="Create, edit or delete your projects" />
    <meta property="og:description" content="Create, edit or delete your projects" />
    <meta property="og:title" content="Projects" />
</svelte:head>

<DefaultNavbar />
<Page hasNavbar>
    <div class="project-display wb-cards">
        <div class="content">
            <div class="top-row">
                <h1 class="page-title">Your projects</h1>
                <div class="top-row-buttons">
                    <Button cssVar="secondary" bordered style="gap: 0.5rem" onClick={pickAndImport}>
                        <Icon size={0.85}>
                            <FaUpload />
                        </Icon>
                        Import
                    </Button>
                    {#if !hasFileHandleSupport}
                        <!-- No filter: CTF binaries rarely have an extension -->
                        <input
                            type="file"
                            multiple
                            accept=""
                            hidden
                            bind:this={fileInput}
                            onchange={(event) => {
                                const files = [...(event.currentTarget.files ?? [])]
                                event.currentTarget.value = ''
                                void importFiles(files)
                            }}
                        />
                    {/if}
                    <ButtonLink
                        href={resolve('/projects/create')}
                        style="gap: 0.5rem"
                        {@attach tooltip('Create a new project')}
                    >
                        <Icon size={0.85}>
                            <FaPlus />
                        </Icon>
                        Create
                    </ButtonLink>
                </div>
            </div>
            <div class="import-drop">
                <FileDropZone
                    title="Drop files here to import them"
                    hint={IMPORTABLE_FILES}
                    onFiles={(files) => void importFiles(files)}
                    onBrowse={pickAndImport}
                />
            </div>
            {#if ProjectStore.loadFailed}
                <div class="empty">
                    <div class="empty-title">Your projects could not be read</div>
                    <div class="empty-hint">
                        The browser did not let this page open its storage. Reload the page, or
                        check that the browser allows this site to store data.
                    </div>
                </div>
            {:else if ProjectStore.projects.length === 0}
                <div class="empty">
                    <div class="empty-title">No projects yet</div>
                    <div class="empty-hint">
                        Create one from a language and a template, or import a file.
                    </div>
                </div>
            {/if}
            <div class="project-grid">
                {#each ProjectStore.projects as project, i (project.id)}
                    <div
                        class="project-cell"
                        in:scale|global={{ duration: 200, delay: i * 50 + 150, start: 0.9 }}
                        out:scale={{ duration: 300, start: 0.8 }}
                    >
                        <ProjectCard
                            {project}
                            on:share={async (e) => {
                                let link: string
                                try {
                                    link = createShareLink(e.detail)
                                } catch (error) {
                                    console.error(error)
                                    toast.error(
                                        error instanceof ShareTooLargeError
                                            ? 'This Project is too big to share as a link. Download the .asmproj archive instead.'
                                            : 'Could not create a share link for this Project',
                                        10000
                                    )
                                    return
                                }
                                await copyText(link, 'Share link')
                            }}
                            on:download={(e) => {
                                //Whichever form loses nothing: a single-File Project keeps its
                                //name, description, Testcases, Settings and display in the
                                //commented metadata block a source file carries, and everything
                                //else needs the archive.
                                try {
                                    const download = projectDownload(e.detail)
                                    const contents =
                                        typeof download.contents === 'string'
                                            ? download.contents
                                            : new Uint8Array(download.contents).buffer
                                    blobDownloader(
                                        new Blob([contents], { type: download.mimeType }),
                                        download.fileName
                                    )
                                } catch (error) {
                                    console.error(error)
                                    toast.error(
                                        error instanceof Error
                                            ? error.message
                                            : 'Failed to export project!'
                                    )
                                }
                            }}
                        />
                    </div>
                {/each}
            </div>
        </div>
    </div>
</Page>

<style lang="scss">
    .top-row {
        display: flex;
        margin-top: 2rem;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.2rem;
    }

    .page-title {
        margin: 0;
        font-size: 1.8rem;
        white-space: nowrap;
    }

    .top-row-buttons {
        display: flex;
        gap: 0.4rem;
    }

    .import-drop {
        margin-bottom: 1rem;
    }

    .empty {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 1rem;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        background-color: var(--wb-surface);
        color: var(--secondary-text);
    }

    .empty-title {
        font-weight: 600;
    }

    .empty-hint {
        font-size: 0.85rem;
        color: var(--hint);
    }

    /* nothing on the page is selected by a click on its empty space: Chrome would otherwise put the
       caret in the nearest text there is, which is a card's name or description, and so start
       editing it from a click beside the card */
    .project-display {
        user-select: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        padding: 0 1rem;
    }

    .project-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
        gap: 0.5rem;
        margin-bottom: 2rem;
    }

    /* the transition's wrapper, which the card fills so that a row's cards are as tall as each other */
    .project-cell {
        min-width: 0;
    }

    .content {
        display: flex;
        flex-direction: column;
        max-width: 60rem;
        width: 100%;
    }

    @media screen and (max-width: 650px) {
        .import-drop {
            display: none;
        }
        .top-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.8rem;
            margin-top: 1rem;
            margin-bottom: 0.8rem;
        }
        .page-title {
            font-size: 1.5rem;
        }
        .top-row-buttons > :global(*) {
            flex: 1;
        }
        .project-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>

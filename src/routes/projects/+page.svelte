<script lang="ts">
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import ProjectCard from '$cmp/specific/project/ProjectCard.svelte'
    import { onMount } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaPlus from '~icons/fa-solid/plus'
    import Title from '$cmp/shared/layout/Header.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { scale } from 'svelte/transition'
    import FileImporter from '$cmp/shared/fileImporter/FileImporter.svelte'
    import { blobDownloader, createShareLink } from '$lib/utils'
    import FaUpload from '~icons/fa-solid/upload'
    import { toast } from '$stores/toastStore'
    import {
        makeProjectFromExternal,
        projectContentEquals,
        type ExternalImport
    } from '$lib/Project.svelte'
    import { Prompt } from '$stores/promptStore.svelte'
    import { goto } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import { resolve } from '$app/paths'
    import {
        looksLikeZip,
        makeProjectFromArchive,
        projectArchiveName,
        projectToArchive,
        projectToSingleSource
    } from '$lib/projectArchive'

    let hasFileHandleSupport = false

    async function importProject({ project, notice }: ExternalImport) {
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
                ProjectStore.save(project)
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

    async function importFromData(data: ArrayBuffer, fileName: string) {
        try {
            const bytes = new Uint8Array(data)
            const archiveName = /\.(?:asmproj|zip)$/i.test(fileName)
            const imported =
                looksLikeZip(bytes) || archiveName
                    ? makeProjectFromArchive(bytes)
                    : makeProjectFromExternal(new TextDecoder().decode(bytes))
            return await importProject(imported)
        } catch (e) {
            console.error(e)
            toast.error(e instanceof Error ? e.message : 'Failed to import project!')
            return undefined
        }
    }

    async function importFromFileHandle(fileHandles: FileSystemFileHandle[]) {
        for (const fileHandle of fileHandles) {
            const blob = await fileHandle.getFile()
            // @ts-ignore -- File omits the nonstandard handle retained by the importer
            blob.handle = fileHandle
            const data = await blob.arrayBuffer()
            const importedProject = await importFromData(data, blob.name)
            if (!importedProject) continue
            const id = importedProject.id
            ProjectStore.setFileHandle(
                id,
                fileHandle,
                looksLikeZip(new Uint8Array(data)) ? 'archive' : 'legacy'
            )
            const proj = await ProjectStore.getProject(id)
            if (!proj) continue
            ProjectStore.save(proj) //saves the new metadata to the file
        }
    }

    onMount(() => {
        hasFileHandleSupport = 'showOpenFilePicker' in window
        async function run() {
            await ProjectStore.load()
            try {
                if ('launchQueue' in window) {
                    //@ts-expect-error setConsumer is not in the types
                    window.launchQueue.setConsumer(async (launchParams) => {
                        let lastId = ''
                        for (const file of launchParams.files) {
                            try {
                                const blob = await file.getFile()
                                blob.handle = file
                                const data = await blob.arrayBuffer()
                                const importedProject = await importFromData(data, blob.name)
                                if (!importedProject) continue
                                lastId = importedProject.id
                                ProjectStore.setFileHandle(
                                    lastId,
                                    file,
                                    looksLikeZip(new Uint8Array(data)) ? 'archive' : 'legacy'
                                )
                                const proj = await ProjectStore.getProject(lastId)
                                if (!proj) continue
                                ProjectStore.save(proj) //saves the new metadata to the file
                            } catch (e) {
                                console.error(e)
                                toast.error('Failed to import project!')
                            }
                        }
                        const project = await ProjectStore.getProject(lastId)
                        if (project && launchParams.files.length === 1) {
                            goto(resolve('/projects/[project]', { project: project.id }))
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
<Page hasNavbar style="padding-top: 2rem">
    <div class="project-display">
        <div class="content">
            <div class="top-row">
                <Row align="center">
                    <Title style="margin: 0">Your projects</Title>
                </Row>
                <div class="row top-row-buttons">
                    {#if hasFileHandleSupport}
                        <!-- Ignored for now as browser asks for permission -->
                        <Button
                            cssVar="secondary"
                            onClick={async () => {
                                //@ts-expect-error showOpenFilePicker is not in the types
                                const files = await window.showOpenFilePicker({ multiple: true })
                                try {
                                    await importFromFileHandle(files)
                                } catch (e) {
                                    console.error(e)
                                    toast.error('Failed to import project!')
                                }
                            }}
                        >
                            <Icon style="margin-right: 0.4rem" size={1}>
                                <FaUpload />
                            </Icon>
                            Import
                        </Button>
                    {:else}
                        <FileImporter
                            on:import={(e) => {
                                if (e.detail.data instanceof ArrayBuffer) {
                                    void importFromData(e.detail.data, e.detail.file.name)
                                }
                            }}
                            as="buffer"
                            accept=".asmproj,.zip,text/*,.s68k,.asm,.x68,.mips,.riscv,.z80"
                        >
                            <Button cssVar="secondary">
                                <Icon style="margin-right: 0.4rem" size={1}>
                                    <FaUpload />
                                </Icon>
                                Import
                            </Button>
                        </FileImporter>
                    {/if}

                    <ButtonLink href="/projects/create" title="Create a new project">
                        <Icon style="margin-right: 0.3rem" size={1}>
                            <FaPlus />
                        </Icon>
                        Create
                    </ButtonLink>
                </div>
            </div>
            {#if ProjectStore.projects.length === 0}
                <h3 style="margin-top: 4rem; margin-left: 2rem; font-weight:unset">
                    You seem to have no projects, create one!
                </h3>
            {/if}
            <div class="project-grid">
                {#each ProjectStore.projects as project, i (project.id)}
                    <div
                        in:scale|global={{ duration: 200, delay: i * 50 + 150, start: 0.9 }}
                        out:scale={{ duration: 300, start: 0.8 }}
                    >
                        <ProjectCard
                            {project}
                            on:share={async (e) => {
                                const link = createShareLink(e.detail)
                                await navigator.clipboard.writeText(link)
                                toast.logPill('Copied to clipboard')
                            }}
                            on:download={(e) => {
                                const source = projectToSingleSource(e.detail)
                                if (source) {
                                    blobDownloader(
                                        new Blob([source.bytes], {
                                            type: 'text/plain;charset=utf-8'
                                        }),
                                        source.fileName
                                    )
                                    return
                                }
                                const archive = projectToArchive(e.detail)
                                blobDownloader(
                                    new Blob([new Uint8Array(archive).buffer], {
                                        type: 'application/zip'
                                    }),
                                    projectArchiveName(e.detail.name)
                                )
                            }}
                        />
                    </div>
                {/each}
                <div class="add-project">
                    <Icon size={2.5}>
                        <FaPlus />
                    </Icon>
                    <div>Create project</div>
                </div>
            </div>
        </div>
    </div>
</Page>

<style lang="scss">
    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }

    .top-row-buttons {
        gap: 0.8rem;
    }

    .add-project {
        display: none;
        justify-content: center;
        flex-direction: column;
        gap: 1rem;
        align-items: center;
        height: 100%;
        border-radius: 0.6rem;
        color: var(--accent);
        border: solid 0.1rem var(--accent);
    }

    .project-display {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
    }

    @media screen and (min-width: 650px) {
        .go-back {
            position: absolute;
            top: 4.2rem;
            left: 1rem;
        }
    }

    .project-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
        justify-content: space-between;
    }

    .content {
        display: flex;
        flex-direction: column;
        max-width: 40rem;
        width: 100%;
    }

    @media screen and (max-width: 650px) {
        .top-row {
            margin-top: 1rem;
            margin-bottom: 1rem;
            flex-direction: column;
            align-items: unset;
            gap: 1rem;
        }
        .top-row-buttons {
            justify-content: flex-end;
        }
        .project-display {
            padding: 1rem;
        }
        .project-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>

<script lang="ts">
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import ProjectCard from '$cmp/specific/project/ProjectCard.svelte'
    import { onMount } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { scale } from 'svelte/transition'
    import FileImporter from '$cmp/shared/fileImporter/FileImporter.svelte'
    import { textDownloader } from '$lib/utils'
    import FaUpload from 'svelte-icons/fa/FaUpload.svelte'
    import { toast } from '$stores/toastStore'
    import { makeProjectFromExternal } from '$lib/Project.svelte'
    import { Prompt } from '$stores/promptStore'
    import { goto } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { LANGUAGE_EXTENSIONS } from '$lib/Config'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'

    let hasFileHandleSupport = false

    async function importFromText(text: string) {
        try {
            const project = makeProjectFromExternal(text)
            const existing = await ProjectStore.getProject(project.id)
            if (existing && existing.code.trim() !== project.code.trim()) {
                const override = await Prompt.confirm(
                    'An existing project with this id already exists, do you want to override it?'
                )
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

    async function importFromFileHandle(fileHandles: FileSystemFileHandle[]) {
        for (const fileHandle of fileHandles) {
            const blob = await fileHandle.getFile()
            // @ts-ignore
            blob.handle = fileHandle
            const text = await blob.text()
            const project = makeProjectFromExternal(text)
            const id = (await importFromText(text))?.id ?? project.id
            ProjectStore.setFileHandle(id, fileHandle)
            const proj = await ProjectStore.getProject(id)
            ProjectStore.save(proj) //saves the new metadata to the file
        }
    }

    onMount(() => {
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
                                const text = await blob.text()
                                const project = makeProjectFromExternal(text)
                                lastId = (await importFromText(text))?.id ?? project.id
                                ProjectStore.setFileHandle(lastId, file)
                                const proj = await ProjectStore.getProject(lastId)
                                ProjectStore.save(proj) //saves the new metadata to the file
                            } catch (e) {
                                console.error(e)
                                toast.error('Failed to import project!')
                            }
                        }
                        const project = await ProjectStore.getProject(lastId)
                        if (project && launchParams.files.length === 1) {
                            goto(`/projects/${project.id}`)
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
                                importFromText(e.detail.data as string)
                            }}
                            as="text"
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
                            on:download={(e) => {
                                textDownloader(
                                    e.detail.toExternal(),
                                    `${(e.detail.name || 'Untitled project').split(' ').join('_')}.${LANGUAGE_EXTENSIONS[e.detail.language]}`
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

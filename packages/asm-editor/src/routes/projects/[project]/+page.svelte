<script lang="ts">
    import { page } from '$app/state'
    import {
        makeProject,
        type Project,
        projectContentEquals,
        type StoredProject
    } from '#lib/Project.svelte.ts'

    import { ProjectStore, SHARE_ID } from '#stores/projectsStore.svelte.ts'
    import { onMount } from 'svelte'
    import { toast } from '#stores/toastStore.ts'
    import Workbench from '#cmp/specific/workbench/Workbench.svelte'
    import ProjectTopBar from '#cmp/specific/workbench/ProjectTopBar.svelte'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import { Monaco } from '#lib/monaco/Monaco.ts'
    import { Prompt } from '#stores/promptStore.svelte.ts'
    import { beforeNavigate, goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import type { ResolvedPathname } from '$app/types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import { LANGUAGE_THEMES } from '#lib/Config.ts'
    import { blobDownloader, createShareLink, ShareTooLargeError } from '#lib/utils.ts'
    import { serializer } from '#lib/json.ts'
    import { examSessionPath, parseLegacyProjectExamPayload } from '#lib/exam.ts'
    import { projectArchiveName, projectToArchive } from '#lib/projectArchive.ts'

    let project = $state(makeProject())
    let status: 'loading' | 'loaded' | 'error' = $state('loading')
    let linkedMigrationNoticeShown = false

    /**
     * The Edit journals of the Project's Files, saved with it, one store a Project
     * ([ADR 0063](../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).
     */
    const journals = $derived(ProjectStore.journalStore(project.id))
    /** A change the Workbench reported since the last successful save. */
    let dirty = $state(false)
    let lastSaveFailed = $state(false)
    /**
     * Whether the Project has changes nothing will save on its own, which is when the Workbench
     * shows Save ([the design record](../../../../../../docs/design/workbench.md), Save): a shared Project
     * is nobody's until saved, and under autosave only a failed save leaves changes behind.
     */
    const unsaved = $derived(
        project.id === SHARE_ID ||
            (dirty && (!preferencesStore.values.autoSave.value || lastSaveFailed))
    )

    /**
     * Leaving for another page of the site while there are unsaved changes asks first, as leaving
     * the site does ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 17): a link, or the browser's Back, which Alt+← and the mouse's back button are
     * outside a Listing and a Pseudocode with somewhere to go. An unload is the browser's to ask
     * about, through `beforeunload` below, and the page's own navigations have asked already
     * (`changePage`) or follow a save.
     */
    beforeNavigate((navigation) => {
        if (!unsaved || navigation.willUnload || navigation.type === 'goto') return
        if (!confirm('You have unsaved changes. Do you want to leave without saving?'))
            navigation.cancel()
    })

    async function loadProject() {
        const id = page.params.project ?? ''
        try {
            if (id === 'exam') {
                const code = page.url.searchParams.get('project')
                if (!code) {
                    toast.error('Invalid legacy exam link', 10000)
                    status = 'error'
                    return
                }

                const migratedExam = parseLegacyProjectExamPayload(code)
                if (!migratedExam) {
                    toast.error('Could not migrate legacy exam link', 10000)
                    status = 'error'
                    return
                }

                await goto(resolve(examSessionPath(migratedExam)), { replace: true })
                return
            }

            if (id === 'share') {
                const code = page.url.searchParams.get('project')
                if (!code) {
                    toast.error('Invalid shared project link', 10000)
                    status = 'error'
                    return
                }
                const parsedCode = lzstring.decompressFromEncodedURIComponent(code)
                if (!parsedCode) {
                    toast.error('Invalid shared project link', 10000)
                    status = 'error'
                    return
                }

                //any shape a link was ever made from: the normalizer inside set reads them all
                const parsed = serializer.parse<StoredProject>(parsedCode)
                project.set({ ...parsed, id: SHARE_ID })
            } else {
                const loadedProject = await ProjectStore.getProject(id)
                if (!loadedProject) {
                    toast.error('Project not found', 10000)
                    status = 'error'
                    return
                }
                project.set(loadedProject)
            }
            status = 'loaded'
        } catch (e) {
            //a link mangled on its way here, or storage the browser blocked: an error screen, never
            //a load that does not end
            console.error(e)
            toast.error(
                id === 'share' ? 'Invalid shared project link' : 'Could not load this project',
                10000
            )
            status = 'error'
        }
    }

    onMount(() => {
        loadProject()
        Monaco.load()
        return () => {
            Monaco.dispose()
        }
    })

    /**
     * Saves the project, asking first when it is a shared one, which is nobody's yet. An automatic
     * save (autosave while typing, the display a Build read from the source) is dropped for a
     * shared project rather than asked about: it would put the question up as soon as the program
     * is run, and whether a shared project becomes one of the user's own is theirs to decide, with
     * the Save button or when they leave the page. False when nothing was stored, which a browser
     * that refused the write is too.
     */
    async function save(project: Project, silent: boolean): Promise<boolean> {
        if (status !== 'loaded') return false
        if (project.id === SHARE_ID) {
            if (silent) return false
            const confirmed = await Prompt.confirm(
                'Do you want to save this shared project in your projects?'
            )
            if (confirmed === null) return false
            if (!confirmed) return false
            try {
                //gives the Project its own id once it is stored, and leaves it the link's otherwise
                await ProjectStore.addProject(project)
            } catch (error) {
                console.error(error)
                toast.error(
                    'Could not save this project in the browser — your changes are not stored.',
                    10000
                )
                return false
            }
            //in place of the link in the history: the page is not loaded again for the link's
            //address, so Back to it would go on showing the saved Project under that address
            goto(resolve('/projects/[project]', { project: project.id }), { replace: true })
        } else {
            const result = await ProjectStore.save(project, journals)
            if (result.local === 'failed') {
                //Not silenced by autosave: nothing was stored, so the user has to know now.
                toast.error(
                    'Could not save this project in the browser — your changes are not stored.',
                    10000
                )
                return false
            }
            if (result.linked === 'failed') {
                toast.error(
                    'Project saved in the browser, but its linked disk file could not be updated.'
                )
            } else if (result.linked === 'needs-archive') {
                if (silent) {
                    if (!linkedMigrationNoticeShown) {
                        linkedMigrationNoticeShown = true
                        toast.warn(
                            'Project saved in the browser. Its linked source file cannot hold multiple or binary Files; use Save to choose an .asmproj archive.',
                            10000
                        )
                    }
                } else {
                    await offerArchiveSave(project)
                }
            }
        }
        return true
    }

    /**
     * Saves for the Workbench or before leaving, and keeps what it means for `unsaved`: changes a
     * save did not store stay unsaved, so Save stays and leaving asks.
     */
    async function saveChanges(silent: boolean): Promise<boolean> {
        const saved = await save(project, silent)
        lastSaveFailed = !saved
        if (saved) dirty = false
        return saved
    }

    async function offerArchiveSave(project: Project) {
        const saveArchive = await Prompt.confirm(
            'This Project no longer fits its linked source file. Save a complete .asmproj archive instead?'
        )
        if (!saveArchive) return
        try {
            const archive = projectToArchive(project)
            if ('showSaveFilePicker' in window) {
                const handle: FileSystemFileHandle = await window.showSaveFilePicker({
                    suggestedName: projectArchiveName(project.name),
                    types: [
                        {
                            description: 'ASM Editor Project',
                            accept: { 'application/zip': ['.asmproj'] }
                        }
                    ]
                })
                const writer = await handle.createWritable()
                await writer.write(new Uint8Array(archive).buffer)
                await writer.close()
                ProjectStore.setFileHandle(project.id, handle, 'archive')
                linkedMigrationNoticeShown = false
                toast.success('Project archive saved and linked')
                return
            }
            const contents = new Uint8Array(archive).buffer
            blobDownloader(
                new Blob([contents], { type: 'application/zip' }),
                projectArchiveName(project.name)
            )
            toast.warn(
                'Archive downloaded. This browser cannot link it for future saves; the original source file was left unchanged.',
                10000
            )
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            console.error(error)
            toast.error('Could not save the Project archive')
        }
    }

    async function share(pr: Project) {
        if (!pr) return
        let url: string
        try {
            url = createShareLink(pr)
        } catch (error) {
            console.error(error)
            toast.error(
                error instanceof ShareTooLargeError
                    ? 'This Project is too big to share as a link. Export an .asmproj archive instead.'
                    : 'Could not create a share link for this Project',
                10000
            )
            return
        }
        await navigator.clipboard.writeText(url)
        toast.logPill('Copied to clipboard')
    }

    async function changePage(page: ResolvedPathname) {
        try {
            const stored = await ProjectStore.getProjectFromDb(project.id)
            //a shared link's Project, or one deleted in another tab since it was opened
            if (!stored) {
                const save = await Prompt.confirm(
                    'This project is not in your projects. Would you like to save it there?'
                )
                if (save === null) return
                if (save) {
                    await ProjectStore.addProject(project)
                    toast.logPill('Project created')
                }
                return goto(page)
            }
            if (projectContentEquals(stored.toObject(), project.toObject())) return goto(page)
            const wantsToSave = await Prompt.confirm(
                'You have unsaved changes. Do you want to save them?'
            )
            if (wantsToSave === null) return
            if (wantsToSave) {
                //a save that stored nothing keeps the page, with its changes, open
                if (!(await saveChanges(false))) return
                toast.logPill('Project saved')
            }
            goto(page)
        } catch (e) {
            console.error(e)
            toast.error('Error updating project')
        }
    }
</script>

<svelte:head>
    <title>
        {project?.name || 'Unnamed'}
    </title>

    <meta
        name="description"
        content="Use the editor to write code and run it to debug. Built in documentation and useful tools to learn and develop more easily"
    />
</svelte:head>

<!-- leaving asks first only while there are changes nothing will save on its own -->
<svelte:window
    onbeforeunload={(e) => {
        if (!unsaved) return
        e.preventDefault()
        e.returnValue = 'You have unsaved changes'
    }}
/>

{#snippet loadingScreen(errored: boolean)}
    <div class="overlay" class:overlay-hidden={!(status === 'loading' || status === 'error')}>
        {#if !errored}
            <h1 class="loading">Loading...</h1>
        {:else}
            <h1 class="error">Error loading project!</h1>
            <ButtonLink href="/projects">Back to your projects</ButtonLink>
        {/if}
    </div>
{/snippet}
<Page>
    <div class="workbench-page">
        <ThemeScope theme={LANGUAGE_THEMES[project.language]}>
            {#if status === 'loaded'}
                {#key project.id}
                    <Workbench
                        {project}
                        {unsaved}
                        editJournals={journals}
                        onSave={async ({ silent }) => {
                            const saved = await saveChanges(silent)
                            if (saved && !silent) toast.logPill('Project saved')
                        }}
                        onChange={() => (dirty = true)}
                    >
                        {#snippet header(ui)}
                            <ProjectTopBar
                                phone={ui.deviceClass === 'phone'}
                                drawerOpen={ui.drawerOpen}
                                onToggleMenu={() => (ui.drawerOpen = !ui.drawerOpen)}
                                onHome={() => changePage(resolve('/'))}
                                onBack={() => changePage(resolve('/projects'))}
                                onDonate={() => changePage(resolve('/donate'))}
                                onShare={() => share(project)}
                            />
                        {/snippet}
                        {#snippet loading()}
                            {@render loadingScreen(false)}
                        {/snippet}
                    </Workbench>
                {/key}
            {/if}
        </ThemeScope>
    </div>
    {#if status === 'loading' || status === 'error'}
        {@render loadingScreen(status === 'error')}
    {/if}
</Page>

<style lang="scss">
    /* the Workbench fills its container, and here the container is the whole screen */
    .workbench-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: var(--screen-height);
        min-height: 0;
        overflow: hidden;

        /* a flex item keeps its content's height unless told otherwise, and the Workbench's
           content is taller than the screen whenever the debug column is open */
        :global(.theme-scope) {
            min-height: 0;
        }
    }

    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(0.5rem);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        gap: 2rem;
        z-index: 20;
        padding: 1rem;
    }

    .loading {
        font-size: 3.5rem;
        text-align: center;
    }

    .error {
        font-size: 2.5rem;
        color: var(--red);
    }
</style>

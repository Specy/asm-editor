<script lang="ts">
    import { page } from '$app/state'
    import {
        makeProject,
        type Project,
        projectContentEquals,
        projectWorkEquals,
        type StoredProject
    } from '#lib/Project.svelte.ts'

    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
    import { SHARE_ID } from '#lib/shareId.ts'
    import { storedFilesSize } from '#lib/projectFiles.ts'

    /** The most a Project's Files may hold for its save to be trusted to land as its tab closes. */
    const CLOSING_SAVE_LIMIT = 16 * 1024 * 1024
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
    import Page from '#cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import { LANGUAGE_THEMES } from '#lib/Config.ts'
    import { blobDownloader, copyText, createShareLink, ShareTooLargeError } from '#lib/utils.ts'
    import { serializer } from '#lib/json.ts'
    import { examSessionPath, parseLegacyProjectExamPayload } from '#lib/exam.ts'
    import { projectArchiveName, projectToArchive } from '#lib/projectArchive.ts'
    import {
        destinationPath,
        EXAMPLE_CHANGE_MESSAGE,
        EXAMPLE_LEAVE_MESSAGE,
        exampleSharePath,
        ExampleNotFoundError,
        loadExample,
        type ExampleDestination
    } from '#lib/examples.ts'
    import {
        readShareStart,
        shareStartQuery,
        startSharedProject,
        type ShareStartAction
    } from '#lib/shareStart.ts'
    import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'

    let project = $state(makeProject())
    let status: 'loading' | 'loaded' | 'error' = $state('loading')
    let linkedMigrationNoticeShown = false
    let exampleId = $state<string | null>(null)
    let exampleSnapshot: ReturnType<Project['toObject']> | null = null
    /**
     * Whether the opened example's work differs from the archive it came from. Tabs, File views
     * and a Build output nobody changed do not count, so looking around an example or building it
     * is not editing it. Comparing whole Projects costs too much for every key typed, so it is
     * checked once the changes pause, and at once wherever the answer decides something.
     */
    let exampleEdited = $state(false)
    let exampleCheck: ReturnType<typeof setTimeout> | undefined
    function checkExample(): boolean {
        clearTimeout(exampleCheck)
        exampleEdited =
            exampleSnapshot !== null && !projectWorkEquals(exampleSnapshot, project.toObject())
        return exampleEdited
    }
    function checkExampleSoon() {
        clearTimeout(exampleCheck)
        exampleCheck = setTimeout(checkExample, 250)
    }
    $effect(() => () => clearTimeout(exampleCheck))
    /** An example opened from a link and not yet saved as a Project of the person's own. */
    const openExample = $derived(exampleId !== null && project.id === SHARE_ID)
    /**
     * The Examples page, when it shows this page in its frame: the site's own pages open there
     * rather than inside the frame. Any other page that frames the editor is left alone.
     */
    function examplesPageFrame(): Window | null {
        if (exampleId === null || window.parent === window) return null
        try {
            return window.parent.location.origin === window.location.origin ? window.parent : null
        } catch {
            return null
        }
    }
    function leaveFor(destination: ExampleDestination, options?: { replace?: boolean }) {
        const examples = examplesPageFrame()
        if (examples) {
            examples.postMessage(
                { type: EXAMPLE_LEAVE_MESSAGE, example: exampleId, destination },
                window.location.origin
            )
            return
        }
        return options
            ? goto(destinationPath(destination), options)
            : goto(destinationPath(destination))
    }
    let startupRequested = false
    /** The Workbench's session, which starts at once the save autosave is waiting on. */
    let session: WorkbenchSession | undefined

    function startOnOpen(opened: WorkbenchSession, signal: AbortSignal) {
        session = opened
        signal.addEventListener('abort', () => {
            if (session === opened) session = undefined
        })
        if (startupRequested || page.params.project !== 'share') return
        startupRequested = true
        void startSharedProject(opened, readShareStart(page.url.searchParams), signal).catch(
            (error) => {
                console.error(error)
                if (!signal.aborted) toast.error('Could not start this shared project')
            }
        )
    }

    /**
     * The Edit journals of the Project's Files, saved with it, one store a Project
     * ([ADR 0063](../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).
     */
    /**
     * The Edit journals' store of this page's Project, one for its id: the derived below may run
     * again as the page goes, when the Workbench's last save reads it, and must find the same store,
     * with the journal reads its Workbench left in it. A later visit's page has a store of its own,
     * so a closed Workbench's reads never reach a later one's saves.
     */
    let journalCache:
        | { id: string; store: ReturnType<typeof ProjectStore.journalStore> }
        | undefined
    function journalsOf(id: string) {
        if (journalCache?.id !== id) journalCache = { id, store: ProjectStore.journalStore(id) }
        return journalCache.store
    }
    const journals = $derived(journalsOf(project.id))
    /** A change the Workbench reported since the last successful save. */
    let dirty = $state(false)
    let lastSaveFailed = $state(false)
    /**
     * Counts the changes the Workbench reported, so that a save clears `dirty` only when nothing
     * changed after its snapshot was taken: a save of a large Project takes long enough to type in.
     */
    let changes = 0
    /** The save in flight, which reading the stored Project waits for. */
    let saving: Promise<boolean> | undefined
    /**
     * Whether a save still being written as the tab closes may not reach the browser's storage:
     * a Project of more than 16 MiB of Files, whose whole row takes long enough to write that a
     * tab closed during it lost it most times, where one of up to 16 MiB was stored every time
     * (ADR 0076). Closing such a tab while its save is written asks first, which gives the save
     * the moment it needs; a smaller Project's tab closes without asking.
     */
    function savedAtRisk() {
        //a shared Project is never saved on its own, so there is no save to wait for
        return project.id !== SHARE_ID && storedFilesSize(project.files) > CLOSING_SAVE_LIMIT
    }
    /**
     * Whether the Project has changes nothing will save on its own, which is when the Workbench
     * shows Save ([the design record](../../../../../../docs/design/workbench.md), Save): a shared Project
     * is nobody's until saved, and under autosave only a failed save leaves changes behind.
     * An example asks only once its work is edited, so browsing examples does not ask to save each
     * one.
     */
    const unsaved = $derived(
        project.id === SHARE_ID
            ? !openExample || exampleEdited
            : dirty && (!preferencesStore.values.autoSave.value || lastSaveFailed)
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
        if (openExample) checkExample()
        if (unsaved && !navigation.willUnload && navigation.type !== 'goto') {
            if (!confirm('You have unsaved changes. Do you want to leave without saving?')) {
                navigation.cancel()
                return
            }
        }
        //what autosave waits on is saved before the next page reads the stored Projects
        session?.saveNow()
    })

    /** Why the Project did not open, said in place of the Workbench. */
    let failure = $state<{
        title: string
        description: string
        /** Given for a failure of the browser's or the site's, which is worth reporting. */
        error?: unknown
    } | null>(null)
    function fail(title: string, description: string, error?: unknown) {
        failure = { title, description, error }
        status = 'error'
    }
    const SHARE_BROKEN =
        'The project in the link could not be read: the link was cut short or changed on its way here. Ask for it again.'
    const EXAM_BROKEN =
        'The exam in the link could not be read: the link was cut short or changed on its way here. Ask for it again.'

    $effect(() => {
        if (exampleId !== null && status === 'loaded' && window.parent !== window) {
            window.parent.postMessage(
                { type: EXAMPLE_CHANGE_MESSAGE, example: exampleId, dirty: unsaved },
                window.location.origin
            )
        }
    })

    async function loadProject() {
        const id = page.params.project ?? ''
        try {
            if (id === 'exam') {
                const code = page.url.searchParams.get('project')
                if (!code) {
                    fail('This exam link is broken', EXAM_BROKEN)
                    return
                }

                const migratedExam = parseLegacyProjectExamPayload(code)
                if (!migratedExam) {
                    fail('This exam link is broken', EXAM_BROKEN)
                    return
                }

                await goto(resolve(examSessionPath(migratedExam)), { replace: true })
                return
            }

            if (id === 'share') {
                exampleId = page.url.searchParams.get('example')
                if (exampleId !== null) {
                    const example = await loadExample(exampleId)
                    exampleSnapshot = example.toObject()
                    project.set(exampleSnapshot)
                    status = 'loaded'
                    return
                }
                const code = page.url.searchParams.get('project')
                if (!code) {
                    fail('This shared link is broken', SHARE_BROKEN)
                    return
                }
                const parsedCode = lzstring.decompressFromEncodedURIComponent(code)
                if (!parsedCode) {
                    fail('This shared link is broken', SHARE_BROKEN)
                    return
                }

                //any shape a link was ever made from: the normalizer inside set reads them all
                const parsed = serializer.parse<StoredProject>(parsedCode)
                project.set({ ...parsed, id: SHARE_ID })
            } else {
                const loadedProject = await ProjectStore.getProject(id)
                if (!loadedProject) {
                    fail(
                        "This project doesn't exist",
                        'It may have been deleted. Projects are kept in the browser they were made in, so one made in another browser or on another device is not here.'
                    )
                    return
                }
                project.set(loadedProject)
            }
            status = 'loaded'
        } catch (e) {
            //a link mangled on its way here, or storage the browser blocked: an error screen, never
            //a load that does not end
            console.error(e)
            if (id === 'share' && exampleId !== null) {
                fail(
                    e instanceof ExampleNotFoundError
                        ? 'This example is not available'
                        : "This example didn't open",
                    e instanceof ExampleNotFoundError
                        ? 'Check the example link, or choose another example on the Examples page.'
                        : 'The example project could not be loaded. Reload the page to try again.',
                    e instanceof ExampleNotFoundError ? undefined : e
                )
            } else if (id === 'share') fail('This shared link is broken', SHARE_BROKEN)
            else
                fail(
                    "This project didn't open",
                    "The page could not read it from the browser's storage. Reload the page, or check that the browser allows this site to store data.",
                    e
                )
        }
    }

    onMount(() => {
        void loadProject()
        //started early; an editor that asks for Monaco loads it again if this fails
        Monaco.load().catch(() => undefined)
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
            //address, so Back to it would go on showing the saved Project under that address.
            //On the Examples page, the saved Project opens in the editor itself.
            void leaveFor({ to: 'project', id: project.id }, { replace: true })
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
        const taken = changes
        const pending = save(project, silent)
        saving = pending
        const saved = await pending
        if (saving === pending) saving = undefined
        lastSaveFailed = !saved
        if (saved && changes === taken) dirty = false
        return saved
    }

    async function offerArchiveSave(project: Project) {
        const saveArchive = await Prompt.confirm(
            'This Project no longer fits its linked source file. Save a complete .asmproj archive instead?'
        )
        if (!saveArchive) return
        try {
            const archive = await projectToArchive(project)
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

    async function share(pr: Project, action?: ShareStartAction) {
        if (!pr) return
        let url: string
        try {
            url =
                exampleId !== null && exampleSnapshot !== null && !checkExample()
                    ? new URL(exampleSharePath(exampleId, action), window.location.origin).href
                    : createShareLink(pr) + shareStartQuery(action)
        } catch (error) {
            console.error(error)
            toast.error(
                error instanceof ShareTooLargeError
                    ? 'This Project is too large to share as a link. Export an .asmproj archive instead.'
                    : 'Could not create a share link for this Project',
                10000
            )
            return
        }
        await copyText(url, 'Share link')
    }

    async function changePage(destination: ExampleDestination) {
        //an example nobody edited is the link's to open again: nothing to keep
        if (openExample && !checkExample()) return leaveFor(destination)
        //what autosave waits on is saved first, so that the stored Project below has it
        session?.saveNow()
        try {
            await saving
            //a shared link's Project, or one deleted in another tab since it was opened
            if (!(await ProjectStore.isStored(project.id))) {
                const save = await Prompt.confirm(
                    'This project is not in your projects. Would you like to save it there?'
                )
                if (save === null) return
                if (save) {
                    await ProjectStore.addProject(project)
                    toast.logPill('Project created')
                }
                return leaveFor(destination)
            }
            //every change the Workbench reported is saved: the stored Project need not be read
            if (!dirty) return leaveFor(destination)
            const stored = await ProjectStore.getProjectFromDb(project.id)
            if (stored && projectContentEquals(stored.toObject(), project.toObject()))
                return leaveFor(destination)
            const wantsToSave = await Prompt.confirm(
                'You have unsaved changes. Do you want to save them?'
            )
            if (wantsToSave === null) return
            if (wantsToSave) {
                //a save that stored nothing keeps the page, with its changes, open
                if (!(await saveChanges(false))) return
                toast.logPill('Project saved')
            }
            return leaveFor(destination)
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
        if (openExample) checkExample()
        //the save autosave waits on starts now, if SvelteKit's own guard has not started it
        session?.saveNow()
        //a linked file still to be written, by this save or an earlier one, would be left on
        //disk older than the Project
        const linked = project.id !== SHARE_ID && ProjectStore.writableFiles.has(project.id)
        const writing =
            (saving && (savedAtRisk() || linked)) ||
            (linked && ProjectStore.linkedWritePending(project.id))
        if (!unsaved && !writing) return
        e.preventDefault()
        e.returnValue = 'You have unsaved changes'
    }}
/>

{#snippet loadingScreen()}
    <div class="overlay" class:overlay-hidden={status !== 'loading'}>
        <h1 class="loading">Loading...</h1>
    </div>
{/snippet}
<Page fillsScreen>
    <div class="workbench-page">
        <ThemeScope theme={LANGUAGE_THEMES[project.language]}>
            {#if status === 'loaded'}
                {#key project.id}
                    <Workbench
                        {project}
                        {unsaved}
                        editJournals={journals}
                        onReady={startOnOpen}
                        onSave={async ({ silent }) => {
                            const saved = await saveChanges(silent)
                            if (saved && !silent) toast.logPill('Project saved')
                        }}
                        onChange={() => {
                            dirty = true
                            changes += 1
                            if (openExample) checkExampleSoon()
                        }}
                    >
                        {#snippet header(ui)}
                            <ProjectTopBar
                                phone={ui.deviceClass === 'phone'}
                                drawerOpen={ui.drawerOpen}
                                onToggleMenu={() => (ui.drawerOpen = !ui.drawerOpen)}
                                onHome={() => changePage({ to: 'home' })}
                                onBack={() => changePage({ to: 'projects' })}
                                onDonate={() => changePage({ to: 'donate' })}
                                onShare={(action) => {
                                    void share(project, action)
                                }}
                            />
                        {/snippet}
                        {#snippet loading()}
                            {@render loadingScreen()}
                        {/snippet}
                        {#snippet failureActions()}
                            <ButtonLink href={resolve('/projects')} cssVar="tertiary">
                                Back to projects
                            </ButtonLink>
                        {/snippet}
                    </Workbench>
                {/key}
            {:else if status === 'error' && failure}
                <ErrorState
                    title={failure.title}
                    error={failure.error}
                    reload={failure.error !== undefined}
                >
                    {failure.description}
                    {#snippet actions()}
                        {#if exampleId !== null}
                            <ButtonLink href={resolve('/examples')}>Browse examples</ButtonLink>
                        {/if}
                        <ButtonLink
                            href={resolve('/projects')}
                            cssVar={failure?.error !== undefined ? 'tertiary' : 'unset'}
                        >
                            Back to projects
                        </ButtonLink>
                    {/snippet}
                </ErrorState>
            {/if}
        </ThemeScope>
    </div>
    {#if status === 'loading'}
        {@render loadingScreen()}
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
</style>

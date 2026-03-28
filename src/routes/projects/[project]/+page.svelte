<script lang="ts">
    import { page } from '$app/stores'
    import { makeProject, type Project } from '$lib/Project.svelte'
    import { ProjectStore, SHARE_ID } from '$stores/projectsStore.svelte'
    import { onMount, untrack } from 'svelte'
    import { toast } from '$stores/toastStore'
    import ProjectEditor from './Project.svelte'
    import { Monaco } from '$lib/monaco/Monaco'
    import { Prompt } from '$stores/promptStore.svelte'
    import { goto } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { DEFAULT_THEME, ThemeStore } from '$stores/themeStore.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import { createShareLink } from '$lib/utils'
    import { serializer } from '$lib/json'
    import { createExamSessionLink, parseLegacyProjectExamPayload } from '$lib/exam'

    let project = $state(makeProject())
    let status: 'loading' | 'loaded' | 'error' = $state('loading')
    let oldTheme = ThemeStore.getChosenTheme()

    $effect(() => {
        const theme = LANGUAGE_THEMES[project.language]
        untrack(() => {
            if (ThemeStore.meta.id !== DEFAULT_THEME.id) return //prefer the user's theme
            ThemeStore.select(theme, true)
        })
    })
    onMount(() => {
        return () => {
            ThemeStore.select(oldTheme, true)
        }
    })

    async function loadProject() {
        const id = $page.params.project
        if (id === 'exam') {
            const code = $page.url.searchParams.get('project')
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

            await goto(createExamSessionLink(migratedExam), { replaceState: true })
            return
        }

        if (id === 'share') {
            const code = $page.url.searchParams.get('project')
            const parsedCode = lzstring.decompressFromEncodedURIComponent(code)
            if (!parsedCode) {
                toast.error('Invalid shared project link', 10000)
                status = 'error'
                return
            }

            const parsed = serializer.parse<Project>(parsedCode)
            parsed.id = SHARE_ID
            project.set(parsed)
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
    }

    onMount(() => {
        loadProject()
        Monaco.load()
        return () => {
            Monaco.dispose()
        }
    })

    async function save(project: Project): Promise<boolean> {
        if (status !== 'loaded') return false
        if (project.id === SHARE_ID) {
            if (
                !(await Prompt.confirm('Do you want to save this shared project in your projects?'))
            )
                return false
            project.set({ id: undefined })
            const newProject = await ProjectStore.addProject(project)
            project.set({ id: newProject.id })
            goto(`/projects/${project.id}`)
        } else {
            await ProjectStore.save(project)
        }
        return true
    }

    async function share(pr: Project) {
        if (!pr) return
        const url = createShareLink(pr)
        await navigator.clipboard.writeText(url)
        toast.logPill('Copied to clipboard')
    }

    async function changePage(page: string) {
        try {
            const stored = await ProjectStore.getProjectFromDb(project.id)
            if (!stored) {
                const save = await Prompt.confirm(
                    'This project has not been saved. Would you like to create and save it?'
                )
                if (save) {
                    await ProjectStore.addProject(project)
                    toast.logPill('Project created')
                }
                return goto(page)
            }
            if (stored.code === project.code) return goto(page)
            const wantsToSave = await Prompt.confirm(
                'You have unsaved changes. Do you want to save them?'
            )
            if (wantsToSave) {
                await ProjectStore.save(project)
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

<svelte:window
    onbeforeunload={(e) => {
        if (!$page.url.hostname.includes('localhost')) {
            e.preventDefault()
            e.returnValue = 'You have unsaved changes'
        }
    }}
/>

{#snippet loadingScreen(errored)}
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
    {#key project.id}
        <EmulatorLoader bind:code={project.code} language={project.language}>
            {#snippet children(emulator)}
                <ProjectEditor
                    {emulator}
                    name={project.name}
                    language={project.language}
                    bind:code={project.code}
                    bind:testcases={project.testcases}
                    on:wantsToLeave={() => {
                        changePage('/projects')
                    }}
                    on:save={async ({ detail }) => {
                        if (!(await save(project))) return
                        console.log('Saved')
                        if (!detail.silent) toast.logPill('Project saved')
                    }}
                    on:share={() => {
                        share(project)
                    }}
                />
            {/snippet}
            {#snippet loading()}
                {@render loadingScreen(false)}
            {/snippet}
        </EmulatorLoader>
        {#if status === 'loading' || status === 'error'}
            {@render loadingScreen(status === 'error')}
        {/if}
    {/key}
</Page>

<style lang="scss">
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

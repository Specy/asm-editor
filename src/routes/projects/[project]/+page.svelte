<script lang="ts">
    import { page } from '$app/stores'
    import { makeProject, type Project } from '$lib/Project.svelte'
    import { ProjectStore, SHARE_ID } from '$stores/projectsStore.svelte'
    import { onMount, untrack } from 'svelte'
    import { toast } from '$stores/toastStore'
    import ProjectEditor from './Project.svelte'
    import { Monaco } from '$lib/monaco/Monaco'
    import { Prompt } from '$stores/promptStore'
    import { goto } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { DEFAULT_THEME, ThemeStore } from '$stores/themeStore.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import { createShareLink } from '$lib/utils'
    import { serializer } from '$lib/json'

    let project = makeProject()
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
        if (id === 'share') {
            const code = $page.url.searchParams.get('project')
            const parsed = serializer.parse<Project>(
                lzstring.decompressFromEncodedURIComponent(code)
            )
            parsed.id = SHARE_ID
            project.set(parsed)
        } else {
            project.set(await ProjectStore.getProject(id))
            if (!project) {
                toast.error('Project not found', 10000)
                status = 'error'
                return
            }
        }
        status = 'loaded'
    }

    onMount(() => {
        loadProject()
        Monaco.load()
        return Monaco.dispose
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
                    bind:project
                    on:wantsToLeave={() => {
                        changePage('/projects')
                    }}
                    on:save={async ({ detail }) => {
                        if (!(await save(project))) return
                        console.log('Saved')
                        if (!detail.silent) toast.logPill('Project saved')
                    }}
                    on:share={({ detail }) => {
                        share(detail)
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
        z-index: 10;
    }

    .project {
        padding: 0.8rem;
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100%;
    }

    .loading {
        font-size: 3.5rem;
    }

    .error {
        font-size: 2.5rem;
        color: var(--red);
    }
</style>

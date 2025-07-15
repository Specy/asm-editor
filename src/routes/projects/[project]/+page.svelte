<script lang="ts">
    import { page } from '$app/stores'
    import { makeProject, type Project } from '$lib/Project.svelte'
    import { ProjectStore, SHARE_ID, EXAM_ID } from '$stores/projectsStore.svelte'
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
    import { createShareLink, makeHash } from '$lib/utils'
    import { serializer } from '$lib/json'
    import PromptProvider from '$cmp/shared/providers/PromptProvider.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'

    let project = makeProject()
    let isExam = $state(false)
    let examSubmission = $state({
        name: '',
        submissionTimestamp: 0,
        startedAt: 0,
        hash: ''
    } satisfies Project['exam']['submission'])
    let examDisabled = $state(false)
    let examPassword = $state('')
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
        if (id === 'share' || id === 'exam') {
            const code = $page.url.searchParams.get('project')
            const parsed = serializer.parse<Project>(
                lzstring.decompressFromEncodedURIComponent(code)
            )
            parsed.id = id === 'share' ? SHARE_ID : EXAM_ID
            isExam = id === 'exam'
            project.set(parsed)
            if (isExam && !parsed.exam?.submission) {
                const name = await Prompt.askText(
                    'Welcome to the exam! The app will go full screen soon.\n\nIF YOU EXIT FULL SCREEN OR CHANGE PAGE, YOUR EDITOR WILL BE DISABLED.\n\nPlease write your name to start the exam.',
                    false
                )
                examSubmission.name = name
                examSubmission.startedAt = Date.now()
                const hash = (await makeHash(`${name}${examSubmission.startedAt}`)).slice(0, 6)
                examSubmission.hash = hash
                if (project.exam.accessPasswordHash) {
                    while (true) {
                        const accessPassword = await Prompt.askText(
                            'Please enter the exam access password to start the exam.',
                            false
                        )
                        const hash = (await makeHash(accessPassword)).slice(0, 6)
                        if (hash === project.exam.accessPasswordHash) break
                        toast.error('Wrong access password')
                    }
                }
                startExam()
            } else {
                examSubmission = parsed.exam?.submission || examSubmission
            }
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
        return () => {
            window.removeEventListener('visibilitychange', listenVisibilityChange)
            window.removeEventListener('fullscreenchange', listenFullscreenChange)
            window.removeEventListener('blur', listenVisibilityChange)
            Monaco.dispose()
        }
    })

    async function save(project: Project): Promise<boolean> {
        if (status !== 'loaded') return false
        if (project.id === EXAM_ID) {
            return false
        }
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

    async function finishExam(exam: Project) {
        if (!isExam) return
        const wantsToFinish = await Prompt.confirm(
            'Do you want to finish the exam? You will not be able to edit the code anymore.'
        )
        if (!wantsToFinish) return
        examDisabled = true
        examSubmission.submissionTimestamp = Date.now()
        exam.exam.submission = examSubmission
        const url = createShareLink(exam, 'exam')
        await navigator.clipboard.writeText(url)
        toast.logPill('Exam submission copied to clipboard')
        document.exitFullscreen()
    }

    async function unlockExam() {
        const hash = (await makeHash(examPassword)).slice(0, 6)
        examPassword = ''
        if (hash === project.exam?.passwordHash) {
            examDisabled = false
            toast.logPill('Exam unlocked')
            examSubmission.submissionTimestamp = 0
            await document.documentElement.requestFullscreen()
        } else {
            toast.error('Wrong password')
        }
    }

    function listenVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            examDisabled = true
        }
        if (!document.hasFocus()) {
            examDisabled = true
        }
    }

    function listenFullscreenChange() {
        if (!document.fullscreenElement) {
            examDisabled = true
        }
    }

    async function startExam() {
        window.addEventListener('visibilitychange', listenVisibilityChange)
        window.addEventListener('fullscreenchange', listenFullscreenChange)
        window.addEventListener('blur', listenVisibilityChange)
        await document.documentElement.requestFullscreen()
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
            {#if isExam}
                <h1 class="loading">Exam</h1>
                <Card
                    padding="1rem 2rem"
                    style="margin-top: 1rem; visibility: {examSubmission.name
                        ? 'visible'
                        : 'hidden'}"
                    background="tertiary"
                >
                    <Header type="h2">
                        {examSubmission.name} ({examSubmission.hash})
                    </Header>
                </Card>
            {:else}
                <h1 class="loading">Loading...</h1>
            {/if}
        {:else}
            <h1 class="error">Error loading project!</h1>
            <ButtonLink href="/projects">Back to your projects</ButtonLink>
        {/if}
    </div>
{/snippet}
<Page>
    {#if examDisabled}
        <div class="overlay">
            <h1 class="loading">Exam disabled</h1>
            <p>The exam has been disabled. If you want to unlock it, ask the owner of the exam.</p>
            <Row gap="1rem">
                <Input type="password" placeholder="Unlock password" bind:value={examPassword} />
                <Button onClick={unlockExam}>Unlock</Button>
            </Row>
            <Card padding="1rem 2rem" style="margin-top: 1rem;" background="tertiary">
                <Header type="h2">
                    {examSubmission.name} ({examSubmission.hash})
                </Header>
            </Card>
        </div>
    {/if}
    {#key project.id}
        <EmulatorLoader bind:code={project.code} language={project.language}>
            {#snippet children(emulator)}
                <ProjectEditor
                    {isExam}
                    {examSubmission}
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
                    on:finishedExam={({ detail }) => {
                        finishExam(detail)
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

    .project {
        padding: 0.8rem;
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100%;
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

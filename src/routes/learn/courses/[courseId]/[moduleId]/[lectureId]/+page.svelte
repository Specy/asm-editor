<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaChevronLeft from 'svelte-icons/fa/FaChevronLeft.svelte'
    import FaChevronRight from 'svelte-icons/fa/FaChevronRight.svelte'
    import { page } from '$app/state'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { SupportedLanguage } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'

    interface Props {
        data: PageData & { content: string }
    }

    let { data }: Props = $props()

    let agentOpen = $state(false)
    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    let emulatorInstance: Emulator | null = $state(null)
    let editorSection: HTMLElement | null = $state(null)

    $effect(() => {
        if (editorLanguage && editorSection) {
            editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    })

    let currentLectureName = $derived(page.params.lectureId)

    let currentModuleName = $derived(page.params.moduleId)

    let lectures = $derived(
        data.course.modules.flatMap((m) =>
            m.lectures.map((l) => ({
                ...l,
                module: m
            }))
        )
    )

    let nextLecture = $derived.by(() => {
        const currentLectureIndex = lectures.findIndex(
            (l) => l.slug === currentLectureName && l.module.slug === currentModuleName
        )
        if (currentLectureIndex === -1) return null
        const next = lectures[currentLectureIndex + 1]
        if (!next) return null
        return lectures[currentLectureIndex + 1]
    })

    let previousLecture = $derived.by(() => {
        const currentLectureIndex = lectures.findIndex(
            (l) => l.slug === currentLectureName && l.module.slug === currentModuleName
        )
        if (currentLectureIndex === -1) return null
        const prev = lectures[currentLectureIndex - 1]
        if (!prev) return null
        return lectures[currentLectureIndex - 1]
    })
</script>

<svelte:head>
    <title>{data.lecture.name} - {data.course.name}</title>
    <meta name="description" content={data.lecture.description} />
    <meta property="og:title" content={data.lecture.name} />
    <meta property="og:description" content={data.lecture.description} />
    <meta property="og:type" content="article" />
    <meta property="og:image" content={data.course.image} />
</svelte:head>

<Page cropped="110ch" style="padding: 1rem;" contentStyle="gap: 1rem;">
    <Card padding="1.5rem" gap="1rem" background="secondary">
        <Header noMargin style="width: min(100%, 46rem); margin: 0 auto">
            {data.lecture.name}
        </Header>
        <p class="description">
            {data.lecture.description}
        </p>
    </Card>
    <MarkdownRenderer style="font-size: 1.1rem;" source={data.content} spacing="1.2rem" />
    {#if editorLanguage}
        <div class="editor-section" bind:this={editorSection}>
            {#key editorLanguage}
                <EmulatorLoader
                    language={editorLanguage as AvailableLanguages}
                    code={editorCode}
                    bind:emulator={emulatorInstance}
                    settings={{
                        globalPageElementsPerRow: 4,
                        globalPageSize: 4 * 8
                    }}
                >
                    {#snippet children(emulator)}
                        <InteractiveInstructionEditor
                            bind:code={editorCode}
                            language={editorLanguage as AvailableLanguages}
                            {emulator}
                            embedded={true}
                            showConsole={true}
                            showRegisters={true}
                            showMemory={true}
                            showFlags={true}
                            forceMemoryRight={true}
                        />
                    {/snippet}
                </EmulatorLoader>
            {/key}
        </div>
    {/if}

    <Row justify="between" wrap gap="1rem" style="margin-top: 3rem">
        {#if previousLecture}
            <ButtonLink
                style="gap: 1rem"
                cssVar="secondary"
                onClick={() => {
                    document.body.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                href={`/learn/courses/${data.course.slug}/${previousLecture?.module.slug}/${previousLecture?.slug}`}
            >
                <Icon>
                    <FaChevronLeft />
                </Icon>
                Previous Lecture
            </ButtonLink>
        {:else}
            <div></div>
        {/if}

        {#if nextLecture}
            <ButtonLink
                style="gap: 1rem"
                disabled={!nextLecture}
                onClick={() => {
                    document.body.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                href={`/learn/courses/${data.course.slug}/${nextLecture?.module.slug}/${nextLecture?.slug}`}
            >
                Next Lecture
                <Icon>
                    <FaChevronRight />
                </Icon>
            </ButtonLink>
        {:else}
            <div></div>
        {/if}
    </Row>
</Page>

<FloatingAgentSidebar
    bind:open={agentOpen}
    openSize="28rem"
    verticalOffset="0px"
    bind:editorLanguage
    bind:editorCode
    {emulatorInstance}
    canUpdateLanguage={true}
    additionalInstructions={`
        The user is reading a lecture titled "${data.lecture.name}" from the course "${data.course.name}".
        Lecture description: ${data.lecture.description}
        Course description: ${data.course.description}
        Help the user understand the concepts in this lecture. You can write assembly code examples relevant to what they are learning.
        When writing code, use the set_code tool to show it in the interactive editor below the lecture content.
        Provide clear and concise explanations tailored to the lecture topic.

        Here is the lecture content for reference:
        <lecture_content>
        ${data.content}
        </lecture_content>
    `}
/>
<button class="agent-toggle" class:agent-open={agentOpen} onclick={() => (agentOpen = !agentOpen)}>
    {#if agentOpen}
        <div style={'width: 1.2em; height: 1.2em;'}>
            <FaTimes />
        </div>
        Close
    {:else}
        <SparklesIcon style={'font-size: 1rem;'} /> Ask AI
    {/if}
</button>

<style>
    .description {
        white-space: pre-line;
        line-height: 1.5;
        font-family: 'Noto Serif', Rubik, sans-serif;
        font-weight: 500;
        width: min(100%, 70ch);
        font-size: 1.1rem;
        margin: 0 auto;
    }

    .editor-section {
        width: 100%;
        min-height: 30rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 0.6rem;
        padding: 0.4rem;
        border: solid 0.1rem var(--tertiary);
    }

    .agent-toggle {
        position: fixed;
        top: 3.8rem;
        right: 0.5rem;
        padding: 0.65rem 1rem;
        z-index: 101;
        font-family: Rubik, sans-serif;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        font-weight: bold;
        border: none;
        gap: 0.5rem;
        min-width: 7rem;
        background: var(--accent);
        color: var(--accent-text);
        cursor: pointer;
        display: flex;
        font-size: 1rem;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
    }

    .agent-open {
        top: 0.3rem;
        right: min(calc(min(28rem, 100vw) + 0.3rem), calc(50vw - 3.5rem));
    }

    .agent-toggle:hover {
        background-color: color-mix(in srgb, var(--accent) 80%, var(--background));
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    @media (max-width: 1100px) {
        .agent-open {
            top: 0.5rem;
            right: 3.5rem;
            padding: 0.8rem 1rem;
        }
    }
</style>

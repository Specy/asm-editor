<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaChevronLeft from '~icons/fa-solid/chevron-left'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import { page } from '$app/state'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { SupportedLanguage } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import { GENERAL_COURSE_SLUG, type TopicSibling } from '$lib/content/getters'
    import { resolve } from '$app/paths'

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

    //the same Topic is taught once in the General course and once in each Language course, so a
    //reader of the overview is pointed down into the languages and a reader of one language is
    //pointed back at the overview and across at the others. An Example has no overview, only the
    //same program elsewhere. All of it comes from the `topic` key of the lectures' `meta.json`
    let inGeneralCourse = $derived(data.course.slug === GENERAL_COURSE_SLUG)
    let isExample = $derived(currentModuleName === 'examples')
    let topicLinks = $derived(data.topicLinks)

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

{#snippet topicList(siblings: TopicSibling[])}
    {#each siblings as sibling, index (sibling.courseSlug + sibling.lectureSlug)}
        {index === 0 ? '' : ', '}<a
            href={resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
                courseId: sibling.courseSlug,
                moduleId: sibling.moduleSlug,
                lectureId: sibling.lectureSlug
            })}>{sibling.courseName}</a
        >
    {/each}
{/snippet}

<Page cropped="110ch" style="padding: 1rem;" contentStyle="gap: 1rem;">
    <Card padding="1.5rem 0" gap="1rem">
        <Header noMargin style="width: min(100%, 46rem); margin: 0 auto">
            {data.lecture.name}
        </Header>
    </Card>
    {#if topicLinks && !inGeneralCourse}
        <p class="topic-links">
            {#if isExample}
                The same program in {@render topicList(topicLinks.siblings)}.
            {:else}
                {#if topicLinks.overview}
                    The overview of this topic is in {@render topicList([topicLinks.overview])}.
                {/if}
                {#if topicLinks.siblings.length > 0}
                    The same topic in {@render topicList(topicLinks.siblings)}.
                {/if}
            {/if}
        </p>
    {/if}
    <MarkdownRenderer style="font-size: 1.1rem;" source={data.content} spacing="1.2rem" />
    {#if topicLinks && inGeneralCourse && topicLinks.siblings.length > 0}
        <p class="topic-links">
            Go deeper: this topic in {@render topicList(topicLinks.siblings)}.
        </p>
    {/if}
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
        The user is reading the lecture "${data.lecture.name}" from the course "${data.course.name}".
        Lecture description: ${data.lecture.description}
        Course description: ${data.course.description}

        This context is primarily the *Teach with a runnable example (course lecture)* workflow:
        - Ground every explanation in the lecture content below. Stay on-topic for this specific lecture; don't drift into unrelated material.
        - Match the lecture's assembly language when writing examples. You may switch the editor language via set_code if the lecture calls for it.
        - The editor below the lecture exists for demonstrations, so you are free to use set_code to load examples there.

        Here is the lecture content for reference:
        <lecture_content>
        ${data.content}
        </lecture_content>
    `}
    workflows={[
        {
            name: 'Teach with a runnable example (course lecture)',
            intentTriggers: [
                'explain the lecture',
                'lecture topic',
                'demonstrate this concept',
                'show me an example',
                'walk me through it',
                'practice example',
                'how does this concept work',
                'what does this instruction do here',
                'run an example from the lesson'
            ],
            requiredTools: [
                'get_code',
                'compile',
                'update_breakpoints',
                'run_to_completion',
                'step',
                'get_emulator_state',
                'set_code'
            ],
            verification:
                'Tie each explanation to lecture content and compile results; do not execute examples unless the user explicitly asks for execution.',
            description: `
When the user asks a question about the lecture topic or for a demonstration of the concept being taught.
1. Put a small focused example in the editor via set_code so the user can see it next to the lecture content. A markdown code block in chat is not enough — the editor lets them run and modify it.
2. Compile the example and report whether it is valid.
3. Do not call run_to_completion or step unless the user explicitly asks to execute/debug the example.
4. If the user asks a follow-up, modify the example in-place via set_code and compile again.
`
        }
    ]}
/>
<button class="agent-toggle" class:agent-open={agentOpen} onclick={() => (agentOpen = !agentOpen)}>
    {#if agentOpen}
        <div style="width: 1.2em; height: 1.2em;">
            <FaTimes />
        </div>
        Close
    {:else}
        <SparklesIcon style="font-size: 1rem;" /> Ask AI
    {/if}
</button>

<style>
    .topic-links {
        font-family: 'Noto Serif', Rubik, sans-serif;
        font-weight: 500;
        margin: 0 auto;
        opacity: 0.75;
        background: var(--secondary);
        padding: 0.5rem;
        border-radius: 0.4rem;
    }

    .topic-links a {
        color: var(--accent);
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

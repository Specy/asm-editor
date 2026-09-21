<script lang="ts">
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import FaBars from '~icons/fa-solid/bars'
    import FaDonate from '~icons/fa-solid/heart'
    import FaStar from '~icons/fa-solid/star'

    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Sidebar from '$cmp/shared/layout/Sidebar.svelte'
    import type { PageData } from './$types'
    import LecturesMenu from '$cmp/content/LecturesMenu.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import { page } from '$app/state'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { resolve } from '$app/paths'
    import { courseTheme } from '$lib/languages/languageColors'
    import ThemeScope from '$cmp/shared/providers/ThemeScope.svelte'
    import { lectureAgent } from './lectureAgent.svelte'

    interface Props {
        children?: import('svelte').Snippet
        data: PageData
    }

    let { children, data }: Props = $props()

    let currentLectureName = $derived(`${page.params.moduleId}-${page.params.lectureId}`)

    let menuOpen = $state(false)
</script>

<!-- A Language course shows its language's colours, the way `/documentation/<language>` does.
     One layout serves every course, so this follows the slug rather than the mount. -->
<ThemeScope theme={courseTheme(data.course.slug)}>
    <Navbar style="border-bottom-left-radius: 0;">
        <Row gap="0.6rem" align="center">
            <a class="icon" href={resolve('/', {})} title="Go to the home">
                <img src="/favicon.png" alt="logo" />
            </a>
            <a class="icon" href={resolve('/projects', {})} title="Go to your projects">
                Projects
            </a>
            <a class="icon" href={resolve('/documentation', {})} title="Go to the docs"> Docs </a>
            <a class="icon" href={resolve('/learn/courses', {})} title="Learn assembly"> Learn </a>
            <a class="icon desktop-only" href={resolve('/embed', {})} title="Embed the website">
                Embed
            </a>
        </Row>
        <Row gap="0.5rem" align="center" flex1>
            <div class="star-on-github desktop-only">
                <ButtonLink
                    style="gap: 0.5rem; padding: 0.5rem 1rem"
                    cssVar="secondary"
                    href="https://github.com/Specy/asm-editor"
                    target="_blank"
                    title="Star the project on github"
                >
                    <Icon>
                        <FaStar />
                    </Icon>
                    Star on github
                </ButtonLink>
            </div>
            {#if lectureAgent.available}
                <button
                    class="icon ai"
                    onclick={() => (lectureAgent.open = !lectureAgent.open)}
                    title={lectureAgent.open ? 'Close the AI chat' : 'Ask AI about this lecture'}
                >
                    <div class="hidden-very-small">
                        {#if lectureAgent.open}
                            <!-- an unplugin icon fills its parent, so it needs the sized box
                                 `Icon` gives it; `SparklesIcon` carries its own 1em size. -->
                            <Icon size={1}>
                                <FaTimes />
                            </Icon>
                        {:else}
                            <SparklesIcon />
                        {/if}
                    </div>
                    {lectureAgent.open ? 'Close' : 'Ask AI'}
                </button>
            {:else}
                <a class="icon ai" href={resolve('/chat', {})} title="AI Chat">
                    <div class="hidden-very-small">
                        <SparklesIcon />
                    </div>
                    AI Chat
                </a>
            {/if}
            <div class="mobile-only">
                <Icon onClick={() => (menuOpen = !menuOpen)}>
                    {#if menuOpen}
                        <FaTimes />
                    {:else}
                        <FaBars />
                    {/if}
                </Icon>
            </div>
        </Row>
    </Navbar>

    <Sidebar bind:menuOpen menuStyle="gap: 0;">
        <Column padding="1rem" gap="1rem" style="padding-top: 0;">
            <a
                onclick={() => (menuOpen = false)}
                href={resolve('/learn/courses/[courseId]', { courseId: data.course.slug })}
            >
                <!-- Sidebar chrome, not the document's subject: each page under this layout
                     titles itself with its own <Header>. Matches the module headings below. -->
                <Header type="h2" noMargin>
                    {data.course.name}
                </Header>
            </a>
        </Column>
        <Column style="overflow-y: auto">
            {#each data.course.modules as module (module.slug)}
                <TogglableSection
                    open={true}
                    sectionStyle="margin-left: 0; padding-left: 0.4rem;"
                    style="padding: 0.5rem;"
                >
                    {#snippet title()}
                        <h2 style="font-size: 1rem; font-weight: normal; margin-left: -0.1rem">
                            {module.name}
                        </h2>
                    {/snippet}
                    <Column>
                        <LecturesMenu
                            currentLecture={module.lectures.find(
                                (l) => `${module.slug}-${l.slug}` === currentLectureName
                            )}
                            lectures={module.lectures}
                            lectureStyle="padding-left: 1rem"
                            onClick={() => (menuOpen = false)}
                            hrefBase={`/learn/courses/${data.course.slug}/${module.slug}`}
                        />
                    </Column>
                </TogglableSection>
            {/each}
        </Column>
        <Column style="margin-top: auto;" padding="0.5rem" gap="0.5rem">
            <ButtonLink
                style="width: 100%; gap: 0.5rem"
                cssVar="tertiary"
                href="/donate"
                title="Donate to the project"
            >
                <Icon>
                    <FaDonate />
                </Icon>
                Donate
            </ButtonLink>
            <ButtonLink
                style="width: 100%;"
                href={ProjectStore.projects.length > 0 ? '/projects' : '/projects/create'}
                title="Open the editor"
            >
                {#if ProjectStore.projects.length > 0}
                    Go to your projects
                {:else}
                    Create your first project
                {/if}
            </ButtonLink>
        </Column>

        {#snippet content()}
            <Column flex1 style="padding-top: 3.2rem;">
                {@render children?.()}
            </Column>
        {/snippet}
    </Sidebar>
</ThemeScope>

<style lang="scss">
    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        img {
            height: 100%;
        }

        &:hover {
            color: var(--accent);
        }
    }

    .ai {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--accent);
        padding: 0.3rem 0.8rem;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        background-color: color-mix(in srgb, var(--accent) 10%, transparent);
        margin-left: auto;
    }

    /* A lecture's Ask AI toggle takes the AI Chat link's place and has to read as the same control,
       so the <button> sheds the defaults the <a> never carried. */
    button.ai {
        font: inherit;
        border: none;
        cursor: pointer;
    }

    .mobile-only {
        display: none;
    }

    .desktop-only {
        display: flex;
    }

    @media (max-width: 600px) {
        .ai {
            margin-left: unset;
            margin-right: auto;
            font-size: 0.9rem;
        }
        .mobile-only {
            display: flex;
        }
        .desktop-only {
            display: none;
        }
        .menu-open {
            transform: translateX(0);
        }
        .icon {
            font-size: 0.9rem;
        }
    }

    .instruction-search {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        padding: 0.6rem;
        border-radius: 0.4rem;
    }

    .hidden-very-small {
        display: flex;
    }
    @media (max-width: 370px) {
        .hidden-very-small {
            display: none;
        }
    }
</style>

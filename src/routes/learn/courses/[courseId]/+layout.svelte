<script lang="ts">
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import FaBars from 'svelte-icons/fa/FaBars.svelte'
    import FaDonate from 'svelte-icons/fa/FaHeart.svelte'
    import FaStar from 'svelte-icons/fa/FaStar.svelte'

    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Sidebar from '$cmp/shared/layout/Sidebar.svelte'
    import type { PageData } from './$types'
    import LecturesMenu from '$cmp/content/LecturesMenu.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import { page } from '$app/state'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { ProjectStore } from '$stores/projectsStore.svelte'

    interface Props {
        children?: import('svelte').Snippet
        data: PageData
    }

    let { children, data }: Props = $props()

    let currentLectureName = $derived(`${page.params.moduleId}-${page.params.lectureId}`)

    let menuOpen = $state(false)
</script>

<Navbar style="border-bottom-left-radius: 0;">
    <Row gap="1rem" align="center">
        <a class="icon" href="/" title="Go to the home">
            <img src="/favicon.png" alt="logo" />
        </a>
        <a class="icon" href="/projects" title="Go to your projects"> Projects </a>
        <a class="icon" href="/documentation/" title="Go to the docs"> Docs </a>
        <a class="icon" href="/learn/courses" title="Learn assembly"> Learn </a>
        <a class="icon desktop-only" href="/embed" title="Embed the website"> Embed </a>
    </Row>
    <Row gap="0.5rem" align="center" flex1>
        <a class="icon ai" href="/chat" title="AI Chat"> AI Chat </a>
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

<Sidebar bind:menuOpen>
    <Column padding="1rem" gap="1rem" style="padding-top: 0;">
        <a onclick={() => (menuOpen = false)} href={`/learn/courses/${data.course.slug}`}>
            <Header noMargin>
                {data.course.name}
            </Header>
        </a>
    </Column>
    <Column style="overflow-y: auto" gap="1rem">
        {#each data.course.modules as module}
            <TogglableSection
                open={true}
                sectionStyle="margin-left: 0; padding-left: 0.4rem;"
                style="padding: 0 0.5rem;"
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

<style lang="scss">
    .side-menu {
        background-color: var(--secondary);
        color: var(--secondary-text);
        width: 15rem;
        gap: 1rem;
        top: 3.2rem;
        padding-top: 1rem;
        height: calc(100vh - 3.2rem);
        overflow-y: auto;
        position: sticky;
    }

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
        color: var(--accent);
        padding: 0.3rem 0.8rem;
        border-radius: 0.4rem;
        background-color: color-mix(in srgb, var(--accent) 10%, transparent);
        margin-left: auto;
    }



    .mobile-only {
        display: none;
    }

    .desktop-only {
        display: flex;
    }

    @media (max-width: 600px) {
        .side-menu {
            position: fixed;
            width: calc(100vw - 4rem);
            left: 0;
            z-index: 5;
            transition: transform 0.3s;
            background-color: rgba(var(--RGB-secondary), 0.9);
            transform: translateX(calc((100vw - 4rem) * -1));
        }
        .ai {
          margin-left: unset;
          margin-right: auto;
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
    }

    .instruction-search {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        padding: 0.6rem;
        border-radius: 0.4rem;
    }

    .side-menu-underlay {
        position: fixed;
        top: 3.2rem;
        left: 0;
        width: 100vw;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        opacity: 0;
        pointer-events: none;
        cursor: pointer;
        z-index: 3;
        transition: opacity 0.3s;
        backdrop-filter: blur(0.2rem);
    }

    .side-menu-underlay-open {
        opacity: 1;
        pointer-events: all;
    }
</style>

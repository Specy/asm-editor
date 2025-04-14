<script lang="ts">
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import MainPageLinkPreview from '$cmp/specific/landing/HeroLink.svelte'
    import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
    import FaBook from 'svelte-icons/fa/FaBook.svelte'
    import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
    import FaTools from 'svelte-icons/fa/FaTools.svelte'
    import FaCode from 'svelte-icons/fa/FaCode.svelte'
    import MainPageSection from '$cmp/specific/landing/HeroSection.svelte'
    import AnimatedRgbLine from '$cmp/shared/misc/AnimatedRgbLine.svelte'
    import GoLinkExternal from 'svelte-icons/go/GoLinkExternal.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { onMount } from 'svelte'
    import FaDownload from 'svelte-icons/fa/FaDownload.svelte'
    import FaDonate from 'svelte-icons/fa/FaDonate.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { ProjectStore } from '$stores/projectsStore.svelte'

    const textShadowPrimary = ThemeStore.getColor('primary').isDark()
    const textShadowSecondary = ThemeStore.getColor('secondary').isDark()
    let installEvent: any = $state(null)
    onMount(() => {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault()
            console.log('beforeinstallprompt', e)
            installEvent = e
        })
    })
</script>

<svelte:head>
    <title>Welcome to Asm-Editor</title>
</svelte:head>

<Page>
    <div class="main">
        <div class="content row">
            <img src="/images/ASM-editor.webp" alt="ASM editor" class="preview-image" />
            <div class="presentation">
                <div class="welcome-title" class:textShadow={textShadowPrimary}>
                    The all in one web IDE for Assembly <span style="font-size: 1.5rem;" >M68K, MIPS, X86</span>
                </div>
                <Row gap="0.6rem">
                    <ButtonLink
                        href={ProjectStore.projects.length > 0 ? '/projects' : '/projects/create'}
                        style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
                        title="Open the editor"
                    >
                        {#if ProjectStore.projects.length > 0}
                            Go to your projects
                        {:else}
                            Create your first project
                        {/if}
                    </ButtonLink>
                    <ButtonLink
                        style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
                        cssVar="tertiary"
                        href="https://github.com/Specy/asm-editor"
                        title="Open the project on github"
                    >
                        <Icon>
                            <FaGithub />
                        </Icon>
                    </ButtonLink>
                    <ButtonLink
                        style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
                        cssVar="tertiary"
                        href="/donate"
                        title="Donate to the project"
                    >
                        <Icon>
                            <FaDonate />
                        </Icon>
                    </ButtonLink>
                </Row>
                {#if installEvent}
                    <Button
                        style="margin-top: 1rem; gap: 0.5rem;"
                        cssVar="secondary"
                        onClick={async () => {
                            try {
                                await installEvent.prompt()
                            } catch (e) {
                                console.error(e)
                            }
                            installEvent = null
                        }}
                    >
                        <Icon>
                            <FaDownload />
                        </Icon>
                        Install WebApp
                    </Button>
                {/if}
            </div>
        </div>
        <AnimatedRgbLine height="0.5rem" style="border-radius: 0;" />
        <div class="links-row-wrapper">
            <div class="links-row">
                <MainPageLinkPreview href="/documentation" title="Documentation page">
                    {#snippet icon()}
                        <div>
                            <FaBook />
                        </div>
                    {/snippet}
                    {#snippet description()}
                        <div>Documentation</div>
                    {/snippet}
                </MainPageLinkPreview>
                <MainPageLinkPreview href="#codeCompletion" title="Code completion section">
                    {#snippet icon()}
                        <div>
                            <FaSearch />
                        </div>
                    {/snippet}
                    {#snippet description()}
                        <div>Code completion</div>
                    {/snippet}
                </MainPageLinkPreview>
                <MainPageLinkPreview href="#tools" title="Tools section">
                    {#snippet icon()}
                        <div>
                            <FaTools />
                        </div>
                    {/snippet}
                    {#snippet description()}
                        <div>Tools</div>
                    {/snippet}
                </MainPageLinkPreview>
                <MainPageLinkPreview href="/embed" title="Embed the app in your website">
                    {#snippet icon()}
                        <div>
                            <FaCode />
                        </div>
                    {/snippet}
                    {#snippet description()}
                        <div>Embed</div>
                    {/snippet}
                </MainPageLinkPreview>
            </div>
        </div>
    </div>
    <div class="column sections-wrapper">
        <MainPageSection id="documentation" imageUrl="/images/ASM-Documentation.webp">
            {#snippet title()}
                <div>Documentation</div>
            {/snippet}
            <div class="description" class:textShadow={textShadowPrimary}>
                The editor comes with built-in documentation for the M68K and MIPS instruction set
                including the valid addressing modes, description and examples for each instruction,
                directive and syscall.
                <a href="/documentation" title="View documentation" class="external-link">
                    Visit the documentation
                    <div style="width: 1rem; height: 1rem; margin-top: 0.2rem; margin-left: 0.3rem">
                        <GoLinkExternal />
                    </div>
                </a>
            </div>
        </MainPageSection>
        <MainPageSection id="codeCompletion" imageUrl="/images/ASM-CodeCompletion.webp" reverse>
            {#snippet title()}
                <div>Code completion</div>
            {/snippet}
            <div class="description" class:textShadow={textShadowSecondary}>
                Write and learn faster with the code completion tools, suggesting you with the valid
                addressing modes and shortcuts for labels and other keywords. Real time semantic
                errors that warn you before you compile the code.
            </div>
        </MainPageSection>
        <MainPageSection id="tools" imageUrl="/images/ASM-Tools.webp">
            {#snippet title()}
                <div>Tools & Customisation</div>
            {/snippet}
            <div class="description" class:textShadow={textShadowPrimary}>
                Feature rich tools to help you debug your code. Includes breakpoints, stepping,
                undo, stack tracer, register/memory diffing, decimal/hexadecimal conversions,
                stdout/stdin/errors, customisable shortcuts and settings, formatter and more. You
                can also customise the theme of the editor to your liking.
            </div>
        </MainPageSection>
        <MainPageSection id="embed" reverse>
            {#snippet title()}
                <div>Embed</div>
            {/snippet}
            <div class="description" class:textShadow={textShadowPrimary}>
                Embed the editor in your website to show and teach how assembly works using the <a
                    href="/embed"
                    title="Embedder tool"
                    class="external-link"
                >
                    Embedder tool
                    <div style="width: 1rem; height: 1rem; margin-top: 0.2rem; margin-left: 0.3rem">
                        <GoLinkExternal />
                    </div>
                </a>
            </div>
        </MainPageSection>
    </div>
</Page>

<div class="pre-footer"></div>

<style lang="scss">
    .pre-footer {
        height: 5rem;
        min-height: 5rem;
        flex: 1;
        background: linear-gradient(0deg, var(--primary) 10%, var(--secondary));
    }

    .welcome-title {
        font-size: 3rem;
        padding: 1rem;
        max-width: 35rem;
        text-align: center;
        margin-bottom: 2rem;
        color: var(--primary-text);
    }

    .textShadow {
        text-shadow: 2px 2px 12px rgb(36 36 36);
    }

    .sections-wrapper {
        padding: 4rem 0;
        padding-bottom: 0;
        font-family: FiraCode, monospace;
        background-color: var(--primary);
        color: var(--primary-text);
    }

    .presentation {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: rgba(var(--RGB-primary), 0.9);
        backdrop-filter: blur(5px);
        z-index: 2;
    }

    :global(body) {
        scroll-behavior: smooth;
    }

    .external-link {
        color: var(--accent);
        display: inline-flex;

        &:hover {
            text-decoration: underline;
        }
    }

    .links-row-wrapper {
        background-color: var(--secondary);
        color: var(--secondary-text);
        display: flex;
        justify-content: center;
    }

    .links-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        @media screen and (max-width: 650px) {
            display: flex;
            flex-wrap: wrap;
        }
    }

    .main {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        border-radius: 0.6rem;

        .content {
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
            border-radius: 0.45rem;
        }
    }

    .preview-image {
        display: flex;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        position: absolute;
        background-repeat: no-repeat;
        background-position: center;
        background-size: cover;
    }

    @media screen and (max-width: 650px) {
        .main {
            .content {
                width: 100%;
            }
        }
        .welcome-title {
            font-size: 2.3rem;
        }
    }

    @media screen and (max-width: 850px) {
        .pre-footer {
            background: transparent;
        }
    }

    @keyframes gradient {
        0% {
            background-position: 0 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0 50%;
        }
    }
</style>

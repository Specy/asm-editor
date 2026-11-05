<script lang="ts">
    import { resolve } from '$app/paths'
    import type { ResolvedPathname } from '$app/types'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ContentLinkCard from '#cmp/content/ContentLinkCard.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { DOCUMENTATION_ABOUT, DOCUMENTATION_INTRO } from '#lib/documentation/site.ts'
    import InlineMarkdown from '#cmp/documentation/entries/InlineMarkdown.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import FaCopy from '~icons/fa-solid/copy'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { copyText } from '#lib/utils.ts'
    import { AGENT_MESSAGE } from '#lib/twins/agentMessage.ts'

    // What each language is and what its reference covers (`DOCUMENTATION_ABOUT`, which the
    // Markdown twins read too), with the Course that teaches it.
    const langs = [
        {
            lang: 'M68K',
            href: resolve('/documentation/m68k'),
            about: DOCUMENTATION_ABOUT.m68k,
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'm68k' })
        },
        {
            lang: 'MIPS',
            href: resolve('/documentation/mips'),
            about: DOCUMENTATION_ABOUT.mips,
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'mips' })
        },
        {
            lang: 'RISC-V',
            href: resolve('/documentation/risc-v'),
            about: DOCUMENTATION_ABOUT['risc-v'],
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'risc-v' })
        },
        {
            lang: 'X86',
            href: resolve('/documentation/x86'),
            about: DOCUMENTATION_ABOUT.x86,
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'x86' })
        },
        {
            lang: 'Z80',
            href: resolve('/documentation/z80'),
            about: DOCUMENTATION_ABOUT.z80,
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'z80' })
        }
    ] satisfies {
        lang: AvailableLanguages
        href: ResolvedPathname
        about: string
        courseHref: ResolvedPathname
    }[]
</script>

<DefaultNavbar />
<PageMeta
    title="Documentation - M68K, MIPS, RISC-V, x86-64 and Z80 assembly reference | Asm Editor"
    description="Instruction references, registers, directives, syscalls and runtime library docs for M68K, MIPS, RISC-V, x86-64 and Z80 assembly in the Asm Editor."
/>

<Page cropped="70rem" hasNavbar contentStyle="padding: 1rem">
    <Header>Instruction Sets</Header>
    <p class="intro"><InlineMarkdown source={DOCUMENTATION_INTRO.trim()} /></p>
    <div class="langs">
        {#each langs as { lang, href, about, courseHref } (lang)}
            {@const label = languageLabel(lang)}
            <ContentLinkCard
                headingId={`documentation-${lang}`}
                title={label}
                description={about}
                accent={languageAccent(lang)}
                primary={{ label: `${label} docs`, href }}
                secondary={{ label: `Learn ${label}`, href: courseHref }}
            />
        {/each}
    </div>
    <section class="agents" aria-labelledby="agents-title">
        <div class="agents-heading">
            <div>
                <h2 id="agents-title">Documentation for agents</h2>
                <p>
                    Send this message to an AI assistant that can open web pages, so it answers from
                    this Documentation and the Courses. It points the assistant to a markdown
                    version of every page.
                </p>
            </div>
            <Button
                cssVar="secondary"
                hasIcon
                style="padding: 0.35rem 0.65rem; font-size: 0.78rem; gap: 0.4rem; flex-shrink: 0;"
                onClick={() => void copyText(AGENT_MESSAGE, 'Message')}
            >
                <Icon size={0.9}><FaCopy /></Icon>
                Copy
            </Button>
        </div>
        <pre class="agent-message">{AGENT_MESSAGE}</pre>
    </section>
</Page>

<style lang="scss">
    .intro {
        margin: 0;
        color: var(--background-text-muted);
    }
    .agents {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        margin-top: 2rem;
        padding: 1.2rem;
        border: 1px solid var(--tertiary);
        border-radius: 0.75rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .agents-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
    }
    .agents h2 {
        margin: 0 0 0.3rem;
        font-size: 1.3rem;
    }
    .agents p {
        margin: 0;
        max-width: 60ch;
        color: var(--background-text-muted);
    }
    .agent-message {
        margin: 0;
        padding: 0.8rem 1rem;
        border-radius: 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
        gap: 1rem;
    }
</style>

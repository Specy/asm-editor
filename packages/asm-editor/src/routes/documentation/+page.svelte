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
    import AgentDocs from '#cmp/documentation/site/AgentDocs.svelte'

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
    title="Documentation: M68K, MIPS, RISC-V, x86-64 and Z80 assembly reference - ASM Editor"
    description="Instruction references, registers, directives, syscalls and runtime library docs for M68K, MIPS, RISC-V, x86-64 and Z80 assembly in the ASM Editor."
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
    <AgentDocs style="margin-top: 4rem;" />
</Page>

<style lang="scss">
    .intro {
        margin: 0;
    }
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
        gap: 1rem;
    }
</style>

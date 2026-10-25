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

    // What each language is and what its reference covers, in a sentence or two, with the Course
    // that teaches it: the hub is the one page that tells the five apart.
    const langs = [
        {
            lang: 'M68K',
            href: resolve('/documentation/m68k'),
            about: 'The Motorola 68000, with eight data registers and eight address registers. Covers instructions, addressing modes, condition codes, directives and trap tasks for input, output and graphics.',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'm68k' })
        },
        {
            lang: 'MIPS',
            href: resolve('/documentation/mips'),
            about: 'MIPS assembly for the MARS simulator. Covers instructions and pseudo-instructions, directives, registers, syscalls, screen and keyboard access, and using C and C++.',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'mips' })
        },
        {
            lang: 'RISC-V',
            href: resolve('/documentation/risc-v'),
            about: 'RV32 and RV64 assembly for the RARS simulator. Covers instructions, directives, registers, syscalls, screen and keyboard access, and using C and C++.',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'risc-v' })
        },
        {
            lang: 'X86',
            href: resolve('/documentation/x86'),
            about: 'x86-64 assembly in NASM syntax, running as a Linux program. Covers instructions, vector extensions, directives, registers and flags, Linux syscalls, and using C and C++.',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'x86' })
        },
        {
            lang: 'Z80',
            href: resolve('/documentation/z80'),
            about: 'The Zilog Z80, an 8 bit CPU with 64 KB of memory. Covers instructions, flags, cycle counts, directives, registers and I/O ports for the terminal, screen, keyboard, mouse and sound.',
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
    <p class="intro">
        Reference documentation for the assembly languages supported by Asm Editor, including
        instructions, operand forms, directives, registers and input/output. You can also open this
        reference in the editor's Documentation panel. If you are new to assembly, start with the
        <a href={resolve('/learn/courses/[courseId]', { courseId: 'assembly-basics' })}
            >Assembly basics</a
        > course.
    </p>
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
</Page>

<style lang="scss">
    .intro {
        margin: 0;
        color: var(--background-text-muted);
    }
    a {
        color: var(--accent);
        text-decoration: underline;
    }
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
        gap: 1rem;
    }
</style>

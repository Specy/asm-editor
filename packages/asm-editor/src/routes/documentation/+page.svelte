<script lang="ts">
    import { resolve } from '$app/paths'
    import type { ResolvedPathname } from '$app/types'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
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
            about: 'The Motorola 68000: eight data and eight address registers, big endian, with the operand size written on the mnemonic. The reference covers its instructions, addressing modes and condition codes, the trap #15 tasks for input, output and graphics, and the directives.',
            course: 'M68K assembly',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'm68k' })
        },
        {
            lang: 'MIPS',
            href: resolve('/documentation/mips'),
            about: 'MIPS as the MARS simulator runs it: 32 registers, three operand instructions and no flags register. The reference covers the instructions and pseudo-instructions, directives, syscalls, registers, the memory-mapped screen and keyboard, and writing C and C++ for MIPS.',
            course: 'MIPS assembly',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'mips' })
        },
        {
            lang: 'RISC-V',
            href: resolve('/documentation/risc-v'),
            about: 'RISC-V as the RARS simulator runs it, as RV32 or RV64: 32 registers and branches that compare two registers themselves. The reference covers the instructions, RV64 ones included, directives, ecall syscalls, registers, the memory-mapped screen and keyboard, and writing C and C++ for RISC-V.',
            course: 'RISC-V assembly',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'risc-v' })
        },
        {
            lang: 'X86',
            href: resolve('/documentation/x86'),
            about: 'x86-64 in NASM syntax, run as a Linux program by the blink emulator. The reference covers the integer instructions with the operand forms NASM accepts, the AVX, AVX2, FMA and BMI vector instructions, registers and flags, directives, the Linux syscalls the emulator implements, and writing C and C++ for x86-64.',
            course: 'x86-64 assembly',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'x86' })
        },
        {
            lang: 'Z80',
            href: resolve('/documentation/z80'),
            about: 'The Zilog Z80: an 8 bit CPU with 64 KB of memory and register pairs that double as 16 bit registers. The reference covers the instructions with their flags, sizes and cycle counts, the directives, the registers, and the I/O ports that take the place of system calls: the terminal, the screen, the keyboard, the mouse and sound.',
            course: 'Z80 assembly',
            courseHref: resolve('/learn/courses/[courseId]', { courseId: 'z80' })
        }
    ] satisfies {
        lang: AvailableLanguages
        href: ResolvedPathname
        about: string
        course: string
        courseHref: ResolvedPathname
    }[]
</script>

<DefaultNavbar />
<PageMeta
    title="Documentation - M68K, MIPS, RISC-V, x86-64 and Z80 assembly reference | Asm Editor"
    description="Instruction references, registers, directives, syscalls and runtime library docs for M68K, MIPS, RISC-V, x86-64 and Z80 assembly in the Asm Editor."
/>

<Page cropped hasNavbar contentStyle="padding: 1rem">
    <Header>Instruction Sets</Header>
    <p class="intro">
        The reference for each of the five assembly languages the editor runs: the instructions with
        the operand forms their assembler accepts, the directives, the registers and the way a
        program reaches the outside world. The same reference opens in the editor's Documentation
        panel. New to assembly? Start with the
        <a href={resolve('/learn/courses/[courseId]', { courseId: 'assembly-basics' })}
            >Assembly basics</a
        > course.
    </p>
    <div class="langs">
        {#each langs as { lang, href, about, course, courseHref } (lang)}
            <section class="lang">
                <NavigationLinkButton {href} color={languageAccent(lang)}>
                    <h2>
                        {languageLabel(lang)}
                    </h2>
                </NavigationLinkButton>
                <p>{about}</p>
                <a class="course" href={courseHref}>The {course} course</a>
            </section>
        {/each}
    </div>
</Page>

<style lang="scss">
    .intro {
        line-height: 1.5;
        max-width: 60rem;
        margin: 0 0 1.5rem;
        color: var(--background-text-muted);
    }
    a {
        color: var(--accent);
        text-decoration: underline;
    }
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
        gap: 1.5rem 1rem;
    }
    .lang {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        p {
            margin: 0;
            line-height: 1.5;
            color: var(--background-text-muted);
        }
    }
    /* the button keeps the size it had as a plain label */
    h2 {
        margin: 0;
        font-size: inherit;
        font-weight: inherit;
    }
    .course {
        margin-top: auto;
    }
</style>

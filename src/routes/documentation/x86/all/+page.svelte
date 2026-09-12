<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import X86DirectiveDocumentation from '$cmp/documentation/x86/X86DirectiveDocumentation.svelte'
    import X86RegistersDocumentation from '$cmp/documentation/x86/X86RegistersDocumentation.svelte'
    import X86SyscallDocumentation from '$cmp/documentation/x86/X86SyscallDocumentation.svelte'
    import { resolve } from '$app/paths'
    import {
        X86_DOCUMENTED_SECTIONS,
        describeX86Instruction,
        formatX86Form,
        hasX86InstructionPage,
        x86DocumentedInstructions,
        x86InstructionsBySection
    } from '$lib/languages/X86/X86-documentation'

    /** The documented set, under NASM's headings and in its order. */
    const sections = X86_DOCUMENTED_SECTIONS.map((section) => ({
        section,
        instructions: x86DocumentedInstructions.filter(
            (instruction) => instruction.section === section
        )
    })).filter((group) => group.instructions.length > 0)

    /**
     * Everything else: the vector and system extensions, listed with their summary and the oldest
     * form of each. They have no page of their own, so this is where the reader finds out that the
     * assembler accepts them and what they are called.
     */
    const rest = [...x86InstructionsBySection.entries()]
        .filter(([section]) => !X86_DOCUMENTED_SECTIONS.includes(section))
        .map(([section, instructions]) => ({ section, instructions }))
</script>

<svelte:head>
    <title>x86-64 Complete Documentation</title>
    <meta
        name="description"
        content="Complete x86-64 documentation in a single page. Includes the integer instruction set, every mnemonic the assembler accepts, the directives, the registers and flags, and the syscalls."
    />
    <meta
        property="og:description"
        content="Complete x86-64 documentation in a single page. Includes the integer instruction set, every mnemonic the assembler accepts, the directives, the registers and flags, and the syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 2rem;">
    <h1>x86-64 Complete Documentation</h1>

    <button class="print-button" onclick={() => window.print()}>Print as PDF</button>

    <nav class="toc">
        <a href="#instructions">Instructions</a>
        <a href="#extensions">Extensions</a>
        <a href="#directives">Directives</a>
        <a href="#registers-and-flags">Registers & Flags</a>
        <a href="#syscalls">Syscalls</a>
    </nav>

    <section id="instructions">
        <h2>Instructions</h2>
        {#each sections as group (group.section)}
            <h3 class="section-heading" id={group.section.toLowerCase().split(' ').join('-')}>
                {group.section}
            </h3>
            {#each group.instructions as instruction (instruction.name)}
                <div class="instruction">
                    <div class="row align-center">
                        <h3 class="sub-title" id={instruction.name}>
                            {#if hasX86InstructionPage(instruction.name)}
                                <a
                                    href={resolve(
                                        '/documentation/x86/instruction/[instructionName]',
                                        { instructionName: instruction.name }
                                    )}
                                >
                                    {instruction.name}
                                </a>
                            {:else}
                                {instruction.name}
                            {/if}
                            <span style="font-size: 1rem; font-weight: normal">
                                {instruction.summary}
                            </span>
                        </h3>
                    </div>
                    <span class="sub-description">
                        <MarkdownRenderer
                            source={describeX86Instruction(instruction.name)}
                            linksInNewTab={false}
                        />
                    </span>
                    <span class="example">
                        {instruction.forms
                            .slice(0, 6)
                            .map((form) => formatX86Form(instruction.name, form))
                            .join(' | ')}
                    </span>
                </div>
            {/each}
        {/each}
    </section>

    <section id="extensions">
        <h2>Extensions</h2>
        <p class="note">
            Everything else the assembler accepts, under the heading NASM files it under. These have
            no page of their own: the only description of them we are free to publish is the one
            line below, and blink implements a part of them.
        </p>
        {#each rest as group (group.section)}
            <h3 class="section-heading">{group.section}</h3>
            <div class="word-list">
                {#each group.instructions as instruction (instruction.name)}
                    <code title={instruction.summary}>{instruction.name}</code>
                {/each}
            </div>
        {/each}
    </section>

    <section id="directives">
        <h2>Directives</h2>
        <X86DirectiveDocumentation />
    </section>

    <section id="registers-and-flags">
        <h2>Registers & Flags</h2>
        <X86RegistersDocumentation />
    </section>

    <section id="syscalls">
        <h2>Syscalls</h2>
        <X86SyscallDocumentation />
    </section>
</Page>

<style lang="scss">
    @use '$cmp/documentation/m68k/style.scss' as *;
    .section-heading {
        margin-top: 1rem;
        color: var(--accent);
    }
    .note {
        line-height: 1.5;
        max-width: 60rem;
    }
    .word-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }
    code {
        font-family: FiraCode;
        font-size: 0.85rem;
        padding: 0.15rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .sub-title a {
        color: inherit;

        &:hover {
            color: var(--accent);
            text-decoration: underline;
        }
    }
</style>

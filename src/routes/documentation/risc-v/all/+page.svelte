<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import RISCVDirectiveDocumentation from '$cmp/documentation/riscv/RISCVDirectiveDocumentation.svelte'
    import RISCVSyscallExplanation from '$cmp/documentation/riscv/RISCVSyscallExplanation.svelte'
    import {
        riscvInstructionNames,
        riscvInstructionMap,
        formatAggregatedArgs,
        groupVariantsByDescription
    } from '$lib/languages/RISC-V/RISC-V-documentation'
</script>

<svelte:head>
    <title>RISC-V Complete Documentation</title>
    <meta
        name="description"
        content="Complete RISC-V documentation in a single page. Includes all instructions, directives, and syscalls."
    />
    <meta
        property="og:description"
        content="Complete RISC-V documentation in a single page. Includes all instructions, directives, and syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 2rem;">
    <h1>RISC-V Complete Documentation</h1>

    <button class="print-button" onclick={() => window.print()}>Print as PDF</button>

    <nav class="toc">
        <a href="#instructions">Instructions</a>
        <a href="#directives">Directives</a>
        <a href="#syscalls">Syscalls</a>
    </nav>

    <section id="instructions">
        <h2>Instructions</h2>
        <div class="column sub-section">
            {#each riscvInstructionNames as ins}
                {@const instruction = riscvInstructionMap.get(ins)}
                {@const groups = groupVariantsByDescription(instruction)}
                <div class="instruction">
                    <div class="row align-center">
                        <h3 class="sub-title" id={ins}>
                            {ins}
                            <span style="font-size: 1rem; font-weight: normal"
                                >{formatAggregatedArgs(instruction)}</span
                            >
                        </h3>
                    </div>

                    {#each groups as group}
                        {#if group.description}
                            <span class="sub-description">
                                <MarkdownRenderer
                                    source={group.description}
                                    linksInNewTab={false}
                                />
                            </span>
                        {/if}
                        {#if group.examples.some(Boolean)}
                            <span class="example">
                                {group.examples.filter(Boolean).join('\n')}
                            </span>
                        {/if}
                    {/each}
                </div>
            {/each}
        </div>
    </section>

    <section id="directives">
        <h2>Directives</h2>
        <p>
            RISC-V directives are used to define the structure of the program. They are not instructions
            that are executed by the CPU, but rather instructions that are used by the assembler to
            define the structure of the program.
        </p>
        <RISCVDirectiveDocumentation />
    </section>

    <section id="syscalls">
        <h2>Syscalls</h2>
        <RISCVSyscallExplanation />
    </section>
</Page>

<style lang="scss">
    @use '$cmp/documentation/m68k/style.scss' as *;

    .toc {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        a {
            padding: 0.5rem 1rem;
            background-color: var(--secondary);
            color: var(--secondary-text);
            border-radius: 0.4rem;
            text-decoration: none;
            &:hover {
                background-color: var(--tertiary);
                color: var(--tertiary-text);
            }
        }
    }

    section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    h2 {
        border-bottom: solid 0.15rem var(--accent);
        padding-bottom: 0.5rem;
    }

    .print-button {
        padding: 0.5rem 1rem;
        background-color: var(--accent);
        color: var(--accent-text);
        border: none;
        border-radius: 0.4rem;
        cursor: pointer;
        font-size: 1rem;
        align-self: flex-start;
        &:hover {
            opacity: 0.8;
        }
    }

    @media print {
        .toc {
            display: none;
        }
        .print-button {
            display: none;
        }
        section {
            page-break-inside: avoid;
        }
        .instruction {
            page-break-inside: avoid;
        }
    }
</style>

<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import MIPSDirectiveDocumentation from '$cmp/documentation/mips/MIPSDirectiveDocumentation.svelte'
    import MIPSSyscallExplanation from '$cmp/documentation/mips/MIPSSyscallExplanation.svelte'
    import MIPSRegistersDocumentation from '$cmp/documentation/mips/MIPSRegistersDocumentation.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'	
	
    import {
        mipsInstructionNames,
        mipsInstructionMap,
        formatAggregatedArgs,
        groupVariantsByDescription
    } from '$lib/languages/MIPS/MIPS-documentation'
</script>

<svelte:head>
    <title>MIPS Complete Documentation</title>
    <meta
        name="description"
        content="Complete MIPS documentation in a single page. Includes all instructions, directives, and syscalls."
    />
    <meta
        property="og:description"
        content="Complete MIPS documentation in a single page. Includes all instructions, directives, and syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 2rem;">
    <h1>MIPS Complete Documentation</h1>

    <button class="print-button" onclick={() => window.print()}>Print as PDF</button>

    <nav class="toc">
        <a href="#instructions">Instructions</a>
        <a href="#directives">Directives</a>
        <a href="#syscalls">Syscalls</a>
	<a href="#registers">Registers</a>
    </nav>

    <section id="instructions">
        <h2>Instructions</h2>
        <div class="column sub-section">
            {#each mipsInstructionNames as ins}
                {@const instruction = mipsInstructionMap.get(ins)}
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
            MIPS directives are used to define the structure of the program. They are not instructions
            that are executed by the CPU, but rather instructions that are used by the assembler to
            define the structure of the program.
        </p>
        <MIPSDirectiveDocumentation />
    </section>

    <section id="syscalls">
        <h2>Syscalls</h2>
        <MIPSSyscallExplanation />
    </section>

<section id="registers">
	<Header type="h3">{register.name} ({register.number})</Header>
        <p>
            MIPS has 32 GPR registers each of 32 bits
        </p>
        <MIPSRegistersDocumentation />
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

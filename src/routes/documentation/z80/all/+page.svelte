<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Z80DirectiveDocumentation from '$cmp/documentation/z80/Z80DirectiveDocumentation.svelte'
    import Z80RegistersDocumentation from '$cmp/documentation/z80/Z80RegistersDocumentation.svelte'
    import Z80IoDocumentation from '$cmp/documentation/z80/Z80IoDocumentation.svelte'
    import { dedupeZ80Forms } from '$cmp/documentation/z80/z80DocsUtils'
    import {
        formatZ80InstructionSummary,
        groupZ80VariantsByDescription,
        z80InstructionEntries
    } from '$lib/languages/Z80/Z80-documentation'
</script>

<svelte:head>
    <title>Z80 Complete Documentation</title>
    <meta
        name="description"
        content="Complete Z80 documentation in a single page. Includes all instructions, assembler directives, registers and flags, and the console ports."
    />
    <meta
        property="og:description"
        content="Complete Z80 documentation in a single page. Includes all instructions, assembler directives, registers and flags, and the console ports."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 2rem;">
    <h1>Z80 Complete Documentation</h1>

    <button class="print-button" onclick={() => window.print()}>Print as PDF</button>

    <nav class="toc">
        <a href="#instructions">Instructions</a>
        <a href="#directives">Directives</a>
        <a href="#registers-and-flags">Registers & Flags</a>
        <a href="#input-output">Input/Output</a>
    </nav>

    <section id="instructions">
        <h2>Instructions</h2>
        {#each z80InstructionEntries as [ins, variants] (ins)}
            {@const groups = groupZ80VariantsByDescription(variants)}
            <div class="instruction">
                <div class="row align-center">
                    <h3 class="sub-title" id={ins}>
                        {ins}
                        <span style="font-size: 1rem; font-weight: normal"
                            >{formatZ80InstructionSummary(variants)}</span
                        >
                    </h3>
                </div>

                {#each groups as group (group.description)}
                    {#if group.description}
                        <span class="sub-description">
                            <MarkdownRenderer source={group.description} linksInNewTab={false} />
                        </span>
                    {/if}
                    <span class="example">
                        {dedupeZ80Forms(group.instructions).join(' | ')}
                    </span>
                {/each}
            </div>
        {/each}
    </section>

    <section id="directives">
        <h2>Directives</h2>
        <p class="text-muted">
            Directives are not executed by the CPU: they tell the assembler where to put the code,
            what data to emit, which names stand for which values, and when to expand a macro.
        </p>
        <Z80DirectiveDocumentation />
    </section>

    <section id="registers-and-flags">
        <h2>Registers & Flags</h2>
        <Z80RegistersDocumentation />
    </section>

    <section id="input-output">
        <h2>Input/Output</h2>
        <Z80IoDocumentation />
    </section>
</Page>

<style lang="scss">
    @use '$cmp/documentation/m68k/style.scss' as *;
</style>

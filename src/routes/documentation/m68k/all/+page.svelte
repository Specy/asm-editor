<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import M68KAddressingModes from '$cmp/documentation/m68k/M68KAddressingModes.svelte'
    import M68KConditionCodesExplanation from '$cmp/documentation/m68k/M68KConditionCodesExplanation.svelte'
    import M68KShiftDirectionsExplanation from '$cmp/documentation/m68k/M68KShiftDirectionsExplanation.svelte'
    import M68KDirectives from '$cmp/documentation/m68k/M68KDirectives.svelte'
    import M68KAssemblerFeatures from '$cmp/documentation/m68k/M68KAssemblerFeatures.svelte'
    import {
        instructionsDocumentationList,
        fromSizesToString,
        fromSizeToString,
        getAddressingModeNames
    } from '$lib/languages/M68K/M68K-documentation'
</script>

<svelte:head>
    <title>M68K Complete Documentation</title>
    <meta
        name="description"
        content="Complete M68K documentation in a single page. Includes all instructions, addressing modes, condition codes, directives, and assembler features."
    />
    <meta
        property="og:description"
        content="Complete M68K documentation in a single page. Includes all instructions, addressing modes, condition codes, directives, and assembler features."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 2rem;">
    <h1>M68K Complete Documentation</h1>

    <button class="print-button" onclick={() => window.print()}>Print as PDF</button>

    <nav class="toc">
        <a href="#addressing-modes">Addressing Modes</a>
        <a href="#condition-codes">Condition Codes</a>
        <a href="#shift-directions">Shift Directions</a>
        <a href="#directives">Directives</a>
        <a href="#assembler-features">Assembler Features</a>
        <a href="#instructions">Instructions</a>
    </nav>

    <section id="addressing-modes">
        <h2>Addressing Modes</h2>
        <M68KAddressingModes />
    </section>

    <section id="condition-codes">
        <h2>Condition Codes</h2>
        <M68KConditionCodesExplanation />
    </section>

    <section id="shift-directions">
        <h2>Shift Directions</h2>
        <M68KShiftDirectionsExplanation />
    </section>

    <section id="directives">
        <h2>Directives</h2>
        <M68KDirectives openLinksInNewTab={false} />
    </section>

    <section id="assembler-features">
        <h2>Assembler Features</h2>
        <M68KAssemblerFeatures />
    </section>

    <section id="instructions">
        <h2>Instructions</h2>
        {#each instructionsDocumentationList as ins}
            <div class="instruction">
                <div class="row align-center">
                    <h3 class="sub-title" id={ins.name}>
                        {ins.name}
                    </h3>
                    {#if ins.sizes.length}
                        <span style="font-size: 0.9rem;">
                            ({fromSizesToString(ins.sizes)}) {ins.defaultSize
                                ? ` {${fromSizeToString(ins.defaultSize)}}`
                                : ''}
                        </span>
                    {/if}
                </div>
                <div class="row instruction-addressing-modes">
                    {#if ins.args.length}
                        {#each ins.args as arg, i}
                            <DocsOperand
                                name={`Op ${i + 1}`}
                                content={getAddressingModeNames(arg)}
                            />
                        {/each}
                    {/if}
                </div>
                {#if ins.description}
                    <span class="sub-description">
                        <MarkdownRenderer source={ins.description} linksInNewTab={false} />
                    </span>
                {/if}
                {#if ins.example}
                    <span class="example">
                        {ins.example}
                    </span>
                {/if}
            </div>
        {/each}
    </section>
</Page>

<style lang="scss">
    @use '$cmp/documentation/m68k/style.scss' as *;
</style>

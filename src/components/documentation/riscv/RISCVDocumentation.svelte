<script lang="ts">
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import stringSimilarity from 'string-similarity'
    import DocsSection from '$cmp/shared/layout/TogglableSection.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    let wrapper: HTMLDivElement = $state()
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        aggregateArgs,
        formatAggregatedArgs,
        riscvDirectivesMap,
        riscvInstructionMap,
        riscvInstructionNames
    } from '$lib/languages/RISC-V/RISC-V-documentation'
    import RiscVDirectiveDocumentation from './RISCVDirectiveDocumentation.svelte'
    import RiscVSyscall from './RISCVSyscall.svelte'
    interface Props {
        visible: boolean
        style?: string
        searchValue: string
        defaultOpen?: boolean
        openLinksInNewTab?: boolean
        showRedirect?: boolean
    }

    let {
        visible = $bindable(),
        style = '',
        searchValue = $bindable(),
        defaultOpen = false,
        openLinksInNewTab = true,
        showRedirect = false
    }: Props = $props()
    function includesText(nodes: NodeListOf<Element>, text: string) {
        const texts = Array.from(nodes).map((node) => node.textContent)
        const match = stringSimilarity.findBestMatch(text, texts)
        return nodes[match.bestMatchIndex]
    }
    $effect(() => {
        if (visible && wrapper && searchValue) {
            const els = wrapper.querySelectorAll('.sub-title')
            const el = includesText(els, searchValue)
            if (el) {
                el.scrollIntoView({ inline: 'nearest' })
            } else {
                const descr = wrapper.querySelectorAll('.sub-description')
                const el = includesText(descr, searchValue)
                if (el) {
                    el.scrollIntoView({ inline: 'nearest' })
                } else {
                    const titles = wrapper.querySelectorAll('.section-title')
                    const el = includesText(titles, searchValue)
                    el.scrollIntoView({ inline: 'nearest' })
                }
            }
        }
    })
</script>

<div class="docs-list" bind:this={wrapper} {style}>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Directives</h4>
        {/snippet}
        <RiscVDirectiveDocumentation />
    </DocsSection>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Syscalls</h4>
        {/snippet}
        <RiscVSyscall />
    </DocsSection>
    <DocsSection>
        {#snippet title()}
            <h4>Instructions</h4>
        {/snippet}
        <div class="column sub-section">
            {#each riscvInstructionNames as ins}
                {@const instruction = riscvInstructionMap.get(ins)}
                <div class="instruction">
                    <div class="row align-center">
                        <h1 class="sub-title" id={ins}>
                            {#if showRedirect}
                                <a
                                    href="#{ins}"
                                    class="sub-hover"
                                    title="click to create quick link"
                                >
                                    {ins}
                                    <span style="font-size: 1rem; font-weight: normal"
                                        >{formatAggregatedArgs(instruction)}</span
                                    >
                                </a>
                            {:else}
                                {ins}
                                <span style="font-size: 1rem; font-weight: normal"
                                    >{formatAggregatedArgs(instruction)}</span
                                >
                            {/if}
                        </h1>
                    </div>

                    {#if instruction[0].description}
                        <span class="sub-description">
                            <MarkdownRenderer
                                source={instruction[0].description}
                                linksInNewTab={openLinksInNewTab}
                            />
                        </span>
                    {/if}
                    {#if instruction.length > 1}
                        <MarkdownRenderer
                            style="background-color: rgba(var(--RGB-secondary), 0.7); border-radius: 0.5rem; padding: 0.5rem;"
                            source={instruction
                                .slice(1)
                                .map((i) => `- ${i.description}: **${i.example}**`)
                                .join('\n')}
                        />
                    {/if}
                    <div class="row" style="gap: 1rem; justify-content: space-between;">
                        {#if instruction[0].example}
                            <span class="example">
                                {instruction[0].example}
                            </span>
                        {/if}
                        {#if showRedirect}
                            <ButtonLink
                                href="/documentation/riscv/instruction/{ins}"
                                cssVar="tertiary"
                            >
                                Try it
                                <Icon style="margin-left: 0.5rem" size={0.8}>
                                    <FaArrowRight />
                                </Icon>
                            </ButtonLink>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </DocsSection>
</div>

<style lang="scss">
    @use '../m68k/style.scss' as *;
</style>

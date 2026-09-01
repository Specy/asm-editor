<script lang="ts">
    import stringSimilarity from 'string-similarity'
    import DocsSection from '$cmp/shared/layout/TogglableSection.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    let wrapper: HTMLDivElement | undefined = $state()
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        formatZ80InstructionSummary,
        groupZ80VariantsByDescription,
        z80InstructionEntries
    } from '$lib/languages/Z80/Z80-documentation'
    import { dedupeZ80Forms } from './z80DocsUtils'
    import Z80DirectiveDocumentation from './Z80DirectiveDocumentation.svelte'
    import Z80RegistersDocumentation from './Z80RegistersDocumentation.svelte'
    import Z80IoDocumentation from './Z80IoDocumentation.svelte'
    interface Props {
        visible: boolean
        style?: string
        searchValue: string
        defaultOpen?: boolean
        openLinksInNewTab?: boolean
        showRedirect?: boolean
        disableLinks?: boolean
    }

    let {
        visible = $bindable(),
        style = '',
        searchValue = $bindable(),
        defaultOpen = false,
        openLinksInNewTab = true,
        showRedirect = false,
        disableLinks = false
    }: Props = $props()

    // A mnemonic like `ld` has 192 forms sharing a dozen descriptions; the panel shows the first
    // few groups and leaves the rest to the instruction page.
    const MAX_GROUPS = 6

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
    <DocsSection>
        {#snippet title()}
            <h4>Instructions</h4>
        {/snippet}
        <div class="column sub-section">
            {#each z80InstructionEntries as [ins, variants] (ins)}
                {@const groups = groupZ80VariantsByDescription(variants)}
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
                                        >{formatZ80InstructionSummary(variants)}</span
                                    >
                                </a>
                            {:else}
                                {ins}
                                <span style="font-size: 1rem; font-weight: normal"
                                    >{formatZ80InstructionSummary(variants)}</span
                                >
                            {/if}
                        </h1>
                    </div>

                    {#if groups[0].description}
                        <span class="sub-description">
                            <MarkdownRenderer
                                source={groups[0].description}
                                linksInNewTab={openLinksInNewTab}
                                {disableLinks}
                            />
                        </span>
                    {/if}
                    {#if groups.length > 1}
                        <MarkdownRenderer
                            style="background-color: rgba(var(--RGB-secondary), 0.7); border-radius: 0.5rem; padding: 0.5rem;"
                            {disableLinks}
                            source={groups
                                .slice(1, MAX_GROUPS)
                                .map((g) => `- ${g.description} **${g.instructions[0]}**`)
                                .join('\n')}
                        />
                    {/if}
                    <div class="row" style="gap: 1rem; justify-content: space-between;">
                        <span class="example">
                            {dedupeZ80Forms(groups[0].instructions).slice(0, 4).join(' | ')}
                        </span>
                        {#if showRedirect}
                            <ButtonLink
                                href="/documentation/z80/instruction/{ins}"
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
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Directives</h4>
        {/snippet}
        <Z80DirectiveDocumentation {disableLinks} />
    </DocsSection>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Registers & Flags</h4>
        {/snippet}
        <Z80RegistersDocumentation {disableLinks} />
    </DocsSection>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Input/Output</h4>
        {/snippet}
        <Z80IoDocumentation {disableLinks} />
    </DocsSection>
</div>

<style lang="scss">
    @use '../m68k/style.scss' as *;
</style>

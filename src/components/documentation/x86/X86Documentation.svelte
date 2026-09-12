<script lang="ts">
    import stringSimilarity from 'string-similarity'
    import DocsSection from '$cmp/shared/layout/TogglableSection.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import X86DirectiveDocumentation from './X86DirectiveDocumentation.svelte'
    import X86RegistersDocumentation from './X86RegistersDocumentation.svelte'
    import X86SyscallDocumentation from './X86SyscallDocumentation.svelte'
    import {
        X86_DOCUMENTED_SECTIONS,
        describeX86Instruction,
        formatX86Form,
        x86DocumentedInstructions
    } from '$lib/languages/X86/X86-documentation'

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

    let wrapper: HTMLDivElement | undefined = $state()

    /** The panel shows the shapes a reader is likely to write; `mov` alone has 66 of them. */
    const MAX_FORMS = 4

    // The panel lists the integer instruction set under NASM's own headings, in its order, so that
    // the neighbours of an instruction are the instructions it is used with.
    const sections = X86_DOCUMENTED_SECTIONS.map((section) => ({
        section,
        instructions: x86DocumentedInstructions.filter(
            (instruction) => instruction.section === section
        )
    })).filter((group) => group.instructions.length > 0)

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
                const found = includesText(descr, searchValue)
                if (found) found.scrollIntoView({ inline: 'nearest' })
            }
        }
    })
</script>

<div class="docs-list" bind:this={wrapper} {style}>
    {#each sections as group (group.section)}
        <DocsSection open={defaultOpen}>
            {#snippet title()}
                <h4>{group.section}</h4>
            {/snippet}
            <div class="column sub-section">
                {#each group.instructions as instruction (instruction.name)}
                    <div class="instruction">
                        <div class="row align-center">
                            <h1 class="sub-title" id={instruction.name}>
                                {#if showRedirect}
                                    <a
                                        href="#{instruction.name}"
                                        class="sub-hover"
                                        title="click to create quick link"
                                    >
                                        {instruction.name}
                                        <span class="summary">{instruction.summary}</span>
                                    </a>
                                {:else}
                                    {instruction.name}
                                    <span class="summary">{instruction.summary}</span>
                                {/if}
                            </h1>
                        </div>
                        <span class="sub-description">
                            <MarkdownRenderer
                                source={describeX86Instruction(instruction.name)}
                                linksInNewTab={openLinksInNewTab}
                                {disableLinks}
                            />
                        </span>
                        <div class="row" style="gap: 1rem; justify-content: space-between;">
                            <span class="example">
                                {instruction.forms
                                    .slice(0, MAX_FORMS)
                                    .map((form) => formatX86Form(instruction.name, form))
                                    .join(' | ')}
                            </span>
                            {#if showRedirect}
                                <ButtonLink
                                    href="/documentation/x86/instruction/{instruction.name}"
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
    {/each}
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Registers & Flags</h4>
        {/snippet}
        <X86RegistersDocumentation {disableLinks} />
    </DocsSection>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Directives</h4>
        {/snippet}
        <X86DirectiveDocumentation {disableLinks} />
    </DocsSection>
    <DocsSection open={defaultOpen}>
        {#snippet title()}
            <h4>Syscalls</h4>
        {/snippet}
        <X86SyscallDocumentation {disableLinks} />
    </DocsSection>
</div>

<style lang="scss">
    @use '../m68k/style.scss' as *;
    .summary {
        font-size: 1rem;
        font-weight: normal;
    }
</style>

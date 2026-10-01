<script lang="ts">
    /**
     * A Lecture section among the Documentation panel's results: where it is and a few lines of it,
     * expanding in place to the whole section with its Playgrounds as plain code, since an embedded
     * editor with an Emulator of its own does not belong in a side panel. The lecture itself opens
     * in a new tab: the Workbench never navigates ([ADR 0024](../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)).
     */
    import { prefersReducedMotion } from 'svelte/motion'
    import { slide } from 'svelte/transition'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import HighlightedText from '$cmp/search/HighlightedText.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import type { SectionDocument } from '$lib/search/payload'

    interface Props {
        section: SectionDocument
        excerpt: string
        expanded: boolean
        ontoggle: () => void
        terms?: string[]
    }

    let { section, excerpt, expanded, ontoggle, terms = [] }: Props = $props()
</script>

<div class="section-card" class:expanded>
    <button type="button" class="head" aria-expanded={expanded} onclick={ontoggle}>
        <span class="where">{section.courseName} › {section.lectureName}</span>
        <span class="title"><HighlightedText text={section.title} {terms} /></span>
        {#if !expanded}
            <span class="excerpt"><HighlightedText text={excerpt} {terms} /></span>
        {/if}
    </button>
    {#if expanded}
        <div class="body" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
            <MarkdownRenderer
                source={section.markdown}
                playgrounds="code"
                centered={false}
                simpleCode
            />
            <a class="open" href={section.href} target="_blank" rel="noopener">
                Open the lecture
                <span class="external" aria-hidden="true"><FaExternalLinkAlt /></span>
            </a>
        </div>
    {/if}
</div>

<style>
    .section-card {
        border-radius: 0.5rem;
        border: 1px solid color-mix(in srgb, var(--tertiary) 80%, transparent);
        min-width: 0;
    }
    .head {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        width: 100%;
        padding: 0.45rem 0.6rem;
        border: none;
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        min-width: 0;
    }
    .head:hover {
        background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
    }
    .head:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    .where {
        font-size: 0.75rem;
        color: var(--accent);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .title {
        font-weight: 600;
    }
    .excerpt {
        font-size: 0.85rem;
        color: var(--background-text-muted);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0 0.7rem 0.7rem;
        min-width: 0;
        font-size: 0.95rem;
    }
    .body :global(._markdown p),
    .body :global(._markdown ul),
    .body :global(._markdown ol) {
        font-family: inherit;
        font-weight: normal;
        font-size: 0.92rem;
        width: 100%;
        margin: 0;
    }
    .body :global(._markdown pre:has(code)) {
        min-width: 0;
        max-width: 100%;
        margin: 0.3rem 0;
        box-shadow: none;
    }
    .open {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        align-self: flex-start;
        font-size: 0.85rem;
        color: var(--accent);
        text-decoration: underline;
    }
    .external {
        display: flex;
        width: 0.7rem;
        height: 0.7rem;
    }
</style>

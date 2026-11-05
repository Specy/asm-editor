<script lang="ts">
    /**
     * "Documentation for agents": the one-line message a reader sends to an AI assistant so it reads
     * the site's Markdown twins through `/llms.txt`
     * ([ADR 0077](../../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)),
     * with a button that copies it. On `/documentation` and in the home page's Documentation section.
     */
    import Button from '#cmp/shared/button/Button.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaCopy from '~icons/fa-solid/copy'
    import FaExpandAlt from '~icons/fa-solid/expand-alt'
    import FaCompressAlt from '~icons/fa-solid/compress-alt'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { copyText } from '#lib/utils.ts'
    import { AGENT_MESSAGE } from '#lib/twins/agentMessage.ts'

    interface Props {
        /** The heading's level: 2 where it is a section of its own, 3 inside another one. */
        level?: 2 | 3
        style?: string
    }

    let { level = 2, style = '' }: Props = $props()
    const id = $props.id()
    // the message is cut to one line until the reader asks to read it whole
    let expanded = $state(false)
    // the two buttons beside the message, one height
    const BUTTON_STYLE = 'height: var(--button); flex-shrink: 0;'
</script>

<section class="agents" class:nested={level === 3} aria-labelledby={id} {style}>
    <svelte:element this={`h${level}`} {id} class="heading">Documentation for agents</svelte:element
    >
    <p>Send this message to an AI assistant so they can search the docs of each Instruction Set.</p>
    <!-- the slot keeps the one-line height, so the whole message opens over what follows -->
    <div class="slot">
        <div class="message" class:expanded>
            <span class="text" class:expanded id={`${id}-message`}>{AGENT_MESSAGE}</span>
            <div class="actions">
                <Button
                    cssVar="tertiary"
                    hasIcon
                    style={`${BUTTON_STYLE} width: var(--button); padding: 0;`}
                    aria-label={expanded
                        ? 'Show the message on one line'
                        : 'Show the whole message'}
                    aria-expanded={expanded}
                    aria-controls={`${id}-message`}
                    {@attach tooltip(
                        expanded ? 'Show the message on one line' : 'Show the whole message'
                    )}
                    onClick={() => (expanded = !expanded)}
                >
                    <Icon size={0.85}>
                        {#if expanded}<FaCompressAlt />{:else}<FaExpandAlt />{/if}
                    </Icon>
                </Button>
                <Button
                    cssVar="tertiary"
                    hasIcon
                    style={`${BUTTON_STYLE} padding: 0 0.75rem; font-size: 0.85rem; gap: 0.4rem;`}
                    onClick={() => void copyText(AGENT_MESSAGE, 'Message')}
                >
                    <Icon size={0.9}><FaCopy /></Icon>
                    Copy
                </Button>
            </div>
        </div>
    </div>
</section>

<style>
    .agents {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .nested {
        gap: 0.6rem;
    }
    .heading {
        margin: 0;
        font-size: 2rem;
    }
    .nested .heading {
        font-size: 1.3rem;
    }
    p {
        margin: 0;
        color: var(--background-text-muted);
    }
    .nested p {
        color: inherit;
        opacity: 0.85;
    }
    .slot {
        --pad: 0.35rem;
        --button: 2rem;
        position: relative;
        max-width: 34rem;
        height: calc(var(--button) + 2 * var(--pad) + 2px);
    }
    .message {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: var(--pad) var(--pad) var(--pad) 0.8rem;
        border: 1px solid var(--tertiary);
        border-radius: 0.6rem;
        background-color: var(--secondary);
    }
    /* it opens upward, over the text above it, so the buttons stay under the pointer and a
       section that clips what overflows its bottom, as the home page's do, cuts nothing off */
    .message.expanded {
        top: auto;
        bottom: 0;
        align-items: flex-end;
        z-index: 5;
        box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.35);
    }
    .actions {
        display: flex;
        gap: var(--pad);
        flex-shrink: 0;
    }
    .text {
        flex: 1;
        min-width: 0;
        color: var(--secondary-text);
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
        /* one line is exactly a button high, so it sits level with them, and 1px lower than
           half the leading, since Fira Code draws its letters high in the line */
        --line: 1.25rem;
        --half: calc((var(--button) - var(--line)) / 2);
        line-height: var(--line);
        padding: calc(var(--half) + 1px) 0 calc(var(--half) - 1px);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .text.expanded {
        white-space: normal;
        overflow-wrap: anywhere;
    }
</style>

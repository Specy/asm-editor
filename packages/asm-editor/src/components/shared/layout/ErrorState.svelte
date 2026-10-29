<script lang="ts">
    /**
     * Everything the app shows in place of something that failed: what failed as a title, what
     * happened and what to do about it, the ways out, and, given the error itself, a copy of it and
     * a GitHub issue already filled in with it. It is drawn as the Workbench's empty editor is, the
     * error in a Workbench card, and fills whatever holds it: a whole page, or with `compact` a
     * panel or a pane.
     */
    import { copyText } from '#lib/utils.ts'
    import Button from '#cmp/shared/button/Button.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import FaRedo from '~icons/fa-solid/redo'
    import FaCopy from '~icons/fa-solid/copy'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import type { Snippet } from 'svelte'
    import '#cmp/specific/workbench/workbench.css'

    interface Props {
        title: string
        /** What happened and what to do about it, in a sentence or two. */
        children?: Snippet
        /** The error itself, shown to copy and offered to report; left out for an expected failure. */
        error?: unknown
        /** A label above the title, such as `Error 404`. */
        code?: string
        /** Whether the first way out is Reload the page, which fixes most failures to load. */
        reload?: boolean
        /** The other ways out, after Reload. */
        actions?: Snippet
        /** The size for a panel or a pane, on its surface rather than one of its own. */
        compact?: boolean
        /** `start` for a notice in a box of the page's own, read from its edge as the box's others are. */
        align?: 'center' | 'start'
    }

    let {
        title,
        children,
        error,
        code,
        reload = false,
        actions,
        compact = false,
        align = 'center'
    }: Props = $props()

    const message = $derived(
        error === undefined
            ? undefined
            : error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : (JSON.stringify(error) ?? String(error))
    )
    //the report opens GitHub's form already filled in, which the reader still reviews and sends;
    //the page's query is left out, since a playground link carries the code in it
    const reportHref = $derived(
        `https://github.com/Specy/asm-editor/issues/new?${new URLSearchParams({
            title,
            body: [
                '**Error**',
                '```',
                message ?? '',
                '```',
                `**Page:** ${location.pathname}`,
                `**Browser:** ${navigator.userAgent}`
            ].join('\n')
        })}`
    )
</script>

<div class="error-state wb-cards" class:compact class:start={align === 'start'} role="alert">
    <div class="content">
        <header>
            <span class="warning">
                <FaExclamationTriangle />
            </span>
            <div class="heading">
                {#if code}<span class="code">{code}</span>{/if}
                <!-- a heading by role, so a page's own heading styles leave it alone -->
                <div class="title" role="heading" aria-level="2">{title}</div>
            </div>
        </header>
        {#if children}
            <div class="description">{@render children()}</div>
        {/if}

        {#if reload || actions}
            <div class="actions">
                {#if reload}
                    <Button hasIcon onClick={() => location.reload()}>
                        <Icon size={0.85}>
                            <FaRedo />
                        </Icon>
                        Reload the page
                    </Button>
                {/if}
                {@render actions?.()}
            </div>
        {/if}

        {#if message !== undefined}
            <section class="error-card" aria-label="Error">
                <div class="error-header">
                    <span>Error</span>
                    <button class="copy" onclick={() => copyText(message, 'Error')}>
                        <FaCopy />
                        Copy
                    </button>
                </div>
                <pre class="error-message">{message}</pre>
            </section>

            <p class="report">
                Still failing{reload ? ' after a reload' : ''}?
                <!-- eslint-disable svelte/no-navigation-without-resolve -- a page on another site, which resolve() has no part in -->
                <a href={reportHref} target="_blank" rel="noopener noreferrer">
                    Report it on GitHub
                    <FaExternalLinkAlt />
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
                with this error.
            </p>
        {/if}
    </div>
</div>

<style lang="scss">
    .error-state {
        container-type: inline-size;
        display: flex;
        flex: 1;
        width: 100%;
        min-height: 100%;
        overflow: auto;
        padding: 2rem 1rem;
        /* read from the start whatever centres the notice it is placed in */
        text-align: start;
        color: var(--secondary-text);
        background: var(--secondary);
    }
    .compact {
        padding: 1rem;
        background: none;
    }
    .content {
        margin: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        max-width: 38rem;
    }
    .compact .content {
        gap: 0.7rem;
        max-width: 28rem;
    }
    .start .content {
        margin: 0;
        max-width: 38rem;
    }
    header {
        display: flex;
        align-items: center;
        gap: 0.7rem;
    }
    .warning {
        display: grid;
        place-items: center;
        flex: none;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.5rem;
        color: var(--red);
        background: color-mix(in srgb, var(--red) 15%, transparent);

        :global(svg) {
            width: 1.1rem;
            height: 1.1rem;
        }
    }
    .compact .warning {
        width: 1.7rem;
        height: 1.7rem;
        border-radius: 0.4rem;

        :global(svg) {
            width: 0.85rem;
            height: 0.85rem;
        }
    }
    .heading {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .code {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--red);
    }
    .title {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
        letter-spacing: -0.01em;
    }
    .compact .title {
        font-size: 1.05rem;
    }
    .description {
        margin: 0;
        line-height: 1.5;
        opacity: 0.85;
        overflow-wrap: anywhere;
    }
    .compact .description {
        font-size: 0.85rem;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    /* the buttons' own rule is as specific as `.actions .btn`, so these name the state too */
    .error-state .actions > :global(.btn) {
        gap: 0.5rem;
        padding: 0.5rem 0.9rem;
    }
    .error-state.compact .actions > :global(.btn) {
        padding: 0.35rem 0.7rem;
        font-size: 0.85rem;
    }
    /* a Workbench card (workbench.css): the error under a header band a shade lighter */
    .error-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        background: var(--background);
        overflow: hidden;
    }
    .error-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 2rem;
        padding: 0 0.3rem 0 0.7rem;
        font-size: 0.85rem;
        font-weight: 600;
        background: var(--wb-section-header);
        border-bottom: 1px solid var(--wb-line);
    }
    .copy {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.5rem;
        border: none;
        border-radius: 0.25rem;
        font: inherit;
        font-weight: 400;
        color: inherit;
        background: none;
        cursor: pointer;

        :global(svg) {
            width: 0.8rem;
        }
        &:hover {
            background: color-mix(in srgb, var(--tertiary) 60%, transparent);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
    }
    .error-message {
        margin: 0;
        max-height: 10rem;
        overflow: auto;
        padding: 0.7rem;
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        color: var(--background-text);
        user-select: text;
    }
    .compact .error-message {
        max-height: 6rem;
        font-size: 0.75rem;
    }
    .report {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.75;

        a {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            color: var(--accent);
            text-decoration: none;

            :global(svg) {
                width: 0.7rem;
            }
            &:hover {
                text-decoration: underline;
            }
        }
    }
    .compact .report {
        font-size: 0.8rem;
    }
    /* a narrow column: the title shrinks and the actions take the full width */
    @container (max-width: 26rem) {
        .title {
            font-size: 1.25rem;
        }
        .compact .title {
            font-size: 1rem;
        }
        .actions > :global(*) {
            flex: 1;
        }
    }
</style>

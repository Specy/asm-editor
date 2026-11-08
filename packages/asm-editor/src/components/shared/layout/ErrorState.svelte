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
    import CopyLabel from '#cmp/shared/button/CopyLabel.svelte'
    import { CopyFeedback } from '#cmp/shared/button/copyFeedback.svelte.ts'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
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
        /** The status drawn large above the title, such as `404`. */
        code?: string
        /** Whether the first way out is Reload the page, which fixes most failures to load. */
        reload?: boolean
        /** The other ways out, after Reload. */
        actions?: Snippet
        /** The size for a panel or a pane, on its surface rather than one of its own. */
        compact?: boolean
        /** `start` for a notice in a box of the page's own, read from its edge as the box's others are. */
        align?: 'center' | 'start'
        /** The title as the page's own `<h1>`, in the page title's style, for a page that is only
         * this notice (the error page). */
        pageTitle?: boolean
    }

    let {
        title,
        children,
        error,
        code,
        reload = false,
        actions,
        compact = false,
        align = 'center',
        pageTitle = false
    }: Props = $props()

    /** The error card's Copy, a header tool rather than a Button, says "Copied" as CopyButton does. */
    const copyFeedback = new CopyFeedback()

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
            {#if code}<span class="code">{code}</span>{/if}
            {#if pageTitle}
                <Header noMargin>{title}</Header>
            {:else}
                <!-- a heading by role, so a page's own heading styles leave it alone -->
                <div class="title" role="heading" aria-level="2">{title}</div>
            {/if}
        </header>
        {#if children}
            <div class="description">{@render children()}</div>
        {/if}

        {#if reload || actions}
            <div class="actions">
                {#if reload}
                    <Button onClick={() => location.reload()}>
                        <Icon size="small">
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
                    <button
                        type="button"
                        class="copy"
                        onclick={() => void copyFeedback.run(() => copyText(message, 'Error'))}
                    >
                        <CopyLabel copied={copyFeedback.copied}>
                            <FaCopy />
                            Copy
                        </CopyLabel>
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
        color: var(--background-text);
    }
    /* a panel's or a pane's own surface is the secondary one */
    .compact {
        padding: 1rem;
        color: var(--secondary-text);
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
        flex-direction: column;
    }
    /* a display size, above the type scale's page title (design-system-changes.md, S4-39) */
    .code {
        align-self: center;
        margin-bottom: 2rem;
        font-size: 4rem;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.02em;
        color: var(--danger);
    }
    .compact .code {
        margin-bottom: 1rem;
        font-size: 2.5rem;
    }
    .title {
        min-width: 0;
        margin: 0;
        font-size: var(--fs-h2);
        font-weight: 600;
        letter-spacing: -0.01em;
    }
    .compact .title {
        font-size: var(--fs-prose);
    }
    .description {
        margin: 0;
        line-height: 1.5;
        color: var(--text-muted);
        overflow-wrap: anywhere;
    }
    .compact .description {
        font-size: var(--fs-small);
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    /* a compact card's buttons a step smaller than a Button's own `md` */
    .error-state.compact .actions > :global(.btn) {
        padding: 0.35rem 0.7rem;
        font-size: var(--fs-small);
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
        font-size: var(--fs-small);
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
            width: var(--fs-small);
        }
        &:hover {
            background: var(--hover-bg);
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
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        color: var(--background-text);
        user-select: text;
    }
    .compact .error-message {
        max-height: 6rem;
        font-size: var(--fs-caption);
    }
    .report {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);

        a {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            color: var(--accent);
            text-decoration: none;

            :global(svg) {
                width: var(--fs-caption);
            }
            &:hover {
                text-decoration: underline;
            }
        }
    }
    .compact .report {
        font-size: var(--fs-small);
    }
    /* a narrow column: the title shrinks and the actions take the full width */
    @container (max-width: 26rem) {
        .code {
            font-size: 3rem;
        }
        .title {
            font-size: var(--fs-lead);
        }
        .compact .title {
            font-size: var(--fs-body);
        }
        .actions > :global(*) {
            flex: 1;
        }
    }
</style>

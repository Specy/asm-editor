<script lang="ts">
    /**
     * A language's or a course's **Card** on `/documentation` and `/learn/courses`: its name in its
     * colour, what it is, and its links, the main one filled with that colour and covering the card.
     */
    import type { ResolvedPathname } from '$app/types'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import { ThemeStore } from '#stores/themeStore.svelte.ts'

    type Action = { label: string; href: ResolvedPathname }

    interface Props {
        headingId: string
        title: string
        description: string
        accent?: string | null
        primary: Action
        secondary?: Action | undefined
    }

    let { headingId, title, description, accent = null, primary, secondary }: Props = $props()
</script>

<Card
    element="section"
    class="content-link-card"
    style={accent ? `--card-accent: ${accent}` : ''}
    aria-labelledby={headingId}
>
    <div class="card-body">
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
    </div>
    <div class="card-footer">
        {#if secondary}
            <ButtonLink
                href={secondary.href}
                kind="ghost"
                bordered
                style="flex: 1 1 auto; min-width: 0; z-index: 1">{secondary.label}</ButtonLink
            >
        {/if}
        <div class="primary-action">
            <ButtonLink
                href={primary.href}
                class="card-cover"
                bg={accent ?? 'var(--accent)'}
                color={accent ? ThemeStore.textOfColor(accent) : 'var(--accent-text)'}
                style="position: static; width: 100%; height: 100%">{primary.label}</ButtonLink
            >
        </div>
    </div>
</Card>

<style>
    /* the content and the footer pad themselves, where the card did, so the footer's rule runs
       edge to edge */
    .card-body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.2rem 1.2rem 0.75rem;
    }

    h2 {
        margin: 0;
        font-size: var(--fs-h3);
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.015em;
        color: var(--card-accent, var(--background-text));
    }

    p {
        margin: 0;
        font-size: var(--fs-body);
        line-height: 1.6;
        color: var(--background-text-prose);
    }

    /* a rule across the card, its edge's hairline; the other link, a ghost in its edge, draws less
       than the main one */
    .card-footer {
        display: flex;
        gap: 0.5rem;
        margin-top: auto;
        padding: 0.75rem;
        border-top: 1px solid var(--line);
    }

    .primary-action {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
    }

    @media (max-width: 600px) {
        .card-body {
            padding: 0.9rem 0.9rem 0.6rem;
        }
        .card-footer {
            padding: 0.6rem;
        }
    }

    @media (max-width: 360px) {
        .card-footer :global(.btn) {
            padding-inline: 0.65rem;
        }
    }
</style>

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
    <h2 id={headingId}>{title}</h2>
    <p>{description}</p>
    <div class="card-footer">
        {#if secondary}
            <ButtonLink
                href={secondary.href}
                kind="secondary"
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
    :global(.content-link-card) {
        gap: 1rem;
        padding: 1.2rem;
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

    /* a rule inside the card, its edge's hairline */
    .card-footer {
        display: flex;
        gap: 0.5rem;
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid var(--line);
    }

    .primary-action {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
    }

    @media (max-width: 600px) {
        :global(.content-link-card) {
            padding: 0.9rem;
        }
    }

    @media (max-width: 360px) {
        .card-footer :global(.btn) {
            padding-inline: 0.65rem;
        }
    }
</style>

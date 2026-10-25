<script lang="ts">
    import type { ResolvedPathname } from '$app/types'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
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

<section
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
                cssVar="secondary"
                bordered
                style="flex: 1 1 auto; min-width: 0; z-index: 1">{secondary.label}</ButtonLink
            >
        {/if}
        <div class="primary-action">
            <ButtonLink
                href={primary.href}
                bg={accent ?? 'var(--accent)'}
                color={accent ? ThemeStore.textOfColor(accent) : 'var(--accent-text)'}
                style="position: static; width: 100%; height: 100%">{primary.label}</ButtonLink
            >
        </div>
    </div>
</section>

<style>
    .content-link-card {
        position: relative;
        isolation: isolate;
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1rem;
        padding: 1.2rem;
        border: 1px solid var(--tertiary);
        border-radius: 0.75rem;
        background: var(--secondary);
        transition: background-color 0.2s;
    }

    .content-link-card:hover {
        background-color: color-mix(
            in srgb,
            var(--card-accent, var(--accent)) 3%,
            var(--secondary)
        );
    }

    h2 {
        margin: 0;
        font-size: 1.45rem;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.015em;
        color: var(--card-accent, var(--background-text));
    }

    p {
        margin: 0;
        font-size: 1rem;
        line-height: 1.6;
        color: var(--background-text-muted);
    }

    .card-footer {
        display: flex;
        gap: 0.5rem;
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid var(--tertiary);
    }

    .primary-action {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
    }

    /* The primary link covers the card; the secondary button sits above it. */
    .primary-action :global(a)::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 0.75rem;
    }

    @media (max-width: 600px) {
        .content-link-card {
            padding: 0.9rem;
        }
    }

    @media (max-width: 360px) {
        .content-link-card .card-footer :global(.btn) {
            padding-inline: 0.65rem;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .content-link-card {
            transition: none;
        }
    }
</style>

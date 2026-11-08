<script lang="ts" module>
    import type { ResolvedPathname } from '$app/types'

    export type AccordionFeature = {
        /** Words between asterisks are highlighted: `Decompile with *Ghidra*`. */
        title: string
        description: string
        link?: { href: ResolvedPathname; label: string }
        image: string
        alt: string
        width: number
        height: number
        /** Shows part of the image larger: the point to zoom towards, and how much. */
        focus?: { x: string; y: string; scale: number }
    }
</script>

<script lang="ts">
    /**
     * The home page's list of features beside a picture of the open one, after Zed's: one feature
     * is always open, and opening another closes it. On a narrow screen the picture goes inside
     * the open feature, under its text.
     */
    import FaPlus from '~icons/fa-solid/plus'
    import FaChevronRight from '~icons/fa-solid/chevron-right'

    interface Props {
        features: AccordionFeature[]
    }

    let { features }: Props = $props()

    /** A title's plain and highlighted runs, from the asterisks around the highlighted ones. */
    function titleParts(title: string) {
        return title
            .split(/(\*[^*]+\*)/)
            .filter((part) => part)
            .map((part) =>
                part.startsWith('*') && part.endsWith('*')
                    ? { text: part.slice(1, -1), highlight: true }
                    : { text: part, highlight: false }
            )
    }
    const id = $props.id()
    let open = $state(0)
</script>

<div class="accordion">
    <div class="list">
        {#each features as feature, i (feature.title)}
            {@const isOpen = open === i}
            <div class="item" class:open={isOpen}>
                <h3>
                    <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`${id}-panel-${i}`}
                        onclick={() => (open = i)}
                    >
                        <span class="title"
                            >{#each titleParts(feature.title) as part, k (k)}{#if part.highlight}<em
                                        >{part.text}</em
                                    >{:else}{part.text}{/if}{/each}</span
                        >
                        <span class="plus" aria-hidden="true"><FaPlus /></span>
                    </button>
                </h3>
                <div class="panel" id={`${id}-panel-${i}`} inert={!isOpen}>
                    <div class="panel-inner">
                        <!-- every feature's words in one cell, only this one's seen: the panel is as
                             tall as the longest, so opening another moves nothing below the list -->
                        <div class="texts">
                            {#each features as other, j (other.title)}
                                <div
                                    class="text"
                                    class:own={j === i}
                                    aria-hidden={j === i ? undefined : 'true'}
                                    inert={j !== i}
                                >
                                    <p>{other.description}</p>
                                    {#if other.link}
                                        <a class="more" href={other.link.href}>
                                            {other.link.label}
                                            <span class="chevron" aria-hidden="true"
                                                ><FaChevronRight /></span
                                            >
                                        </a>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                        <img
                            class="inline-shot"
                            src={feature.image}
                            alt={feature.alt}
                            width={feature.width}
                            height={feature.height}
                            loading="lazy"
                        />
                    </div>
                </div>
            </div>
        {/each}
    </div>
    <div class="preview" aria-hidden="true">
        {#each features as feature, i (feature.title)}
            <img
                src={feature.image}
                alt=""
                width={feature.width}
                height={feature.height}
                loading="lazy"
                class:shown={open === i}
                style={feature.focus
                    ? `object-position: ${feature.focus.x} ${feature.focus.y}; transform-origin: ${feature.focus.x} ${feature.focus.y}; --scale: ${feature.focus.scale}`
                    : ''}
            />
        {/each}
    </div>
</div>

<style lang="scss">
    .accordion {
        display: grid;
        grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    }

    .list {
        display: flex;
        flex-direction: column;
        justify-content: center;
        border-right: 1px solid var(--line);
    }

    .item {
        border-bottom: 1px solid var(--line);

        &:last-child {
            border-bottom: none;
        }
    }

    h3 {
        margin: 0;
        font: inherit;
    }

    button {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 0.7rem;
        width: 100%;
        padding: 1.2rem 2.5rem;
        cursor: pointer;
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        letter-spacing: 0.02em;
        color: var(--text-muted);
        transition: color var(--dur-fast);

        &:hover {
            color: var(--background-text);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
    }

    .open button {
        cursor: default;
        padding-top: 2.2rem;
        padding-bottom: 0.6rem;
        font-family: var(--font-read);
        font-size: var(--fs-h3);
        letter-spacing: 0;
        color: var(--background-text);
    }

    .title em {
        font-style: normal;
        color: var(--accent);
    }

    .plus {
        display: flex;
        width: var(--fs-micro);
        opacity: 0.7;
        transition:
            opacity var(--dur-base),
            transform var(--dur-base);
    }

    .open .plus {
        opacity: 0;
        transform: rotate(45deg);
    }

    /* a panel opens at once rather than growing, as every open one is the same height and one
       closes as the other opens: growing one while the other shrank moved what is below */
    .panel {
        display: none;
    }

    .open .panel {
        display: block;
        animation: reveal 0.35s ease;
    }

    @keyframes reveal {
        from {
            opacity: 0;
            transform: translateY(0.3rem);
        }
    }

    .panel-inner {
        overflow: hidden;
        padding: 0 2.5rem;
    }

    .open .panel-inner {
        padding-bottom: 2.2rem;
    }

    .texts {
        display: grid;
    }

    .text {
        grid-area: 1 / 1;

        &:not(.own) {
            visibility: hidden;
        }
    }

    p {
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        line-height: 1.75;
        letter-spacing: 0.02em;
        color: var(--text-muted);
        max-width: 34rem;
    }

    .more {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 1.2rem;
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        text-decoration: underline;
        text-underline-offset: 0.25em;
        text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);

        &:hover {
            text-decoration-color: currentColor;
        }
    }

    .chevron {
        display: flex;
        width: var(--fs-micro);
    }

    .inline-shot {
        display: none;
    }

    /* the whole cell beside the list, as tall as the list, the picture covering it */
    .preview {
        position: relative;
        min-height: 20rem;
        overflow: hidden;
        background: var(--lit);

        img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: left top;
            opacity: 0;
            transform: scale(var(--scale, 1));
            transition:
                opacity 0.4s ease,
                transform 0.6s ease;
        }

        img.shown {
            opacity: 1;
        }
    }

    @media (max-width: 900px) {
        .accordion {
            grid-template-columns: 1fr;
        }

        .list {
            border-right: none;
        }

        .preview {
            display: none;
        }

        button,
        .panel-inner {
            padding-left: 1.25rem;
            padding-right: 1.25rem;
        }

        .inline-shot {
            display: block;
            width: 100%;
            height: auto;
            aspect-ratio: 2.2 / 1;
            object-fit: cover;
            object-position: left top;
            margin-top: 1.4rem;
            border-radius: 0.3rem;
            border: 1px solid var(--line);
        }
    }

    /* the picture across the whole width, past the panel's padding */
    @media (max-width: 640px) {
        .inline-shot {
            width: calc(100% + 2.5rem);
            max-width: none;
            margin: 1.4rem -1.25rem 0;
            border: none;
            border-radius: 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .open .panel {
            animation: none;
        }

        .plus,
        .preview img {
            transition: none;
        }
    }
</style>

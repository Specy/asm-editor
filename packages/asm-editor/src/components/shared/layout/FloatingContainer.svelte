<script lang="ts">
    /**
     * A window floating over the middle of the page, as the Interactive editor's Testcases are
     * shown: a bar with its title, the caller's `header` and a Close button over a body on the
     * Cards' surface, in the search palette's Tray edge, over the palette's scrim, which closes it
     * when clicked. While it is open the page under it holds still (`lockPageScroll`); leaving the
     * page closes it.
     */
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import { beforeNavigate } from '$app/navigation'
    import { lockPageScroll } from '#lib/scrollLock.ts'
    import '#cmp/specific/workbench/workbench.css'
    interface Props {
        visible: boolean
        title: string
        style?: string
        header?: import('svelte').Snippet
        children?: import('svelte').Snippet
    }

    let { visible = $bindable(), title, style = '', header, children }: Props = $props()

    $effect(() => {
        if (!visible) return
        return lockPageScroll()
    })

    beforeNavigate(() => {
        if (visible) visible = false
    })
</script>

<!-- the search palette's scrim over the page; a click on it closes the window, as one beside the
     palette closes it -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="floating-backdrop" class:hidden={!visible} onclick={() => (visible = false)}></div>
<div class="floating-place" class:hidden={!visible}>
    <!-- the scrim's blur, in four bands round the window rather than under it, as the palette's:
         a blur is worked out again over its whole area whenever anything over it changes, so one
         under the window blurred the whole page in every frame of a scroll in it -->
    <div class="band band-above"></div>
    <div class="band band-left"></div>
    <div class="band band-right"></div>
    <div class="band band-below"></div>
    <!-- on the Cards' tokens (`wb-cards`), so that what it holds is drawn as in a Workbench panel -->
    <div class="floating-container wb-cards" class:hidden={!visible} {style}>
        <div class="floating-container-header">
            <div class="title">{title}</div>
            {@render header?.()}
            <IconButton
                label="Close {title}"
                onClick={() => {
                    visible = !visible
                }}
            >
                <Icon size="small">
                    <FaTimes />
                </Icon>
            </IconButton>
        </div>
        {@render children?.()}
    </div>
</div>

<style lang="scss">
    @use '../button/tray.scss';

    /* the search palette's backdrop (SearchPalette.svelte): the page dimmed by --scrim and blurred
       by 2px (the bands), over everything else on the page, the navbar and a floating Screen (10)
       too, under the prompts and toasts (20); the window, after it at the same level, over it. It
       fades with the window and lets clicks through once it starts to go */
    .floating-backdrop {
        position: fixed;
        inset: 0;
        z-index: 11;
        background-color: var(--scrim);
        opacity: 1;
        transition: opacity var(--dur-base);

        &.hidden {
            opacity: 0;
            pointer-events: none;
            animation: delayHide var(--dur-base) forwards;
        }
    }

    /* where the window sits, in the middle of the screen (of the whole width, as 50vw) and at
       least 1rem from its sides, in the middle cell of a grid whose other cells are the bands that
       blur the page round it; clicks go through to the scrim */
    .floating-place {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 11;
        display: grid;
        grid-template-columns: minmax(1rem, 1fr) auto minmax(1rem, 1fr);
        grid-template-rows: 1fr auto 1fr;
        width: 100vw;
        height: var(--screen-height);
        pointer-events: none;
    }

    /* above and below the window the whole width, beside it its height: edge to edge with it and
       with each other, never over one another or over the window, or a scroll's every frame would
       blur them again. They fade with the scrim */
    .band {
        backdrop-filter: blur(2px);
        opacity: 1;
        transition: opacity var(--dur-base);
    }

    .hidden .band {
        opacity: 0;
        animation: delayHide var(--dur-base) forwards;
    }

    .band-above {
        grid-area: 1 / 1 / 2 / 4;
    }

    .band-left {
        grid-area: 2 / 1;
    }

    .band-right {
        grid-area: 2 / 3;
    }

    .band-below {
        grid-area: 3 / 1 / 4 / 4;
    }

    /* its bar, as a floating window's: the panel's --secondary, the title in the interface's small
       text, the Tray's line between it and the body, as under the palette's box; as tall as the
       Workbench side panel's header, which holds the same Testcases summary, and its Close button
       as far from the right edge as from the top and the rule (SidePanel.svelte) */
    .floating-container-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem;
        flex: none;
        min-height: 2.2rem;
        padding: 0 calc((2.2rem - 1px - 1.8rem) / 2) 0 0.8rem;
        border-bottom: 1px solid var(--tray-line);
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-size: var(--fs-small);
    }

    .title {
        white-space: nowrap;
    }

    /* floating free over the page in the search palette's frame, a Tray's (its hairline edge,
       --r-overlay corner and --shadow-2), its body on the Cards' surface, over the bands, its
       shadow too; whatever scrolls in it keeps its scroll to itself rather than handing it on to
       the page */
    .floating-container {
        @include tray.frame;
        grid-area: 2 / 2;
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        width: 30rem;
        overflow: hidden;
        max-width: calc(100vw - 2rem);
        transform: none;
        pointer-events: auto;
        background-color: var(--wb-surface);
        color: var(--secondary-text);
        font-family: var(--font-ui);
        opacity: 1;
        transition:
            opacity var(--dur-base),
            transform var(--dur-base),
            scale var(--dur-base);
        transform-origin: top left;
        scale: 1;

        > :global(*) {
            overscroll-behavior: contain;
        }

        &.hidden {
            opacity: 0;
            scale: 1.01;
            transform: translateY(-1rem);
            animation: delayHide var(--dur-base) forwards;
        }
    }
    @keyframes delayHide {
        99% {
        }
        100% {
            visibility: hidden;
        }
    }
</style>

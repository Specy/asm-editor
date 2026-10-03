<script lang="ts">
    /**
     * The narrow column of icons always beside the Workbench: each opens its panel, and the open
     * one closes it again. Explorer, Testcases and Documentation on top, with the host's own panels;
     * the AI assistant, Share, the host's links and Settings at the bottom. Back is at its top on a
     * desktop and a tablet, which have no top bar, and in a phone's drawer. Their Save, shown while
     * the Project has unsaved changes, heads the bottom group, where appearing moves no other icon.
     */
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaSave from '~icons/fa-solid/save'
    import { useWorkbench, type RailEntry } from './workbenchContext'

    interface Props {
        withBack?: boolean
        withSave?: boolean
        /** A card of its own; a desktop's rail shares one with its open panel instead. */
        framed?: boolean
    }

    let { withBack = false, withSave = false, framed = true }: Props = $props()

    const context = useWorkbench()
    const { session, ui } = context
    const top = $derived(context.rail.filter((entry) => entry.group === 'top'))
    const bottom = $derived(context.rail.filter((entry) => entry.group === 'bottom'))

    //in a phone's drawer a tap picks the panel to show beside the rail, there being no editor
    //behind it to close back to; everywhere else the open panel's icon closes it
    function press(entry: RailEntry) {
        if (entry.action) entry.action()
        else if (ui.deviceClass === 'phone') ui.open(entry.id)
        else ui.toggle(entry.id)
    }
</script>

{#snippet railButton(entry: RailEntry)}
    {@const active = !entry.action && ui.activePanel === entry.id}
    <button
        class="rail-button"
        class:active
        title={entry.title}
        aria-label={entry.title}
        aria-pressed={entry.action ? undefined : active}
        onclick={() => press(entry)}
    >
        <Icon size={1.25}>
            <entry.icon />
        </Icon>
        {#if entry.dot}
            <span class="dot {entry.dot}"></span>
        {/if}
    </button>
{/snippet}

<nav class="icon-rail" class:framed aria-label="Workbench panels">
    {#if withBack && context.onBack}
        <button
            class="rail-button"
            title="Go back"
            aria-label="Go back"
            onclick={() => context.onBack?.()}
        >
            <Icon size={1.4}>
                <FaAngleLeft />
            </Icon>
        </button>
    {/if}
    {#each top as entry (entry.id)}
        {@render railButton(entry)}
    {/each}
    <div class="spacer"></div>
    {#if withSave && context.onSave && context.unsaved}
        <button
            class="rail-button save"
            title="Save the Project"
            aria-label="Save the Project"
            onclick={() => session.save()}
        >
            <Icon size={1.15}>
                <FaSave />
            </Icon>
        </button>
    {/if}
    {#each bottom as entry (entry.id)}
        {@render railButton(entry)}
    {/each}
</nav>

<style lang="scss">
    .icon-rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        flex: none;
        width: var(--wb-rail-width);
        padding: 0.3rem 0;
        background-color: var(--secondary);
        color: var(--secondary-text);
        /* Lines' divider is drawn inside rather than as a border, which would take its pixel from
           the rail and leave the buttons off centre */
        box-shadow: inset -1px 0 0 var(--wb-divider);
        overflow-y: auto;
        overflow-x: hidden;
    }

    .framed {
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
    }

    .spacer {
        flex: 1;
    }

    /* an icon fills the box its button gives it, whatever size it carries itself: the AI's
       sparkles are 1em of their own, a Font Awesome icon its box's width */
    .rail-button :global(svg) {
        width: 100%;
        height: 100%;
    }

    .rail-button {
        position: relative;
        display: grid;
        place-items: center;
        flex: none;
        width: 2.4rem;
        height: 2.4rem;
        /* no padding: the icon is centred in the whole button, whatever its size */
        padding: 0;
        border-radius: 0.2rem;
        background: transparent;
        color: var(--secondary-text);
        opacity: 0.75;
        cursor: pointer;
        transition:
            background-color 0.15s,
            opacity 0.15s;

        &:hover {
            opacity: 1;
            background-color: var(--tertiary);
        }

        &.active {
            opacity: 1;
            background-color: var(--accent2);
            color: var(--accent2-text);
        }

        /* the one action waiting on the person, in Build's colour rather than an open panel's */
        &.save {
            opacity: 1;
            background-color: var(--accent);
            color: var(--accent-text);
        }
    }

    .dot {
        position: absolute;
        top: 0.3rem;
        right: 0.3rem;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        border: 1px solid var(--secondary);

        &.success {
            background-color: var(--green);
        }

        &.error {
            background-color: var(--red);
        }
    }
</style>

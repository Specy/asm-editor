<script lang="ts">
    /**
     * The Workbench's cards, drawn empty while its host reads the Project it will edit: the rail,
     * the editor and the bottom panel, at the sizes the person left them and in their surface
     * style, so the Workbench appears in place of its own outline
     * ([workbench-loading-plan.md](../../../../../../docs/design/workbench-loading-plan.md), Stage
     * 1). A read that lasts says so after a second, as an example fetched over the network can.
     */
    import type { Snippet } from 'svelte'
    import { PHONE_QUERY, TABLET_QUERY, type DeviceClass } from '#lib/workbench/deviceClass.ts'
    import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import './workbench.css'

    interface Props {
        /** The host's bar above the Workbench, drawn as it will be, but inert. */
        header?: Snippet<[{ phone: boolean }]>
    }

    let { header }: Props = $props()

    /** How long a read goes unremarked: most take a few milliseconds. */
    const QUIET_MS = 1000

    /** Read once: the frame lasts as long as a read of the Project, too short to follow a resize. */
    function readDeviceClass(): DeviceClass {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return 'desktop'
        if (window.matchMedia(PHONE_QUERY).matches) return 'phone'
        return window.matchMedia(TABLET_QUERY).matches ? 'tablet' : 'desktop'
    }
    const deviceClass = readDeviceClass()
    const compact = deviceClass !== 'desktop'
    const lines = $derived(preferencesStore.values.panelStyle.value === 'lines')
    const bottomHeight = $derived(workbenchLayout.values.bottomHeight)
    let slow = $state(false)
    $effect(() => {
        const timer = setTimeout(() => (slow = true), QUIET_MS)
        return () => clearTimeout(timer)
    })
</script>

<div class="workbench-frame wb-cards" class:lines class:compact aria-busy="true" inert>
    {#if header}
        {@render header({ phone: deviceClass === 'phone' })}
    {/if}
    <div class="body">
        {#if !compact}
            <div class="card rail"></div>
        {/if}
        <div class="column">
            <div class="card editor">
                {#if slow}
                    <Spinner label="Opening the project…" />
                {/if}
            </div>
            <div class="card bottom" style:height="{bottomHeight}px"></div>
        </div>
    </div>
</div>

<style>
    .workbench-frame {
        --wb-rail-width: 3rem;
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        background-color: var(--background);
        color: var(--background-text);
    }
    .body {
        display: flex;
        flex: 1;
        min-height: 0;
        gap: var(--wb-gap);
        padding: var(--wb-gap);
    }
    .column {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        gap: var(--wb-gap);
    }
    .card {
        background-color: var(--wb-surface);
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
    }
    .rail {
        flex: none;
        width: var(--wb-rail-width);
    }
    .editor {
        display: flex;
        flex: 1;
        min-height: 0;
        justify-content: center;
        align-items: center;
        font-size: var(--fs-small);
        color: var(--hint);
    }
    .bottom {
        flex: none;
        max-height: 50%;
    }

    /* Lines: edge to edge, ruled off from each other */
    .lines {
        --wb-gap: 0px;
        --wb-radius: 0px;
        --wb-card-edge: none;
    }
    .lines .rail {
        border-right: 1px solid var(--wb-line);
    }
    .lines .bottom {
        border-top: 1px solid var(--wb-line);
    }
</style>

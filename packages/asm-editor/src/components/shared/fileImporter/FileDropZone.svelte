<script lang="ts">
    /**
     * A dashed area that says files can be dropped on the page, and the page-wide target that takes
     * them: while files from the computer are dragged over the window, an overlay covers it, and a
     * drop anywhere hands them to `onFiles`. A folder is refused, as it has no bytes to read.
     * Clicking the area opens a file picker: `onBrowse` when given, so a page with its own picker
     * shares it, and otherwise one of the area's own.
     */
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { toast } from '#stores/toastStore.ts'
    import { fade } from 'svelte/transition'
    import FaUpload from '~icons/fa-solid/upload'

    interface Props {
        title: string
        /** Supported files, shown below the title and in the drag overlay; **bold** marks keywords. */
        hint?: string
        /** What the overlay says while files are dragged over the page. */
        dropLabel?: string
        onFiles: (files: File[]) => void
        onBrowse?: () => void
    }

    let { title, hint, dropLabel = 'Drop to import', onFiles, onBrowse }: Props = $props()

    let dragging = $state(false)
    let input: HTMLInputElement | null = $state(null)
    /** Set while something on the page itself is dragged: an image dragged off it carries files too. */
    let draggingFromPage = false

    function carriesFiles(event: DragEvent) {
        return !draggingFromPage && !!event.dataTransfer?.types.includes('Files')
    }

    function over(event: DragEvent) {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.dataTransfer!.dropEffect = 'copy'
        dragging = true
    }

    //on the window, so a drop that lands before the overlay covers the page is still taken rather
    //than opened by the browser in place of the page
    function drop(event: DragEvent) {
        if (!carriesFiles(event)) return
        event.preventDefault()
        dragging = false
        const files: File[] = []
        for (const item of event.dataTransfer!.items) {
            if (item.kind !== 'file') continue
            const file = item.getAsFile()
            if (!file) continue
            if (item.webkitGetAsEntry?.()?.isDirectory) {
                toast.error(`${file.name} is a folder: drop the files in it instead`)
                continue
            }
            files.push(file)
        }
        if (files.length) onFiles(files)
    }

    //the overlay covers the window and its contents take no pointer events, so the drag leaving it
    //is the drag leaving the window, or cancelled
    function leave(event: DragEvent) {
        if (event.target === event.currentTarget) dragging = false
    }

    function picked(event: Event) {
        const target = event.currentTarget as HTMLInputElement
        const files = [...(target.files ?? [])]
        target.value = ''
        if (files.length) onFiles(files)
    }
</script>

{#snippet hintContent()}
    {#each (hint ?? '').split('**') as part, index}
        {#if index % 2 === 1}<strong>{part}</strong>{:else}{part}{/if}
    {/each}
{/snippet}

<svelte:window
    ondragstart={() => (draggingFromPage = true)}
    ondragend={() => (draggingFromPage = false)}
    ondragenter={over}
    ondragover={over}
    ondrop={drop}
/>

<button
    type="button"
    class="drop-zone"
    class:dragging
    title={hint?.replaceAll('**', '')}
    onclick={() => (onBrowse ? onBrowse() : input?.click())}
>
    <Icon size={1.8}>
        <FaUpload />
    </Icon>
    <span class="drop-zone-copy">
        <span>{title}, or <span class="browse">browse</span></span>
        {#if hint}
            <span class="drop-zone-hint">{@render hintContent()}</span>
        {/if}
    </span>
</button>
{#if !onBrowse}
    <input type="file" multiple hidden bind:this={input} onchange={picked} />
{/if}

{#if dragging}
    <div
        class="drop-overlay"
        role="presentation"
        ondragleave={leave}
        transition:fade={{ duration: 120 }}
    >
        <div class="drop-overlay-frame">
            <Icon size={2.6}>
                <FaUpload />
            </Icon>
            <div class="drop-overlay-title">{dropLabel}</div>
            {#if hint}
                <div class="drop-overlay-hint">{@render hintContent()}</div>
            {/if}
        </div>
    </div>
{/if}

<style lang="scss">
    .drop-zone {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 1rem;
        width: 100%;
        padding: 1rem;
        border: 1px dashed color-mix(in srgb, var(--hint) 35%, transparent);
        border-radius: 0.5rem;
        background-color: transparent;
        color: var(--hint);
        font: inherit;
        font-size: 0.85rem;
        text-align: left;
        cursor: pointer;
        transition:
            border-color 0.2s,
            color 0.2s;

        &:hover,
        &:focus-visible,
        &.dragging {
            border-color: color-mix(in srgb, var(--accent) 60%, transparent);
            color: var(--background-text);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
    }

    .drop-zone-copy {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 0.25rem;
        min-width: 0;
        line-height: 1.4;
    }

    .drop-zone-hint {
        font-size: 0.8rem;
        line-height: 1.5;
        opacity: 0.8;
    }

    .browse {
        text-decoration: underline;
        text-underline-offset: 0.15rem;
    }

    /* under the toasts and prompts, so what the drop did shows over it as it fades */
    .drop-overlay {
        position: fixed;
        inset: 0;
        z-index: 15;
        padding: 1rem;
        background-color: color-mix(in srgb, var(--background) 75%, transparent);
        backdrop-filter: blur(3px);
    }

    .drop-overlay-frame {
        /* inherited by everything in it, the icon's own elements too */
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 0.8rem;
        height: 100%;
        padding: 1rem;
        border: 3px dashed var(--accent);
        border-radius: 1rem;
        background-color: color-mix(in srgb, var(--accent) 8%, transparent);
        color: var(--accent);
        text-align: center;
    }

    .drop-overlay-title {
        font-size: 1.6rem;
        font-weight: bold;
    }

    .drop-overlay-hint {
        max-width: 32rem;
        color: var(--background-text);
        opacity: 0.8;
    }
</style>

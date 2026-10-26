<script lang="ts">
    import { tick, untrack } from 'svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import NumberStepper from '#cmp/shared/input/NumberStepper.svelte'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { isValidFilePath } from '#lib/projectFiles.ts'
    import { makeBmp, type PictureFormat } from '#lib/pixels/bmp.ts'
    import { newPictureFormat, startingPalette } from '#lib/pixels/palettes.ts'

    /**
     * New picture ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decision 5): a
     * name, a size and a layout, which starts on the one the Target's Screen draws with, so a
     * program loads a pixel without converting it. The picture starts black, or transparent when it
     * has an alpha channel, and opens in the Pixel editor.
     */
    interface Props {
        /** The folder it goes in, '' for the Project's root. */
        folder: string
        language: AvailableLanguages
        /** Whether a path is taken already. */
        exists: (path: string) => boolean
        /** The picture's path and bytes; false when it could not be written, keeping the dialog. */
        onCreate: (path: string, bytes: Uint8Array) => boolean
        onCancel: () => void
    }

    let { folder, language, exists, onCreate, onCancel }: Props = $props()

    const SIZE_MAX = 1024
    const join = (name: string) => (folder ? `${folder}/${name}` : name)
    /** `sprite.bmp`, else `sprite1.bmp`, `sprite2.bmp`… where the folder has it already. */
    function freeName() {
        for (let index = 0; ; index++) {
            const name = `sprite${index || ''}.bmp`
            if (!exists(join(name))) return name
        }
    }

    const screenFormat = $derived(newPictureFormat(language))
    const FORMATS: { format: PictureFormat; label: string }[] = [
        { format: 'rgb32', label: '32-bit colour' },
        { format: 'rgba32', label: '32-bit with transparency' },
        { format: 'rgb24', label: '24-bit colour' },
        { format: 'indexed8', label: '8-bit colour (3-3-2 palette)' },
        { format: 'indexed4', label: '4-bit palette (16 colours)' },
        { format: 'indexed1', label: '1-bit palette (black and white)' }
    ]

    let name = $state(freeName())
    let width = $state(16)
    let height = $state(16)
    let format = $state<PictureFormat>(untrack(() => screenFormat))
    let nameInput = $state<HTMLInputElement>()
    $effect(() => {
        void tick().then(() => {
            nameInput?.focus()
            nameInput?.setSelectionRange(0, name.lastIndexOf('.'))
        })
    })

    const path = $derived(join(name.trim()))
    const problem = $derived.by(() => {
        if (!name.trim()) return 'Enter a file name.'
        if (!isValidFilePath(path)) return 'Enter a valid file name or relative path.'
        if (exists(path)) return `A file named ${path} already exists.`
        const valid = (side: number) => Number.isInteger(side) && side >= 1 && side <= SIZE_MAX
        if (!valid(width) || !valid(height))
            return `Width and height must be whole numbers from 1 to ${SIZE_MAX} pixels.`
        return undefined
    })

    function create() {
        if (problem) return
        onCreate(path, makeBmp({ width, height, format, palette: startingPalette(format) }))
    }
</script>

<!-- Escape anywhere in the form closes it, as it closes the app's prompts -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
    class="new-picture"
    aria-label="New picture"
    onsubmit={(event) => {
        event.preventDefault()
        create()
    }}
    onkeydown={(event) => {
        if (event.key === 'Escape') onCancel()
    }}
>
    <div class="title">New picture{folder ? ` in ${folder}` : ''}</div>
    <label class="row">
        <span>File name</span>
        <input type="text" bind:value={name} bind:this={nameInput} spellcheck="false" />
    </label>
    <div class="row">
        <span>Size</span>
        <div class="size">
            <NumberStepper min={1} max={SIZE_MAX} ariaLabel="Width" bind:value={width} />
            ×
            <NumberStepper min={1} max={SIZE_MAX} ariaLabel="Height" bind:value={height} />
            px
        </div>
    </div>
    <div class="row">
        <span>Format</span>
        <Select
            options={FORMATS.map((entry) => ({
                key: entry.format === screenFormat ? `${entry.label} · default` : entry.label,
                searchText: entry.label,
                value: entry.format
            }))}
            value={format}
            ariaLabel="Pixel format"
            title="How each pixel's colour is stored in the BMP file"
            wrapperStyle="min-width: 0; flex: 1"
            onChange={(value) => (format = value)}
        />
    </div>
    <p class="hint" role={problem ? 'alert' : undefined}>
        {problem ??
            (format === screenFormat
                ? 'Default format for this instruction set. BMP pixel rows are stored from top to bottom.'
                : 'Creates a BMP image with pixel rows stored from top to bottom.')}
    </p>
    <div class="buttons">
        <button type="button" class="tool" onclick={onCancel}>Cancel</button>
        <button type="submit" class="tool primary" disabled={!!problem}>Create</button>
    </div>
</form>

<style lang="scss">
    /* drawn as the app's prompts are, a tray floating at the top of the page */
    .new-picture {
        --tray-line: color-mix(in srgb, var(--tertiary) 60%, transparent);
        position: fixed;
        top: 1rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 20;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        width: min(24rem, calc(100vw - 2rem));
        padding: 0.7rem;
        border: 1px solid var(--tray-line);
        border-radius: 0.6rem;
        background-color: color-mix(in srgb, var(--primary) 85%, transparent);
        backdrop-filter: blur(4px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        color: var(--primary-text);
        font-size: 0.9rem;
    }
    .title {
        font-weight: 500;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 0.6rem;

        > span {
            width: 3.6rem;
            flex-shrink: 0;
            opacity: 0.8;
        }
    }
    input {
        height: 2rem;
        padding: 0 0.5rem;
        border: 1px solid var(--tray-line);
        border-radius: 0.4rem;
        background: var(--secondary);
        color: var(--secondary-text);
        font: inherit;
    }
    input[type='text'] {
        flex: 1;
        min-width: 0;
    }
    /* the steppers in the name field's colours, as on --primary they vanish into the tray */
    .size {
        --stepper-background: var(--secondary);
        --stepper-text: var(--secondary-text);
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .hint {
        margin: 0;
        font-size: 0.8rem;
        opacity: 0.75;
    }
    .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.2rem;
        height: 2.1rem;
    }
    .tool {
        padding: 0 0.9rem;
        border: none;
        border-radius: 0.4rem;
        background: transparent;
        color: var(--primary-text);
        font: inherit;
        font-weight: 500;
        cursor: pointer;

        &:hover:not(:disabled) {
            background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        &:disabled {
            opacity: 0.5;
            cursor: default;
        }
    }
    .primary {
        min-width: 4.5rem;
        background-color: var(--accent);
        color: var(--accent-text);

        &:hover:not(:disabled) {
            background-color: color-mix(in srgb, var(--accent) 85%, white);
        }
    }
</style>

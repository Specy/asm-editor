<script lang="ts">
    import type { FilePreview } from '#lib/fileKinds.ts'
    import { fileByteLength, fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
    import { blobDownloader } from '#lib/utils.ts'
    import FaDownload from '~icons/fa-solid/download'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import FaExpand from '~icons/fa-solid/expand'
    import FaFilePdf from '~icons/fa-solid/file-pdf'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FileStatusLine, { byteCount } from '../FileStatusLine.svelte'
    import { formatDuration, pdfDisplay, PREVIEW_UNAVAILABLE } from './previewSupport'

    /**
     * The **Preview** of a byte File ([file-views.md](../../../../../../../docs/design/file-views.md),
     * decision 14): the browser's own view of an image, a PDF, audio or video, from a Blob URL of
     * the File's bytes, typed as the signature its first bytes matched and
     * never as its name suggests, so a File is never shown as a web page. Where the browser cannot
     * show it after all, `onUnavailable` asks the pane for the Hex editor instead, with a note.
     */
    interface Props {
        path: string
        file: ProjectFile
        kind: FilePreview
        /** The browser could not show the File at `path` as its kind; the note says so. */
        onUnavailable?: (path: string, note: string) => void
        /**
         * Whether the execution dock floats over the pane's bottom edge, which an image, audio or
         * video leaves room for; a PDF's frame runs under it.
         */
        dockInset?: boolean
    }

    let { path, file, kind, onUnavailable, dockInset = false }: Props = $props()

    const name = $derived(path.slice(path.lastIndexOf('/') + 1))
    const size = $derived(fileByteLength(file))
    /** How a PDF is shown here; a navigator does not change while the page is open. */
    const pdf = typeof navigator === 'undefined' ? 'tab' : pdfDisplay(navigator)

    /**
     * The File's bytes as a Blob URL, made again when its bytes, its type or the pane's File
     * change, the last one revoked: a Blob URL holds its bytes until it is. It follows the content
     * rather than the record, which the pane reads from the Project's map of Files, new at a change
     * to any other File: that would reload a PDF at its first page and a video at its start.
     */
    const content = $derived(file.content)
    const encoding = $derived(file.encoding)
    const mime = $derived(kind.mime)
    let source = $state.raw<{ url: string; blob: Blob }>()
    $effect(() => {
        void path
        const bytes = fileBytes({ encoding, content })
        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime })
        const url = URL.createObjectURL(blob)
        source = { url, blob }
        return () => URL.revokeObjectURL(url)
    })

    /** An image at its own size rather than fitted to the pane. */
    let actualSize = $state(false)
    /** What the browser found once it had read the File: its size in pixels, its length. */
    let dimensions = $state.raw<{ width: number; height: number }>()
    let duration = $state<number>()
    /**
     * How wide the image is drawn, which fitted to the pane is less than its own width in a smaller
     * pane and more in a larger one.
     */
    let shownWidth = $state(0)
    const scale = $derived(
        dimensions?.width && shownWidth ? Math.round((shownWidth / dimensions.width) * 100) : 100
    )
    /** Drawn larger than its own size, where its pixels stay square rather than blurred. */
    const enlarged = $derived(!!dimensions?.width && shownWidth > dimensions.width)

    function imageLoaded(event: Event) {
        const image = event.currentTarget as HTMLImageElement
        dimensions = { width: image.naturalWidth, height: image.naturalHeight }
    }

    /** A failure of the current URL only: one replaced by newer bytes is no answer about them. */
    function failed(event: Event, note: string) {
        if ((event.currentTarget as HTMLImageElement | HTMLMediaElement).src !== source?.url) return
        onUnavailable?.(path, note)
    }

    function openInTab() {
        if (source) window.open(source.url, '_blank')
    }
    function download() {
        if (source) blobDownloader(source.blob, name)
    }
</script>

<div class="file-preview" class:dock-inset={dockInset} aria-label="Preview of {path}" role="region">
    <FileStatusLine tools={kind.preview === 'image' ? actualSizeTool : undefined}>
        {#snippet facts()}
            <span class="fact mime">{kind.mime}</span>
            {#if dimensions}
                <span class="fact">{dimensions.width} × {dimensions.height} px</span>
            {/if}
            {#if kind.preview === 'image' && !actualSize && scale !== 100}
                <span class="fact" {@attach tooltip('The image is fitted to the pane')}
                    >shown at {scale}%</span
                >
            {/if}
            {#if duration !== undefined && formatDuration(duration)}
                <span class="fact">{formatDuration(duration)}</span>
            {/if}
            <span class="fact">{byteCount(size)}</span>
        {/snippet}
    </FileStatusLine>
    {#snippet actualSizeTool()}
        <!-- named as its words, which a narrow pane drops -->
        <button
            type="button"
            class="tool"
            aria-label="Actual size"
            {@attach tooltip(
                actualSize
                    ? 'Fit the image to the pane'
                    : 'Show the image at its own size, a pixel for a pixel'
            )}
            aria-pressed={actualSize}
            onclick={() => (actualSize = !actualSize)}
        >
            <FaExpand /><span>Actual size</span>
        </button>
    {/snippet}
    <div class="preview-body {kind.preview}" class:actual-size={actualSize}>
        {#if source}
            {#if kind.preview === 'image'}
                <img
                    src={source.url}
                    alt={name}
                    class:enlarged
                    style:--aspect={dimensions?.height
                        ? dimensions.width / dimensions.height
                        : null}
                    bind:clientWidth={shownWidth}
                    onload={imageLoaded}
                    onerror={(event) => failed(event, PREVIEW_UNAVAILABLE.image)}
                />
            {:else if kind.preview === 'pdf'}
                {#if pdf === 'frame'}
                    <!-- no `sandbox`: it stops Chrome's PDF viewer, and the type is always a PDF's -->
                    <iframe src={source.url} title="{name}, a PDF"></iframe>
                {:else}
                    <div class="pdf-notice" role="note">
                        <span class="pdf-icon" aria-hidden="true"><FaFilePdf /></span>
                        <p>
                            {pdf === 'first-page'
                                ? 'This browser shows only the first page of a PDF inside the page.'
                                : 'This browser cannot show a PDF inside the page.'}
                        </p>
                        <div class="pdf-actions">
                            <button type="button" class="action primary" onclick={openInTab}>
                                <FaExternalLinkAlt />Open in a new tab
                            </button>
                            <button type="button" class="action" onclick={download}>
                                <FaDownload />Download
                            </button>
                        </div>
                    </div>
                {/if}
            {:else if kind.preview === 'audio'}
                <audio
                    controls
                    src={source.url}
                    onloadedmetadata={(event) => (duration = event.currentTarget.duration)}
                    onerror={(event) => failed(event, PREVIEW_UNAVAILABLE.audio)}
                ></audio>
            {:else}
                <!-- a File's video comes with no captions to give it -->
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                    controls
                    src={source.url}
                    onloadedmetadata={(event) => {
                        duration = event.currentTarget.duration
                        dimensions = {
                            width: event.currentTarget.videoWidth,
                            height: event.currentTarget.videoHeight
                        }
                    }}
                    onerror={(event) => failed(event, PREVIEW_UNAVAILABLE.video)}
                ></video>
            {/if}
        {/if}
    </div>
</div>

<style lang="scss">
    .file-preview {
        --preview-line: var(--wb-line, color-mix(in srgb, var(--tertiary) 60%, transparent));
        /* the execution dock's tray and the gap under it, which the Preview keeps clear of */
        --dock-room: 0px;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        background: var(--secondary);
        color: var(--secondary-text);
    }
    .dock-inset {
        --dock-room: calc(var(--wb-control-height, 2.6rem) + 0.75rem);
    }
    .mime {
        font-family: monospace;
    }
    /* one button, which keeps its words in a narrower pane than the Hex editor's three */
    @container file-status (max-width: 22rem) {
        .tool span {
            display: none;
        }
    }

    .preview-body {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 1rem 1rem calc(1rem + var(--dock-room));
    }
    /* the auto margins centre an image or a video without pushing one wider than the pane off its
       left edge, as centring the row would */
    img,
    video {
        margin: auto;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    /* fitted, an image fills the pane's width or its height, whichever it reaches first, so a small
       one grows as well as a large one shrinks; at its own size it scrolls. The pane is a size
       container, so 100cqw and 100cqh are the room inside its padding */
    .image {
        container-type: size;
    }
    .image:not(.actual-size) img {
        width: min(100cqw, 100cqh * var(--aspect));
    }
    .actual-size img {
        max-width: none;
        max-height: none;
    }
    /* as the Screen does, so a sprite sheet drawn larger reads as its pixels */
    img.enlarged {
        image-rendering: pixelated;
    }
    /* transparent pixels over a checkerboard in the pane's own two shades, so they read in either
       theme */
    img {
        --check: color-mix(in srgb, var(--secondary-text) 12%, var(--secondary));
        background-color: var(--secondary);
        background-image: conic-gradient(
            var(--check) 25%,
            transparent 0 50%,
            var(--check) 0 75%,
            transparent 0
        );
        background-size: 1rem 1rem;
        box-shadow: 0 0 0 1px var(--preview-line);
    }
    /* the frame runs to the pane's bottom edge, as the code editor does, with the dock floating over
       the viewer: room left above the dock showed as a strip of the pane under the PDF */
    .pdf {
        padding: 0;
    }
    iframe {
        flex: 1;
        width: 100%;
        min-height: 0;
        border: none;
        background: var(--secondary);
    }
    .pdf-notice {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
        margin: auto;
        max-width: 30rem;
        text-align: center;
    }
    .pdf-notice p {
        margin: 0;
        opacity: 0.8;
    }
    .pdf-icon {
        display: grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        color: var(--accent);

        :global(svg) {
            width: 1.3rem;
            height: 1.3rem;
        }
    }
    /* the player alone, centred in the pane: the status line above already names its type */
    audio {
        margin: auto;
        width: min(32rem, 100%);
    }
    .pdf-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
    }
    .action {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        height: 2.2rem;
        padding: 0 0.9rem;
        border: 1px solid var(--preview-line);
        border-radius: 0.4rem;
        background: var(--primary);
        color: var(--primary-text);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;

        :global(svg) {
            width: 0.8rem;
            height: 0.8rem;
        }
        &:hover {
            background: color-mix(in srgb, var(--tertiary) 55%, var(--primary));
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
    }
    .action.primary {
        border-color: transparent;
        background: var(--accent);
        color: var(--accent-text);

        &:hover {
            background: color-mix(in srgb, var(--accent) 85%, white);
        }
    }
</style>

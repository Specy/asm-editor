<script lang="ts">
    import type { FilePreview } from '#lib/fileKinds.ts'
    import { fileByteLength, type ProjectFile } from '#lib/projectFiles.ts'
    import { fileKindLabel } from '../fileViewNotice'

    /**
     * Where a byte File the browser can show is previewed: an image, a PDF, audio or video
     * ([file-views.md](../../../../../../../docs/design/file-views.md), decision 14). Until the
     * Preview itself exists, a notice of what the File is.
     */
    let { path, file, kind }: { path: string; file: ProjectFile; kind: FilePreview } = $props()
    const size = $derived(fileByteLength(file))
    const description = $derived(
        `${path}: ${size.toLocaleString('en-US')} ${size === 1 ? 'byte' : 'bytes'}, ${fileKindLabel(kind)}.`
    )
</script>

<div class="file-view-notice" role="status" aria-label="Preview">
    <h2>Preview</h2>
    <p>{description}</p>
</div>

<style lang="scss">
    .file-view-notice {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        min-width: 0;
        padding: 2rem;
        color: var(--secondary-text);
        background: var(--secondary);
        text-align: center;
    }
    p {
        max-width: 30rem;
        opacity: 0.72;
        overflow-wrap: anywhere;
    }
</style>

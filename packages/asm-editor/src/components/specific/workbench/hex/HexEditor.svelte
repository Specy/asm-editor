<script lang="ts">
    import type { ProjectFileKind } from '#lib/fileKinds.ts'
    import { fileByteLength, type ProjectFile } from '#lib/projectFiles.ts'
    import { fileKindLabel } from '../fileViewNotice'

    /**
     * Where a byte File is shown in the Hex editor
     * ([file-views.md](../../../../../../../docs/design/file-views.md), decisions 7 and 9). Until the
     * editor itself exists, a notice of what the File is.
     */
    let { path, file, kind }: { path: string; file: ProjectFile; kind: ProjectFileKind } = $props()
    const size = $derived(fileByteLength(file))
    const description = $derived(
        `${path}: ${size.toLocaleString('en-US')} ${size === 1 ? 'byte' : 'bytes'}, ${fileKindLabel(kind)}.`
    )
</script>

<div class="file-view-notice" role="status" aria-label="Hex editor">
    <h2>Hex editor</h2>
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

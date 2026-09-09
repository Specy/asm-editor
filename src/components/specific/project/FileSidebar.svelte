<script lang="ts">
    import FileImporter from '$cmp/shared/fileImporter/FileImporter.svelte'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import { fileBytes, type ProjectFiles } from '$lib/projectFiles'
    import { blobDownloader } from '$lib/utils'
    import { Prompt } from '$stores/promptStore.svelte'
    import { toast } from '$stores/toastStore'
    import FaBars from '~icons/fa-solid/bars'
    import FaDownload from '~icons/fa-solid/download'
    import FaFile from '~icons/fa-solid/file'
    import FaFolder from '~icons/fa-solid/folder'
    import FaPen from '~icons/fa-solid/pen'
    import FaPlus from '~icons/fa-solid/plus'
    import FaTrash from '~icons/fa-solid/trash'
    import FaUpload from '~icons/fa-solid/upload'
    import FaTimes from '~icons/fa-solid/times'

    type TreeRow = { path: string; name: string; depth: number; directory: boolean }

    interface Props {
        files: ProjectFiles
        entry: string
        fileSystem: FileSystem
        selectedPath: string
        locked?: boolean
        open?: boolean
        onSelect: (path: string) => void
        onEntryChange: (path: string) => void
        onRenamed?: (from: string, to: string) => void
        onDeleted?: (path: string) => void
    }

    let {
        files,
        entry,
        fileSystem,
        selectedPath,
        locked = false,
        open = $bindable(false),
        onSelect,
        onEntryChange,
        onRenamed,
        onDeleted
    }: Props = $props()

    const rows = $derived(makeTreeRows(files))
    const selectedFile = $derived(files[selectedPath])

    function basename(path: string): string {
        const parts = path.split('/')
        return parts[parts.length - 1] ?? path
    }

    function makeTreeRows(currentFiles: ProjectFiles): TreeRow[] {
        const directories: Record<string, true> = Object.create(null)
        for (const path of Object.keys(currentFiles)) {
            const parts = path.split('/')
            for (let index = 1; index < parts.length; index++) {
                directories[parts.slice(0, index).join('/')] = true
            }
        }
        return [
            ...Object.keys(directories).map((path) => ({
                path,
                name: basename(path),
                depth: path.split('/').length - 1,
                directory: true
            })),
            ...Object.keys(currentFiles).map((path) => ({
                path,
                name: basename(path),
                depth: path.split('/').length - 1,
                directory: false
            }))
        ].sort((a, b) => {
            const aParts = a.path.split('/')
            const bParts = b.path.split('/')
            for (let index = 0; index < Math.min(aParts.length, bParts.length); index++) {
                const comparison = aParts[index].localeCompare(bParts[index])
                if (comparison !== 0) return comparison
            }
            return aParts.length - bParts.length
        })
    }

    function reportFailure(error: unknown) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'File operation failed')
    }

    async function createFile() {
        const path = await Prompt.askText('Path for the new text file', true, 'src/new.asm')
        if (!path) return
        try {
            fileSystem.writeText(path.trim(), '', false)
            onSelect(path.trim())
        } catch (error) {
            reportFailure(error)
        }
    }

    async function renameFile() {
        if (!selectedFile) return
        const path = await Prompt.askText(`Rename or move ${selectedPath} to:`, true, selectedPath)
        if (!path || path.trim() === selectedPath) return
        try {
            const previousPath = selectedPath
            fileSystem.rename(previousPath, path.trim())
            onRenamed?.(previousPath, path.trim())
            onSelect(path.trim())
        } catch (error) {
            reportFailure(error)
        }
    }

    async function deleteFile() {
        if (!selectedFile) return
        if (!(await Prompt.confirm(`Delete ${selectedPath}?`))) return
        try {
            const previousPath = selectedPath
            fileSystem.remove(previousPath)
            onDeleted?.(previousPath)
            onSelect(Object.keys(fileSystem.files)[0] ?? entry)
        } catch (error) {
            reportFailure(error)
        }
    }

    async function uploadFile(file: File, data: ArrayBuffer) {
        const path = file.name
        try {
            if (files[path]) {
                const replace = await Prompt.confirm(`${path} already exists. Replace it?`)
                if (!replace) return
            }
            fileSystem.writeBytes(path, new Uint8Array(data), true)
            onSelect(path)
        } catch (error) {
            reportFailure(error)
        }
    }

    function downloadFile() {
        if (!selectedFile) return
        const bytes = fileBytes(selectedFile)
        const contents = new Uint8Array(bytes).buffer
        blobDownloader(new Blob([contents]), basename(selectedPath))
    }
</script>

<button
    class="files-toggle"
    class:open
    title="Project files"
    aria-label="Project files"
    aria-expanded={open}
    onclick={() => (open = !open)}
>
    {#if open}<FaTimes />{:else}<FaBars />{/if}
</button>

{#if open}
    <aside class="file-sidebar" aria-label="Project files">
        <div class="sidebar-heading">
            <strong>Files</strong>
            <span>{Object.keys(files).length} / 4,096</span>
        </div>
        <div class="entry-path" class:missing={!files[entry]} title={entry}>
            Entry: {entry}{files[entry] ? '' : ' (missing)'}
        </div>

        <div class="file-tree">
            {#if rows.length === 0}
                <div class="empty">No files</div>
            {/if}
            {#each rows as row (row.directory ? `directory:${row.path}` : `file:${row.path}`)}
                {#if row.directory}
                    <div
                        class="tree-row directory"
                        style:padding-left={`${0.55 + row.depth * 0.85}rem`}
                    >
                        <FaFolder />
                        <span class="ellipsis">{row.name}</span>
                    </div>
                {:else}
                    <button
                        class="tree-row file"
                        class:selected={row.path === selectedPath}
                        class:entry={row.path === entry}
                        style:padding-left={`${0.55 + row.depth * 0.85}rem`}
                        title={row.path}
                        onclick={() => onSelect(row.path)}
                    >
                        <FaFile />
                        <span class="ellipsis">{row.name}</span>
                        {#if row.path === entry}<span class="entry-mark">Entry</span>{/if}
                    </button>
                {/if}
            {/each}
        </div>

        <div class="file-actions">
            <button disabled={locked} title="Create text file" onclick={createFile}
                ><FaPlus /></button
            >
            <FileImporter
                as="buffer"
                on:import={(event) => {
                    if (event.detail.data instanceof ArrayBuffer) {
                        void uploadFile(event.detail.file, event.detail.data)
                    }
                }}
            >
                <button disabled={locked} title="Upload file"><FaUpload /></button>
            </FileImporter>
            <button disabled={locked || !selectedFile} title="Rename or move" onclick={renameFile}
                ><FaPen /></button
            >
            <button disabled={!selectedFile} title="Download exact bytes" onclick={downloadFile}
                ><FaDownload /></button
            >
            <button disabled={locked || !selectedFile} title="Delete" onclick={deleteFile}
                ><FaTrash /></button
            >
        </div>

        <button
            class="set-entry"
            disabled={locked || !selectedFile || selectedPath === entry}
            onclick={() => onEntryChange(selectedPath)}
        >
            {selectedPath === entry ? 'Selected file is Entry' : 'Use selected file as Entry'}
        </button>
        {#if locked}
            <div class="locked-note">File changes are owned by the program until Stop.</div>
        {/if}
    </aside>
{/if}

<style lang="scss">
    .files-toggle {
        position: absolute;
        z-index: 5;
        top: 0.7rem;
        left: 0.7rem;
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        padding: 0.5rem;
        border: 0;
        border-radius: 0.35rem;
        color: var(--secondary-text);
        background: var(--secondary);
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
        cursor: pointer;

        &.open {
            left: min(18.1rem, calc(100% - 2.8rem));
        }
    }

    .file-sidebar {
        position: absolute;
        z-index: 4;
        inset: 0.45rem auto 0.45rem 0.45rem;
        display: flex;
        flex-direction: column;
        width: min(17.5rem, calc(100% - 1rem));
        min-height: 0;
        padding: 0.6rem;
        border: 1px solid var(--tertiary);
        border-radius: 0.45rem;
        color: var(--secondary-text);
        background: color-mix(in srgb, var(--secondary) 96%, transparent);
        box-shadow: 0 4px 18px rgb(0 0 0 / 0.35);
        backdrop-filter: blur(0.35rem);
    }

    .sidebar-heading {
        display: flex;
        justify-content: space-between;
        padding-right: 2.2rem;

        span {
            opacity: 0.65;
            font-size: 0.75rem;
        }
    }

    .entry-path,
    .locked-note {
        margin-top: 0.35rem;
        font-size: 0.75rem;
        opacity: 0.75;
        overflow-wrap: anywhere;
    }

    .entry-path.missing {
        color: var(--red);
        opacity: 1;
    }

    .file-tree {
        flex: 1;
        min-height: 4rem;
        margin: 0.55rem 0;
        padding: 0.25rem 0;
        overflow: auto;
        border-block: 1px solid var(--tertiary);
    }

    .tree-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        width: 100%;
        min-width: 0;
        height: 1.8rem;
        padding-right: 0.4rem;
        border: 0;
        border-radius: 0.25rem;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 0.82rem;
        text-align: left;

        svg {
            flex: none;
            width: 0.8rem;
        }
    }

    button.tree-row {
        cursor: pointer;

        &:hover,
        &.selected {
            background: var(--tertiary);
        }

        &.entry svg {
            color: var(--accent);
        }
    }

    .directory {
        opacity: 0.72;
        font-size: 0.77rem;
    }

    .entry-mark {
        margin-left: auto;
        color: var(--accent);
        font-size: 0.65rem;
    }

    .empty {
        padding: 0.8rem;
        text-align: center;
        opacity: 0.65;
    }

    .file-actions {
        display: flex;
        gap: 0.3rem;

        button {
            display: grid;
            place-items: center;
            width: 2rem;
            height: 2rem;
            padding: 0.5rem;
            border: 0;
            border-radius: 0.3rem;
            color: var(--secondary-text);
            background: var(--tertiary);
            cursor: pointer;
        }

        button:disabled {
            cursor: not-allowed;
            opacity: 0.35;
        }
    }

    .set-entry {
        margin-top: 0.45rem;
        padding: 0.45rem;
        border: 0;
        border-radius: 0.3rem;
        color: var(--accent-text);
        background: var(--accent);
        cursor: pointer;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    }
</style>

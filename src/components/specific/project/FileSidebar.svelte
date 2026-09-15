<script lang="ts">
    import FileImporter from '$cmp/shared/fileImporter/FileImporter.svelte'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import { fileBytes, type ProjectFiles } from '$lib/projectFiles'
    import { blobDownloader } from '$lib/utils'
    import { Prompt } from '$stores/promptStore.svelte'
    import { toast } from '$stores/toastStore'
    import { untrack } from 'svelte'
    import { SvelteSet } from 'svelte/reactivity'
    import { fly } from 'svelte/transition'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import FaDownload from '~icons/fa-solid/download'
    import FaFile from '~icons/fa-solid/file'
    import FaFlag from '~icons/fa-solid/flag'
    import FaFolder from '~icons/fa-solid/folder'
    import FaMinus from '~icons/fa-solid/minus'
    import FaPen from '~icons/fa-solid/pen'
    import FaPlus from '~icons/fa-solid/plus'
    import FaTrash from '~icons/fa-solid/trash'
    import FaUpload from '~icons/fa-solid/upload'
    import FaTimes from '~icons/fa-solid/times'
    import IcRoundViewSidebar from '~icons/ic/round-view-sidebar'

    type TreeNode = {
        path: string
        name: string
        directory: boolean
        children: TreeNode[]
    }
    type TreeRow = Omit<TreeNode, 'children'> & { depth: number; expanded: boolean }

    interface Props {
        name?: string
        files: ProjectFiles
        entry: string
        fileSystem: FileSystem
        selectedPath: string
        locked?: boolean
        diagnosticCounts?: Readonly<Record<string, { errors: number; warnings: number }>>
        analysisStatus?: Readonly<
            Record<string, 'assembled' | 'not-reachable' | 'binary' | 'unknown'>
        >
        open?: boolean
        onSelect: (path: string) => void
        onEntryChange: (path: string) => void
        onRenamed?: (from: string, to: string) => void
        onDeleted?: (path: string) => void
    }

    let {
        name = 'Project',
        files,
        entry,
        fileSystem,
        selectedPath,
        locked = false,
        diagnosticCounts = {},
        analysisStatus = {},
        open = $bindable(false),
        onSelect,
        onEntryChange,
        onRenamed,
        onDeleted
    }: Props = $props()

    const collapsedDirectories = new SvelteSet<string>()
    let projectExpanded = $state(true)
    const rows = $derived(makeTreeRows(files, collapsedDirectories))
    const directories = $derived(directoryPaths(files))

    $effect(() => {
        const path = selectedPath
        if (!open) return
        untrack(() => expandParents(path))
    })

    function basename(path: string): string {
        const parts = path.split('/')
        return parts[parts.length - 1] ?? path
    }

    function makeTreeRows(currentFiles: ProjectFiles, collapsed: ReadonlySet<string>): TreeRow[] {
        const root: TreeNode = { path: '', name: '', directory: true, children: [] }
        for (const path of Object.keys(currentFiles)) {
            let parent = root
            const parts = path.split('/')
            for (let index = 0; index < parts.length; index++) {
                const directory = index < parts.length - 1
                const nodePath = parts.slice(0, index + 1).join('/')
                let node = parent.children.find(
                    (child) => child.path === nodePath && child.directory === directory
                )
                if (!node) {
                    node = {
                        path: nodePath,
                        name: parts[index],
                        directory,
                        children: []
                    }
                    parent.children.push(node)
                }
                parent = node
            }
        }

        const rows: TreeRow[] = []
        const visit = (nodes: TreeNode[], depth: number) => {
            nodes.sort((a, b) => {
                if (a.directory !== b.directory) return a.directory ? -1 : 1
                return a.name.localeCompare(b.name)
            })
            for (const node of nodes) {
                const expanded = node.directory && !collapsed.has(node.path)
                rows.push({
                    path: node.path,
                    name: node.name,
                    depth,
                    directory: node.directory,
                    expanded
                })
                if (expanded) visit(node.children, depth + 1)
            }
        }
        visit(root.children, 0)
        return rows
    }

    function directoryPaths(currentFiles: ProjectFiles): string[] {
        const paths = new SvelteSet<string>()
        for (const path of Object.keys(currentFiles)) {
            const parts = path.split('/')
            for (let index = 1; index < parts.length; index++) {
                paths.add(parts.slice(0, index).join('/'))
            }
        }
        return [...paths]
    }

    function expandParents(path: string) {
        const parts = path.split('/')
        for (let index = 1; index < parts.length; index++) {
            collapsedDirectories.delete(parts.slice(0, index).join('/'))
        }
    }

    function toggleDirectory(path: string) {
        if (collapsedDirectories.has(path)) collapsedDirectories.delete(path)
        else collapsedDirectories.add(path)
    }

    function collapseAll() {
        for (const path of directories) collapsedDirectories.add(path)
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
            expandParents(path.trim())
            onSelect(path.trim())
        } catch (error) {
            reportFailure(error)
        }
    }

    async function renameFile(targetPath = selectedPath) {
        if (!files[targetPath]) return
        const path = await Prompt.askText(`Rename or move ${targetPath} to:`, true, targetPath)
        if (!path || path.trim() === targetPath) return
        try {
            const previousPath = targetPath
            fileSystem.rename(previousPath, path.trim())
            expandParents(path.trim())
            onRenamed?.(previousPath, path.trim())
            onSelect(path.trim())
        } catch (error) {
            reportFailure(error)
        }
    }

    async function deleteFile(targetPath = selectedPath) {
        if (!files[targetPath]) return
        if (!(await Prompt.confirm(`Delete ${targetPath}?`))) return
        try {
            const previousPath = targetPath
            fileSystem.remove(previousPath)
            onDeleted?.(previousPath)
            if (previousPath === selectedPath) {
                onSelect(Object.keys(fileSystem.files)[0] ?? entry)
            }
        } catch (error) {
            reportFailure(error)
        }
    }

    async function uploadFile(file: File, data: ArrayBuffer) {
        if (locked) return
        const path = file.name
        try {
            if (files[path]) {
                const replace = await Prompt.confirm(`${path} already exists. Replace it?`)
                if (!replace) return
            }
            fileSystem.writeBytes(path, new Uint8Array(data), true)
            expandParents(path)
            onSelect(path)
        } catch (error) {
            reportFailure(error)
        }
    }

    function downloadFile(targetPath = selectedPath) {
        const file = files[targetPath]
        if (!file) return
        const bytes = fileBytes(file)
        const contents = new Uint8Array(bytes).buffer
        blobDownloader(new Blob([contents]), basename(targetPath))
    }
</script>

{#if !open}
    <button
        class="files-toggle"
        title="Open Explorer"
        aria-label="Open Explorer"
        aria-expanded="false"
        onclick={() => (open = true)}
    >
        <IcRoundViewSidebar />
    </button>
{/if}

{#if open}
    <div class="file-sidebar-viewport">
        <aside
            class="file-sidebar"
            aria-label="Project Explorer"
            in:fly={{ x: 320, opacity: 0, duration: 320 }}
            out:fly={{ x: 320, opacity: 0, duration: 260 }}
        >
            <header class="explorer-heading">
                <span>EXPLORER</span>
                <button
                    class="icon-action close"
                    title="Close Explorer"
                    onclick={() => (open = false)}
                >
                    <FaTimes />
                </button>
            </header>

            <section class="explorer-section">
                <div class="section-heading">
                    <button
                        class="section-toggle"
                        aria-expanded={projectExpanded}
                        onclick={() => (projectExpanded = !projectExpanded)}
                    >
                        <span class="disclosure" class:expanded={projectExpanded}>
                            <FaAngleRight />
                        </span>
                        <strong title={name}>{name.trim() || 'Project'}</strong>
                    </button>
                    <div class="section-actions">
                        <button
                            class="icon-action"
                            disabled={locked}
                            title="New text file"
                            onclick={createFile}
                        >
                            <FaPlus />
                        </button>
                        <FileImporter
                            as="buffer"
                            on:import={(event) => {
                                if (event.detail.data instanceof ArrayBuffer) {
                                    void uploadFile(event.detail.file, event.detail.data)
                                }
                            }}
                        >
                            <button class="icon-action" disabled={locked} title="Upload file">
                                <FaUpload />
                            </button>
                        </FileImporter>
                        <button
                            class="icon-action"
                            disabled={directories.length === 0}
                            title="Collapse folders"
                            onclick={collapseAll}
                        >
                            <FaMinus />
                        </button>
                    </div>
                </div>

                {#if projectExpanded}
                    {#if !files[entry]}
                        <div class="entry-warning" title={entry}>Entry missing: {entry}</div>
                    {/if}
                    <div class="file-tree">
                        {#if rows.length === 0}
                            <div class="empty">This Project has no files.</div>
                        {/if}
                        {#each rows as row (row.directory ? `directory:${row.path}` : `file:${row.path}`)}
                            {#if row.directory}
                                <button
                                    class="tree-row directory"
                                    style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                                    title={row.path}
                                    aria-expanded={row.expanded}
                                    onclick={() => toggleDirectory(row.path)}
                                >
                                    <span class="disclosure" class:expanded={row.expanded}>
                                        <FaAngleRight />
                                    </span>
                                    <span class="file-icon folder"><FaFolder /></span>
                                    <span class="ellipsis">{row.name}</span>
                                </button>
                            {:else}
                                <div
                                    class="tree-row file"
                                    class:selected={row.path === selectedPath}
                                    class:entry={row.path === entry}
                                    class:binary={files[row.path]?.encoding === 'base64'}
                                    title={row.path}
                                >
                                    <button
                                        class="file-select"
                                        style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                                        onclick={() => onSelect(row.path)}
                                    >
                                        <span class="disclosure-spacer"></span>
                                        <span class="file-icon"><FaFile /></span>
                                        <span class="ellipsis">{row.name}</span>
                                        {#if diagnosticCounts[row.path]?.errors}
                                            <span
                                                class="diagnostic-count error"
                                                title={`${diagnosticCounts[row.path].errors} error${diagnosticCounts[row.path].errors === 1 ? '' : 's'}`}
                                                >{diagnosticCounts[row.path].errors}</span
                                            >
                                        {/if}
                                        {#if diagnosticCounts[row.path]?.warnings}
                                            <span
                                                class="diagnostic-count warning"
                                                title={`${diagnosticCounts[row.path].warnings} warning${diagnosticCounts[row.path].warnings === 1 ? '' : 's'}`}
                                                >{diagnosticCounts[row.path].warnings}</span
                                            >
                                        {/if}
                                        {#if analysisStatus[row.path] === 'not-reachable'}
                                            <span
                                                class="analysis-status"
                                                title="Not assembled from the current Entry">—</span
                                            >
                                        {/if}
                                        {#if row.path === entry}
                                            <span class="entry-mark" title="Project entry file"
                                                >ENTRY</span
                                            >
                                        {/if}
                                    </button>
                                    <div class="row-actions">
                                        {#if row.path !== entry}
                                            <button
                                                disabled={locked}
                                                title="Set as entry file"
                                                onclick={() => onEntryChange(row.path)}
                                            >
                                                <FaFlag />
                                            </button>
                                        {/if}
                                        <button
                                            title="Download exact bytes"
                                            onclick={() => downloadFile(row.path)}
                                        >
                                            <FaDownload />
                                        </button>
                                        <button
                                            disabled={locked}
                                            title="Rename or move"
                                            onclick={() => renameFile(row.path)}
                                        >
                                            <FaPen />
                                        </button>
                                        <button
                                            disabled={locked}
                                            title="Delete"
                                            onclick={() => deleteFile(row.path)}
                                        >
                                            <FaTrash />
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </section>
        </aside>
    </div>
{/if}

<style lang="scss">
    .files-toggle {
        position: absolute;
        z-index: 4;
        top: 0.55rem;
        right: 0.55rem;
        display: grid;
        place-items: center;
        width: 2.05rem;
        height: 2.05rem;
        padding: 0.48rem;
        border: 1px solid color-mix(in srgb, var(--tertiary) 80%, transparent);
        border-radius: 0.2rem;
        color: var(--secondary-text);
        background: color-mix(in srgb, var(--primary) 80%, transparent);
        box-shadow: 0 2px 10px rgb(0 0 0 / 0.28);
        cursor: pointer;

        &:hover {
            background: var(--tertiary);
        }
    }

    .file-sidebar-viewport {
        position: absolute;
        z-index: 5;
        inset: 0.2rem;
        overflow: clip;
        border-radius: 0.45rem;
        pointer-events: none;
    }

    .file-sidebar {
        position: absolute;
        inset: 0 0 0 auto;
        display: flex;
        flex-direction: column;
        width: min(14rem, calc(100% - 0.75rem));
        height: 100%;
        min-height: 0;
        color: var(--secondary-text);
        overflow: hidden;
        background: color-mix(in srgb, var(--primary) 80%, transparent);
        border: 1px solid var(--tertiary);
        border-radius: 0.45rem;
        box-shadow: -5px 0 18px rgb(0 0 0 / 0.3);
        backdrop-filter: blur(0.45rem);
        pointer-events: auto;
    }

    .explorer-heading {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        height: 2.35rem;
        padding: 0 0.45rem 0 1.15rem;
        border-bottom: 1px solid color-mix(in srgb, var(--tertiary) 65%, transparent);
        font-size: 0.68rem;
        letter-spacing: 0.08em;
    }

    .icon-action,
    .row-actions button {
        display: grid;
        place-items: center;
        width: 1.65rem;
        height: 1.65rem;
        padding: 0.38rem;
        border: 0;
        border-radius: 0.2rem;
        color: inherit;
        background: transparent;
        cursor: pointer;

        &:hover:not(:disabled) {
            background: var(--tertiary);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.3;
        }
    }

    .diagnostic-count,
    .analysis-status {
        flex: none;
        min-width: 1rem;
        padding: 0.05rem 0.25rem;
        border-radius: 0.5rem;
        font-size: 0.65rem;
        line-height: 1rem;
        text-align: center;
    }

    .diagnostic-count.error {
        color: #fff;
        background: #c74444;
    }

    .diagnostic-count.warning {
        color: #1c1607;
        background: #d6a83c;
    }

    .analysis-status {
        opacity: 0.55;
    }

    .explorer-section {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
    }

    .section-heading {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        height: 1.8rem;
        background: color-mix(in srgb, var(--tertiary) 42%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--tertiary) 70%, transparent);
    }

    .section-toggle {
        display: flex;
        flex: 1;
        align-items: center;
        align-self: stretch;
        min-width: 0;
        padding: 0 0.3rem;
        border: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 0.7rem;
        text-align: left;
        cursor: pointer;

        strong {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            text-transform: uppercase;
            white-space: nowrap;
        }
    }

    .section-actions {
        display: flex;
        align-items: center;
        padding-right: 0.25rem;

        .icon-action {
            width: 1.55rem;
            height: 1.55rem;
        }
    }

    .disclosure,
    .disclosure-spacer {
        display: grid;
        flex: 0 0 0.85rem;
        place-items: center;
        width: 0.85rem;
        height: 0.85rem;
    }

    .disclosure {
        transition: transform 120ms ease;

        &.expanded {
            transform: rotate(90deg);
        }
    }

    .entry-warning {
        flex: none;
        padding: 0.42rem 0.75rem;
        color: var(--red);
        background: color-mix(in srgb, var(--red) 10%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--red) 25%, transparent);
        font-size: 0.7rem;
        overflow-wrap: anywhere;
    }

    .file-tree {
        flex: 1;
        min-height: 3rem;
        padding: 0.22rem 0;
        overflow: auto;
    }

    .tree-row {
        display: flex;
        position: relative;
        align-items: center;
        width: 100%;
        min-width: 0;
        height: 1.55rem;
        border: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 0.78rem;
        text-align: left;
    }

    button.tree-row.directory,
    .file-select {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
        min-width: 0;
        padding-top: 0;
        padding-right: 0.35rem;
        padding-bottom: 0;
        border: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: inherit;
        text-align: left;
        cursor: pointer;
    }

    button.tree-row.directory {
        flex: none;
        height: 1.55rem;
    }

    .file-select {
        height: 100%;
    }

    .tree-row:hover,
    .tree-row:focus-within {
        background: var(--tertiary);
    }

    .tree-row.selected {
        background: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
        box-shadow: inset 2px 0 0 var(--accent);
    }

    .file-icon {
        display: grid;
        flex: 0 0 0.85rem;
        place-items: center;
        width: 0.85rem;
        height: 0.85rem;
        color: color-mix(in srgb, var(--accent) 65%, var(--secondary-text));

        svg {
            width: 0.78rem;
            height: 0.78rem;
        }
    }

    .file-icon.folder {
        color: color-mix(in srgb, #dcb864 78%, var(--secondary-text));
    }

    .file.binary .file-icon {
        color: color-mix(in srgb, #b48bdb 78%, var(--secondary-text));
    }

    .file.entry .file-icon {
        color: var(--accent);
    }

    .ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .entry-mark {
        flex: none;
        margin-left: auto;
        padding: 0.02rem 0.3rem;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
        border-radius: 999px;
        font-size: 0.48rem;
        font-weight: 700;
        line-height: 0.72rem;
        letter-spacing: 0.04em;
    }

    .row-actions {
        display: flex;
        position: absolute;
        z-index: 1;
        top: 0;
        right: 0;
        align-items: center;
        height: 100%;
        padding-left: 0.55rem;
        padding-right: 0.15rem;
        opacity: 0;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, var(--tertiary) 22%);

        button {
            width: 1.38rem;
            height: 1.38rem;
            padding: 0.32rem;
            pointer-events: auto;
        }
    }

    .file:hover .row-actions,
    .file:focus-within .row-actions {
        opacity: 1;
        pointer-events: auto;
        color: var(--primary-text);
    }

    .empty {
        padding: 1.25rem 0.8rem;
        text-align: center;
        opacity: 0.55;
        font-size: 0.75rem;
    }

    @media (hover: none) {
        .file.selected .row-actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
</style>

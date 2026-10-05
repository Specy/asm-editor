<script lang="ts">
    /**
     * The Project's Files as a tree, with the controls that manage them: create, upload, rename or
     * move, delete, download, and choose the Entry path: the Workbench's Explorer panel. Mutations
     * are disabled while `locked`, i.e. during a Debug session, and browsing and downloading stay
     * available. The root row carries the Project's name, "Project" when it has none; it folds the
     * tree away only when `collapsible`. A right click on a row, or on the empty space, opens its
     * controls as a menu; only touch screens, which have no right click, also show them as buttons
     * on the rows. Files dragged in from the computer are uploaded into the folder they are dropped
     * on.
     */
    import ContextMenu, { type ContextMenuEntry } from '$cmp/shared/menu/ContextMenu.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import { fileBytes, type ProjectFiles } from '$lib/projectFiles'
    import { blobDownloader } from '$lib/utils'
    import { Prompt } from '$stores/promptStore.svelte'
    import { toast } from '$stores/toastStore'
    import { untrack } from 'svelte'
    import { SvelteSet } from 'svelte/reactivity'
    import { sourceLanguage, sourceTemplate } from '$lib/sourceCompilation/records'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import FaDownload from '~icons/fa-solid/download'
    import FaFlag from '~icons/fa-solid/flag'
    import FaFolder from '~icons/fa-solid/folder'
    import FaFolderOpen from '~icons/fa-solid/folder-open'
    import FaFileAlt from '~icons/fa-solid/file-alt'
    import FaPen from '~icons/fa-solid/pen'
    import FaPlus from '~icons/fa-solid/plus'
    import FaTrash from '~icons/fa-solid/trash'
    import FaUpload from '~icons/fa-solid/upload'
    import SourceFileIcon from './SourceFileIcon.svelte'

    type TreeNode = {
        path: string
        name: string
        directory: boolean
        children: TreeNode[]
    }
    type TreeRow = Omit<TreeNode, 'children'> & { depth: number; expanded: boolean }

    interface Props {
        name?: string
        /** Whether the root row folds the tree away; otherwise it is a row by itself. */
        collapsible?: boolean
        files: ProjectFiles
        language?: AvailableLanguages
        entry: string
        fileSystem: FileSystem
        selectedPath: string
        selectedPaths?: readonly string[]
        locked?: boolean
        diagnosticCounts?: Readonly<Record<string, { errors: number; warnings: number }>>
        onSelect: (path: string) => void
        onEntryChange: (path: string) => void
        onRenamed?: (from: string, to: string) => void
        onDeleted?: (path: string) => void
        onFileDragStart?: (event: DragEvent, path: string) => void
        onFileDragEnd?: () => void
        /**
         * The Runtime library members the current Build linked, listed read-only after the
         * Project's Files: they are not the Project's, and the running program cannot see them.
         */
        libraryFiles?: readonly string[]
    }

    let {
        name = 'Project',
        collapsible = false,
        files,
        language = 'M68K',
        entry,
        fileSystem,
        selectedPath,
        selectedPaths,
        locked = false,
        diagnosticCounts = {},
        onSelect,
        onEntryChange,
        onRenamed,
        onDeleted,
        onFileDragStart,
        onFileDragEnd,
        libraryFiles = []
    }: Props = $props()

    const collapsedDirectories = new SvelteSet<string>()
    let projectExpanded = $state(true)
    const rows = $derived(makeTreeRows(files, collapsedDirectories))

    //the File being shown is always visible in the tree, whoever opened it
    $effect(() => {
        const paths = selectedPaths ?? [selectedPath]
        untrack(() => paths.forEach(expandParents))
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

    function reportFailure(error: unknown) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'File operation failed')
    }

    /**
     * The name being typed inline: a new File's in the folder `parent` ('' is the Project's root),
     * shown as a placeholder row at the top of that folder, or an existing File's new name.
     */
    type Editing = { mode: 'create'; parent: string } | { mode: 'rename'; path: string }
    type DisplayRow = (TreeRow & { draft?: false }) | { draft: true; depth: number }

    let editing = $state<Editing | null>(null)
    let draftName = $state('')

    //a Debug session starting mid-edit drops the edit, as it disables every other mutation
    $effect(() => {
        if (locked) untrack(cancelEdit)
    })

    const displayRows = $derived.by((): DisplayRow[] => {
        if (editing?.mode !== 'create') return rows
        const parent = editing.parent
        if (parent === '') return [{ draft: true, depth: 0 }, ...rows]
        const index = rows.findIndex((row) => row.directory && row.path === parent)
        if (index === -1) return rows
        const draft: DisplayRow = { draft: true, depth: rows[index].depth + 1 }
        return [...rows.slice(0, index + 1), draft, ...rows.slice(index + 1)]
    })

    function dirname(path: string): string {
        const index = path.lastIndexOf('/')
        return index === -1 ? '' : path.slice(0, index)
    }

    function joinPath(parent: string, child: string): string {
        return parent ? `${parent}/${child}` : child
    }

    function startCreate(parent = '') {
        if (locked) return
        if (parent) {
            expandParents(parent)
            collapsedDirectories.delete(parent)
        }
        if (collapsible) projectExpanded = true
        draftName = ''
        editing = { mode: 'create', parent }
    }

    function startRename(path: string) {
        if (locked || !files[path]) return
        draftName = basename(path)
        editing = { mode: 'rename', path }
    }

    function cancelEdit() {
        editing = null
    }

    /** Applies the typed name; a failure keeps the input open so the name can be fixed. */
    function commitEdit(input?: HTMLInputElement) {
        const current = editing
        if (!current) return
        const typed = draftName.trim()
        if (current.mode === 'create') {
            if (!typed) return cancelEdit()
            const path = joinPath(current.parent, typed)
            try {
                if (files[path]) throw new Error(`${path} already exists`)
                const fileLanguage = sourceLanguage(path)
                fileSystem.writeText(
                    path,
                    fileLanguage ? sourceTemplate(language, fileLanguage) : '',
                    false
                )
                editing = null
                expandParents(path)
                onSelect(path)
            } catch (error) {
                reportFailure(error)
                input?.focus()
            }
        } else {
            const previousPath = current.path
            const path = joinPath(dirname(previousPath), typed)
            if (!typed || path === previousPath) return cancelEdit()
            try {
                fileSystem.rename(previousPath, path)
                editing = null
                expandParents(path)
                onRenamed?.(previousPath, path)
                onSelect(path)
            } catch (error) {
                reportFailure(error)
                input?.focus()
            }
        }
    }

    function onEditKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            commitEdit(event.currentTarget as HTMLInputElement)
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEdit()
        }
    }

    function onEditBlur() {
        //leaving the input keeps a valid name and drops an invalid one, as a file manager does
        const current = editing
        commitEdit()
        if (editing === current) cancelEdit()
    }

    /** Focuses the inline input, selecting the name without its extension. */
    function focusName(input: HTMLInputElement) {
        input.focus()
        const dot = input.value.lastIndexOf('.')
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
    }

    const label = $derived(name.trim() || 'Project')

    /*
     * Dragging a File onto a folder, or onto any row inside one, moves it there; the empty space
     * and the root's rows mean the Project's root. As in VS Code, the whole target folder lights up,
     * its own row and everything shown under it, and a collapsed folder opens when hovered a moment.
     * The drag still carries the editor's data, so the same gesture opens the File in a pane.
     */
    const EXPAND_DELAY = 600
    let draggedPath = $state<string | null>(null)
    /** The folder a drop would move the dragged File into, '' for the root; null for no drop. */
    let dropFolder = $state<string | null>(null)
    let expandTimer: ReturnType<typeof setTimeout> | undefined
    let expandTimerFolder: string | null = null

    function startDrag(event: DragEvent, path: string) {
        onFileDragStart?.(event, path)
        if (!event.dataTransfer) return
        if (!onFileDragStart) event.dataTransfer.setData('text/plain', path)
        //moving within the tree, copying (opening) into an editor pane
        event.dataTransfer.effectAllowed = 'copyMove'
        draggedPath = path
    }

    function endDrag() {
        draggedPath = null
        setDropFolder(null)
        onFileDragEnd?.()
    }

    function setDropFolder(folder: string | null) {
        dropFolder = folder
        if (folder === expandTimerFolder) return
        clearTimeout(expandTimer)
        expandTimerFolder = folder
        if (folder && collapsedDirectories.has(folder)) {
            expandTimer = setTimeout(() => collapsedDirectories.delete(folder), EXPAND_DELAY)
        }
    }

    /** The folder the pointer is over: a folder row's own path, a File row's folder, else root. */
    function folderAt(target: EventTarget | null): string {
        const row = (target as Element | null)?.closest?.('[data-folder]')
        return row?.getAttribute('data-folder') ?? ''
    }

    /** Whether the drag carries files from the computer rather than one of the tree's own. */
    function draggingUploads(event: DragEvent): boolean {
        return draggedPath === null && !!event.dataTransfer?.types.includes('Files')
    }

    function onTreeDragOver(event: DragEvent) {
        if (locked) return
        if (draggingUploads(event)) {
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
            setDropFolder(folderAt(event.target))
            return
        }
        if (draggedPath === null) return
        const folder = folderAt(event.target)
        if (folder === dirname(draggedPath)) {
            setDropFolder(null)
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
            return
        }
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        setDropFolder(folder)
    }

    function onTreeDragLeave(event: DragEvent) {
        const tree = event.currentTarget as HTMLElement
        if (!tree.contains(event.relatedTarget as Node | null)) setDropFolder(null)
    }

    function onTreeDrop(event: DragEvent) {
        if (draggingUploads(event)) {
            const folder = dropFolder
            event.preventDefault()
            setDropFolder(null)
            if (folder === null || locked) return
            void uploadFiles(Array.from(event.dataTransfer?.files ?? []), folder)
            return
        }
        const from = draggedPath
        const folder = dropFolder
        if (from === null || folder === null || locked) return endDrag()
        event.preventDefault()
        endDrag()
        void moveFile(from, joinPath(folder, basename(from)))
    }

    async function moveFile(from: string, to: string) {
        if (from === to) return
        try {
            if (files[to]) {
                const replace = await Prompt.confirm(
                    `"${basename(to)}" already exists in ${dirname(to) || 'the project root'}. Replace it?`
                )
                if (!replace) return
                fileSystem.remove(to)
            }
            fileSystem.rename(from, to)
            expandParents(to)
            onRenamed?.(from, to)
            if (selectedPath === from) {
                onSelect(to)
            }
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
            //a host that follows deletions picks what to show next itself (the Workbench closes the
            //File's tab); otherwise the first File left, or the Entry path, takes its place
            if (onDeleted) onDeleted(previousPath)
            else if (previousPath === selectedPath) {
                onSelect(Object.keys(fileSystem.files)[0] ?? entry)
            }
        } catch (error) {
            reportFailure(error)
        }
    }

    /** Writes files from the computer into `folder` ('' is the root), showing the last one. */
    async function uploadFiles(uploaded: Iterable<File>, folder = '') {
        if (locked) return
        let last: string | null = null
        for (const file of uploaded) {
            const path = joinPath(folder, file.name)
            try {
                if (files[path]) {
                    const replace = await Prompt.confirm(`${path} already exists. Replace it?`)
                    if (!replace) continue
                }
                const data = await file.arrayBuffer()
                fileSystem.writeBytes(path, new Uint8Array(data), true)
                last = path
            } catch (error) {
                reportFailure(error)
            }
        }
        if (last === null) return
        expandParents(last)
        onSelect(last)
    }

    let uploadInput: HTMLInputElement
    /** The folder the file picker's choice goes into. */
    let uploadFolder = ''

    function pickUploads(folder = '') {
        if (locked) return
        uploadFolder = folder
        uploadInput.click()
    }

    function onUploadChange() {
        const chosen = Array.from(uploadInput.files ?? [])
        uploadInput.value = ''
        void uploadFiles(chosen, uploadFolder)
    }

    /** The menu a right click opened, and what it was opened on. */
    /** The File row the menu was opened on, kept lit while it is open. */
    let menuPath = $state<string | null>(null)
    let contextMenu = $state<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null)

    function folderItems(folder: string): ContextMenuEntry[] {
        return [
            {
                label: folder ? 'New file in this folder' : 'New file',
                icon: FaPlus,
                disabled: locked,
                onSelect: () => startCreate(folder)
            },
            {
                label: folder ? 'Upload files to this folder' : 'Upload files',
                icon: FaUpload,
                disabled: locked,
                onSelect: () => pickUploads(folder)
            }
        ]
    }

    function fileItems(path: string): ContextMenuEntry[] {
        return [
            { label: 'Open', icon: FaFileAlt, onSelect: () => onSelect(path) },
            {
                label: 'Set as entry file',
                icon: FaFlag,
                disabled: locked || path === entry,
                onSelect: () => onEntryChange(path)
            },
            { label: 'Download exact bytes', icon: FaDownload, onSelect: () => downloadFile(path) },
            { separator: true },
            {
                label: 'Rename',
                icon: FaPen,
                disabled: locked,
                onSelect: () => startRename(path)
            },
            {
                label: 'Delete',
                icon: FaTrash,
                danger: true,
                disabled: locked,
                onSelect: () => deleteFile(path)
            },
            { separator: true },
            ...folderItems(dirname(path))
        ]
    }

    function openContextMenu(event: MouseEvent, items: ContextMenuEntry[]) {
        //a name being typed keeps the browser's own menu, for pasting into it
        if ((event.target as Element | null)?.closest?.('input')) return
        event.preventDefault()
        event.stopPropagation()
        //one opened from the keyboard has no pointer, and opens under the focused row instead
        if (event.button === -1 || (event.clientX === 0 && event.clientY === 0)) {
            const rect = (event.target as Element).getBoundingClientRect()
            contextMenu = { x: rect.left + 16, y: rect.bottom, items }
        } else contextMenu = { x: event.clientX, y: event.clientY, items }
    }

    function downloadFile(targetPath = selectedPath) {
        const file = files[targetPath]
        if (!file) return
        const bytes = fileBytes(file)
        const contents = new Uint8Array(bytes).buffer
        blobDownloader(new Blob([contents]), basename(targetPath))
    }
</script>

<section class="explorer-section">
    <div class="section-heading">
        {#if collapsible}
            <button
                class="section-toggle"
                aria-expanded={projectExpanded}
                onclick={() => (projectExpanded = !projectExpanded)}
            >
                <span class="disclosure" class:expanded={projectExpanded}>
                    <FaAngleRight />
                </span>
                <strong title={name}>{label}</strong>
            </button>
        {:else}
            <div class="section-title"><strong title={name}>{label}</strong></div>
        {/if}
        <div class="section-actions">
            <button
                class="icon-action"
                disabled={locked}
                title="New text file"
                onclick={() => startCreate()}
            >
                <FaPlus />
            </button>
            <button
                class="icon-action"
                disabled={locked}
                title="Upload files"
                onclick={() => pickUploads()}
            >
                <FaUpload />
            </button>
            <input type="file" multiple hidden bind:this={uploadInput} onchange={onUploadChange} />
        </div>
    </div>

    {#if !collapsible || projectExpanded}
        {#if !files[entry]}
            <div class="entry-warning" title={entry}>Entry missing: {entry}</div>
        {/if}
        <div
            class="file-tree"
            class:drop-target={dropFolder === ''}
            role="tree"
            tabindex="-1"
            ondragover={onTreeDragOver}
            ondragleave={onTreeDragLeave}
            ondrop={onTreeDrop}
            oncontextmenu={(event) => {
                menuPath = null
                openContextMenu(event, folderItems(''))
            }}
        >
            {#if rows.length === 0 && !editing}
                <div class="empty">This Project has no files.</div>
            {/if}
            {#each displayRows as row (row.draft ? 'draft' : row.directory ? `directory:${row.path}` : `file:${row.path}`)}
                {#if row.draft}
                    <div
                        class="tree-row file editing selected"
                        data-folder={editing?.mode === 'create' ? editing.parent : ''}
                    >
                        <div
                            class="file-select"
                            style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                        >
                            <span class="disclosure-spacer"></span>
                            <SourceFileIcon path={draftName} {language} binary={false} />
                            <input
                                class="name-input"
                                aria-label="Name of the new file"
                                placeholder="name.asm"
                                spellcheck="false"
                                autocomplete="off"
                                bind:value={draftName}
                                use:focusName
                                onkeydown={onEditKeydown}
                                onblur={onEditBlur}
                            />
                        </div>
                    </div>
                {:else if row.directory}
                    <!-- the keyboard opens the menu from the row's focused button, with Shift+F10 or the Menu key -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="tree-row directory"
                        class:drop-target={dropFolder === row.path}
                        title={row.path}
                        data-folder={row.path}
                        oncontextmenu={(event) => {
                            menuPath = null
                            openContextMenu(event, folderItems(row.path))
                        }}
                    >
                        <button
                            class="directory-toggle"
                            style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                            aria-expanded={row.expanded}
                            onclick={() => toggleDirectory(row.path)}
                        >
                            <span class="disclosure" class:expanded={row.expanded}>
                                <FaAngleRight />
                            </span>
                            <span class="file-icon folder" aria-hidden="true">
                                {#if row.expanded}
                                    <FaFolderOpen />
                                {:else}
                                    <FaFolder />
                                {/if}
                            </span>
                            <span class="ellipsis">{row.name}</span>
                        </button>
                        <div class="row-actions">
                            <button
                                disabled={locked}
                                title="New text file in this folder"
                                onclick={() => startCreate(row.path)}
                            >
                                <FaPlus />
                            </button>
                        </div>
                    </div>
                {:else if editing?.mode === 'rename' && editing.path === row.path}
                    <div
                        class="tree-row file editing"
                        class:selected={selectedPaths
                            ? selectedPaths.includes(row.path)
                            : row.path === selectedPath}
                        title={row.path}
                        data-folder={dirname(row.path)}
                    >
                        <div
                            class="file-select"
                            style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                        >
                            <span class="disclosure-spacer"></span>
                            <SourceFileIcon
                                path={draftName || row.path}
                                {language}
                                binary={files[row.path]?.encoding === 'base64'}
                            />
                            <input
                                class="name-input"
                                aria-label={`New name for ${row.path}`}
                                spellcheck="false"
                                autocomplete="off"
                                bind:value={draftName}
                                use:focusName
                                onkeydown={onEditKeydown}
                                onblur={onEditBlur}
                            />
                        </div>
                    </div>
                {:else}
                    <!-- the keyboard opens the menu from the row's focused button, with Shift+F10 or the Menu key -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="tree-row file"
                        class:selected={selectedPaths
                            ? selectedPaths.includes(row.path)
                            : row.path === selectedPath}
                        class:entry={row.path === entry}
                        class:binary={files[row.path]?.encoding === 'base64'}
                        class:dragging={draggedPath === row.path}
                        class:menu-open={contextMenu !== null && menuPath === row.path}
                        title={row.path}
                        data-folder={dirname(row.path)}
                        oncontextmenu={(event) => {
                            menuPath = row.path
                            openContextMenu(event, fileItems(row.path))
                        }}
                    >
                        <button
                            class="file-select"
                            draggable="true"
                            ondragstart={(event) => startDrag(event, row.path)}
                            ondragend={endDrag}
                            style:padding-left={`${0.35 + row.depth * 0.85}rem`}
                            onclick={() => onSelect(row.path)}
                        >
                            <span class="disclosure-spacer"></span>
                            <SourceFileIcon
                                path={row.path}
                                {language}
                                binary={files[row.path]?.encoding === 'base64'}
                            />
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
                            {#if row.path === entry}
                                <span class="entry-mark" title="Project entry file">ENTRY</span>
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
                                title="Rename"
                                onclick={() => startRename(row.path)}
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
        {#if libraryFiles.length > 0}
            <div class="library-files" aria-label="Runtime library members this Build linked">
                <div class="library-title" title="Linked by this Build; read-only">
                    Runtime library
                </div>
                <div class="library-list">
                    {#each libraryFiles as path (path)}
                        <div
                            class="tree-row file"
                            class:selected={selectedPaths
                                ? selectedPaths.includes(path)
                                : path === selectedPath}
                            title={`${path} (read-only)`}
                        >
                            <button
                                class="file-select"
                                style:padding-left="0.35rem"
                                onclick={() => onSelect(path)}
                            >
                                <span class="disclosure-spacer"></span>
                                <SourceFileIcon {path} {language} binary={false} />
                                <span class="ellipsis">{path.slice(path.lastIndexOf('/') + 1)}</span
                                >
                            </button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
    {#if contextMenu}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            label="File actions"
            onClose={() => {
                contextMenu = null
                menuPath = null
            }}
        />
    {/if}
</section>

<style lang="scss">
    /* at most half the panel, its list scrolling under its title past that */
    .library-files {
        display: flex;
        flex: none;
        flex-direction: column;
        max-height: 50%;
        margin-top: 0.4rem;
        padding-top: 0.3rem;
        border-top: solid 0.1rem var(--tertiary);
        opacity: 0.85;
    }

    .library-list {
        min-height: 0;
        overflow: auto;
    }

    .library-title {
        padding: 0.2rem 0.5rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.7;
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

    .diagnostic-count {
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
        border-bottom: 1px solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
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
    }

    /* the root row by itself, its name where the folding row has its chevron and name */
    .section-title {
        display: flex;
        flex: 1;
        align-items: center;
        min-width: 0;
        padding: 0 0.3rem 0 0.8rem;
        font-size: 0.7rem;
    }

    .section-heading strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
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

        &.drop-target {
            outline: 1px dashed color-mix(in srgb, var(--accent) 70%, transparent);
            outline-offset: -2px;
            background-color: color-mix(in srgb, var(--accent) 5%, transparent);
        }
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

        &.directory.drop-target {
            background-color: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
            outline: 1px solid var(--accent);
            outline-offset: -1px;
            border-radius: 0.2rem;
        }

        &.file.dragging {
            opacity: 0.4;
        }
    }

    .directory-toggle,
    .file-select {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
        min-width: 0;
        height: 100%;
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

    .editing .file-select {
        cursor: default;
    }

    .name-input {
        flex: 1;
        min-width: 0;
        height: 1.35rem;
        margin: 0 0.25rem 0 -4px;
        padding: 0 3px;
        border: 1px solid var(--accent);
        border-radius: 0.15rem;
        outline: none;
        color: inherit;
        background: var(--primary);
        font: inherit;
        font-size: inherit;
        line-height: normal;
        box-sizing: border-box;
    }

    .tree-row:hover,
    .tree-row:focus-within {
        background: var(--tertiary);
    }

    .tree-row.menu-open {
        background: var(--tertiary);
    }

    .tree-row.selected {
        background: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
        box-shadow: inset 2px 0 0 var(--accent);
    }

    .file-icon {
        display: grid;
        flex: 0 0 1rem;
        place-items: center;
        width: 1rem;
        height: 1rem;
        color: color-mix(in srgb, var(--accent) 65%, var(--secondary-text));

        :global(svg) {
            width: 0.9rem;
            height: 0.9rem;
        }
    }

    .file-icon.folder {
        color: color-mix(in srgb, #dcb864 78%, var(--secondary-text));
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

    /* a row's controls are buttons only on touch screens, which have no right click; elsewhere
       they are its context menu */
    .row-actions {
        display: none;
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

    .empty {
        padding: 1.25rem 0.8rem;
        text-align: center;
        opacity: 0.55;
        font-size: 0.75rem;
    }

    @media (hover: none) {
        .row-actions {
            display: flex;
        }

        .tree-row:hover .row-actions,
        .tree-row:focus-within .row-actions,
        .file.selected .row-actions {
            opacity: 1;
            pointer-events: auto;
            color: var(--primary-text);
        }
    }
</style>

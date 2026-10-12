<script lang="ts">
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import { executableKind } from '#lib/executables.ts'
    import {
        isCompilationTarget,
        sourceLanguage,
        sourceTemplate
    } from '#lib/sourceCompilation/records.ts'
    import { Prompt } from '#stores/promptStore.svelte.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaFileMedical from '~icons/fa-solid/file-medical'
    import FaFolderOpen from '~icons/fa-solid/folder-open'
    import FaBook from '~icons/fa-solid/book'
    import FaFileAlt from '~icons/fa-solid/file-alt'
    import { useWorkbench } from './workbenchContext'

    //`compact` is the variant for one of two side-by-side editors: less branding, same actions
    let { group, compact = false }: { group: EditorGroup; compact?: boolean } = $props()
    const context = useWorkbench()
    const { session, ui } = context
    const project = session.project

    const explorer = $derived(context.rail.find((entry) => entry.id === 'explorer'))
    const hasDocumentation = $derived(context.rail.some((entry) => entry.id === 'documentation'))
    const canCreate = $derived(
        explorer !== undefined && explorer.access !== 'readonly' && !session.fileSystemLocked
    )
    const files = $derived(
        Object.keys(project.files)
            .filter((path) => project.files[path]?.encoding === 'plain')
            .sort((a, b) =>
                a === project.entry ? -1 : b === project.entry ? 1 : a.localeCompare(b)
            )
            .slice(0, compact ? 4 : 6)
    )

    async function createFile(suggested = 'src/new.asm') {
        const path = (await Prompt.askText('Path for the new text file', true, suggested))?.trim()
        if (!path) return
        try {
            const fileLanguage = sourceLanguage(path)
            project.fileSystem.writeText(
                path,
                fileLanguage ? sourceTemplate(project.language, fileLanguage) : '',
                false
            )
            session.selectFile(path, group)
        } catch (error) {
            console.error(error)
            toast.error(error instanceof Error ? error.message : 'File operation failed')
        }
    }

    /** A C file name not taken in the root: main.c, else main1.c, main2.c... */
    function freeCName(): string {
        for (let index = 0; ; index++) {
            const path = `main${index || ''}.c`
            if (!project.files[path]) return path
        }
    }

    let elfInput = $state<HTMLInputElement>()

    /** Writes the chosen ELF into the root and shows it, offering it as the Entry file. */
    async function uploadElf() {
        const file = elfInput?.files?.[0]
        if (elfInput) elfInput.value = ''
        if (!file || !canCreate) return
        try {
            const path = file.name
            if (
                project.files[path] &&
                !(await Prompt.confirm(`${path} already exists. Replace it?`))
            )
                return
            const bytes = new Uint8Array(await file.arrayBuffer())
            project.fileSystem.writeBytes(path, bytes, true)
            session.selectFile(path, group)
            const kind = executableKind(bytes)
            if (kind !== 'supported') {
                if (kind !== 'none') toast.warn(`${path}: ${kind.unsupported}`)
                return
            }
            if (executableKind(project.files[project.entry]) === 'supported') return
            //a Debug session may have started while the question was open
            if ((await Prompt.confirm(`Make ${path} the Entry file?`)) && !session.fileSystemLocked)
                session.setEntry(path)
        } catch (error) {
            console.error(error)
            toast.error(error instanceof Error ? error.message : 'File operation failed')
        }
    }

    function name(path: string) {
        return path.slice(path.lastIndexOf('/') + 1)
    }
    function folder(path: string) {
        const index = path.lastIndexOf('/')
        return index < 0 ? '' : path.slice(0, index)
    }
</script>

<div class="empty-editor" class:compact>
    <div class="content">
        {#if !compact}
            <header>
                <h1>Asm Editor</h1>
                <p class="tagline">{project.language} · {project.name || 'Project'}</p>
            </header>
        {/if}
        <p class="status">
            <strong>No file open.</strong>
            {#if explorer}
                Pick one from the
                <button class="inline-link" onclick={() => ui.open('explorer')}>Explorer</button
                >{compact ? '' : ', or start from one of the actions below'}.
            {/if}
        </p>

        <div class="columns">
            <section>
                <h2>Start</h2>
                <ul>
                    {#if canCreate}
                        <li>
                            <button class="link" onclick={() => createFile()}>
                                <FaFileMedical /> New file…
                            </button>
                        </li>
                    {/if}
                    {#if explorer}
                        <li>
                            <button class="link" onclick={() => ui.open('explorer')}>
                                <FaFolderOpen /> Open Explorer
                            </button>
                        </li>
                    {/if}
                    {#if hasDocumentation}
                        <li>
                            <button class="link" onclick={() => ui.searchDocumentation()}>
                                <FaBook /> Search documentation
                                <kbd>Ctrl K</kbd>
                            </button>
                        </li>
                    {/if}
                </ul>
            </section>

            {#if files.length > 0}
                <section>
                    <h2>{compact ? 'Open here' : 'Project files'}</h2>
                    <ul>
                        {#each files as path (path)}
                            <li>
                                <button
                                    class="link"
                                    onclick={() => session.selectFile(path, group)}
                                >
                                    <FaFileAlt />
                                    <span class="file-name">{name(path)}</span>
                                    {#if folder(path)}<span class="file-dir">{folder(path)}</span
                                        >{/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}
        </div>

        {#if !compact}
            <section class="hints">
                <h2>Tips</h2>
                <ul>
                    {#if canCreate && isCompilationTarget(project.language)}
                        <li>
                            <button class="hint-action" onclick={() => createFile(freeCName())}>
                                You can write C/C++. Create a .c or .cpp file
                            </button>
                        </li>
                    {/if}
                    {#if canCreate && project.language === 'X86'}
                        <li>
                            <button class="hint-action" onclick={() => elfInput?.click()}>
                                You can run Linux binaries. Upload an ELF file to disassemble
                            </button>
                            <input type="file" hidden bind:this={elfInput} onchange={uploadElf} />
                        </li>
                    {/if}
                    <li>Drag a file from the Explorer onto an editor to open it there.</li>
                    <li>Drag a tab to the side of the editor to view two files at once.</li>
                    <li>Click the gutter beside a line number to set a breakpoint.</li>
                </ul>
            </section>
        {/if}
    </div>
</div>

<style lang="scss">
    .empty-editor {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: flex;
        overflow: auto;
        padding: 2rem;
        color: var(--secondary-text);
        background: var(--secondary);
    }
    .content {
        margin: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        max-width: 44rem;
    }
    .compact .content {
        max-width: 22rem;
        gap: 1rem;
    }
    h1 {
        margin: 0;
        font-size: 2.2rem;
        font-weight: 600;
        letter-spacing: -0.01em;
    }
    .tagline {
        margin: 0.2rem 0 0;
        font-size: 1.1rem;
        opacity: 0.6;
    }
    .status {
        margin: 0;
        opacity: 0.85;
    }
    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.05rem;
        font-weight: 600;
    }
    .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 1.5rem 3rem;
    }
    ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }
    .link,
    .inline-link {
        border: none;
        background: none;
        padding: 0;
        font: inherit;
        color: var(--accent);
        cursor: pointer;
        text-decoration: none;
    }
    .link {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        min-width: 0;
        padding: 0.3rem 0;
        text-align: left;
        :global(svg) {
            flex-shrink: 0;
            width: 1rem;
        }
    }
    .link:hover,
    .inline-link:hover {
        filter: brightness(1.2);
    }
    .link:focus-visible,
    .inline-link:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 0.2rem;
    }
    .file-name {
        white-space: nowrap;
    }
    .file-dir {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--secondary-text);
        opacity: 0.55;
        font-size: 0.9em;
    }
    kbd {
        margin-left: auto;
        padding: 0.05rem 0.35rem;
        border-radius: 0.25rem;
        background: var(--tertiary);
        color: var(--tertiary-text);
        font-size: 0.75rem;
        font-family: inherit;
    }
    .hints ul {
        gap: 0.35rem;
        opacity: 0.7;
        font-size: 0.95rem;
    }
    .hint-action {
        padding: 0;
        border: none;
        color: inherit;
        background: none;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover {
            text-decoration: underline;
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
            border-radius: 0.2rem;
        }
    }
    .hints li::before {
        content: '›';
        margin-right: 0.5rem;
        color: var(--accent);
    }
</style>

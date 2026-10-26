<script lang="ts">
    /**
     * The **Edit history** panel ([pixel-editor.md](../../../../../../docs/design/pixel-editor.md),
     * decision 12): the Edit steps of every File that has them, each File a section drawn like the
     * Settings panel's, the one the focused pane shows in Hex or Pixels first. Its steps are listed
     * newest first, as a drawing program's History lists them, the steps Undo took back greyed above
     * the current one and the File as it was before them at the bottom. Choosing a row opens its
     * File in the Hex or Pixel editor when no pane shows it there, and goes back, or forward, to
     * just after its step; the steps gone back past stay until a new change discards them. The
     * steps are the Edit journal's, kept beside the Project
     * ([ADR 0063](../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).
     */
    import type { FileJournal } from '#lib/editJournal.ts'
    import FaUndo from '~icons/fa-solid/undo'
    import FaRedo from '~icons/fa-solid/redo'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { useWorkbench } from './workbenchContext'
    import CollapsibleSection from './CollapsibleSection.svelte'

    interface Props {
        /** A row was picked, which closes a phone's drawer. */
        onPick?: () => void
    }

    let { onPick }: Props = $props()

    const { session } = useWorkbench()

    const group = $derived(session.focusedGroup)
    /** The File the focused pane shows in the Hex or Pixel editor, if it does. */
    const open = $derived.by(() => {
        const path = group.displayedPath
        return path &&
            session.project.files[path] &&
            (group.displayedView === 'hex' || group.displayedView === 'pixels')
            ? path
            : undefined
    })
    /**
     * Why no step can be gone back or forward to now: the session's reasons, which hold for every
     * File, and not the focused pane's own, a Runtime library member it shows, say.
     */
    const readOnly = $derived(session.byteEditRefusal())

    /** The newest step's time, which orders the Files after the open one. */
    const latest = (journal: FileJournal) =>
        Math.max(
            0,
            ...journal.undo.map((step) => step.time),
            ...journal.redo.map((step) => step.time)
        )

    /** The Files with steps, the open one first even without any, then the last changed first. */
    const files = $derived.by(() => {
        const edited = session
            .editedFiles()
            .sort((left, right) => latest(right.journal) - latest(left.journal))
        const first = edited.findIndex((file) => file.path === open)
        if (first > 0) edited.unshift(...edited.splice(first, 1))
        else if (first < 0 && open) edited.unshift({ path: open, journal: { undo: [], redo: [] } })
        return edited
    })

    type Row = {
        /** How many steps are applied once it is chosen. */
        applied: number
        label: string
        time?: number
        undone: boolean
    }

    /** Newest first: the steps to redo, the next nearest the current, the steps applied, then the File before them. */
    function rowsOf(journal: FileJournal): Row[] {
        const { undo, redo } = journal
        const undone = redo.map((step, index): Row => ({
            applied: undo.length + redo.length - index,
            label: step.label,
            time: step.time,
            undone: true
        }))
        const applied = undo
            .map((step, index): Row => ({
                applied: index + 1,
                label: step.label,
                time: step.time,
                undone: false
            }))
            .reverse()
        return [...undone, ...applied, { applied: 0, label: 'Before these changes', undone: false }]
    }

    /** The time each row says, again every half minute. */
    let now = $state(Date.now())
    $effect(() => {
        const timer = setInterval(() => (now = Date.now()), 30_000)
        return () => clearInterval(timer)
    })
    const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
    function ago(time: number) {
        const seconds = Math.round((time - now) / 1000)
        if (Math.abs(seconds) < 45) return 'just now'
        const minutes = Math.round(seconds / 60)
        if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
        const hours = Math.round(minutes / 60)
        if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
        return relative.format(Math.round(hours / 24), 'day')
    }

    /** A row chosen: its File brought back into its editor, then the File as just after its step. */
    function choose(path: string, row: Row, current: number) {
        if (path !== open && !session.openForEditing(path)) return
        if (!readOnly && row.applied !== current) session.goToFileEdit(path, row.applied)
        onPick?.()
    }

    function rowTitle(path: string, row: Row, current: number) {
        if (row.applied === current || readOnly)
            return path === open ? (readOnly ?? 'Current file state') : 'Open file'
        return path === open ? 'Restore file to this step' : 'Open file and restore it to this step'
    }
</script>

<section class="edit-history" aria-label="Edit history">
    {#if !files.length}
        <p class="note">
            Edits made in the pixel and hex editors appear here. Select a step to restore that file
            to that point.
        </p>
    {:else if readOnly}
        <p class="note">{readOnly}</p>
    {/if}
    {#each files as { path, journal } (path)}
        {@const rows = rowsOf(journal)}
        {@const current = journal.undo.length}
        <CollapsibleSection variant="outlined" title={path}>
            {#snippet actions()}
                <button
                    type="button"
                    class="action"
                    {@attach tooltip(`Undo the last edit to ${path}`)}
                    aria-label="Undo"
                    disabled={!!readOnly || current === 0}
                    onclick={() => session.undoFileEdit(path)}><FaUndo /></button
                >
                <button
                    type="button"
                    class="action"
                    {@attach tooltip(`Redo the next edit to ${path}`)}
                    aria-label="Redo"
                    disabled={!!readOnly || !journal.redo.length}
                    onclick={() => session.undoFileEdit(path, true)}><FaRedo /></button
                >
            {/snippet}
            {#if rows.length === 1}
                <p class="note">
                    No changes yet. Drawing and hex editing add steps you can undo or restore.
                </p>
            {/if}
            <ol class="steps" aria-label="Edit history for {path}, newest first">
                {#each rows as row (row.applied)}
                    {@const isCurrent = row.applied === current}
                    <li>
                        <button
                            type="button"
                            class="step"
                            class:undone={row.undone}
                            class:current={isCurrent}
                            aria-current={isCurrent ? 'step' : undefined}
                            title={rowTitle(path, row, current)}
                            onclick={() => choose(path, row, current)}
                        >
                            <span class="label ellipsis">{row.label}</span>
                            {#if isCurrent}
                                <span class="pill">current</span>
                            {/if}
                            {#if row.time !== undefined}
                                <span class="time">{ago(row.time)}</span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ol>
        </CollapsibleSection>
    {/each}
</section>

<style lang="scss">
    /* spaced like the Settings panel, whose sections the File's steps are drawn as */
    .edit-history {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        flex: 1;
        padding: 0.5rem 0.35rem 0.8rem;
        font-size: 0.8rem;
    }
    .note {
        margin: 0;
        padding: 0.5rem 0.6rem;
        font-size: 0.8rem;
        line-height: 1.4;
        color: var(--hint);
    }
    .ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .action {
        display: grid;
        place-items: center;
        width: 1.6rem;
        height: 1.6rem;
        padding: 0.38rem;
        border: none;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        cursor: pointer;

        &:hover:not(:disabled) {
            background: var(--tertiary);
        }
        &:disabled {
            opacity: 0.35;
            cursor: default;
        }
    }
    /* a File's steps scroll past about ten of them, so that the Files after it stay in reach */
    .steps {
        max-height: 18rem;
        margin: 0;
        padding: 0.3rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        list-style: none;
    }
    .step {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        height: 1.8rem;
        padding: 0 0.6rem;
        border: 0;
        border-radius: 0.3rem;
        color: inherit;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover:not(:disabled),
        &:focus-visible {
            background: var(--tertiary);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        /* the current step keeps its colour under the pointer too, square on the side its bar
           marks */
        &.current,
        &.current:hover:not(:disabled) {
            border-radius: 0 0.3rem 0.3rem 0;
            background: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
            box-shadow: inset 2px 0 0 var(--accent);
        }
        &.undone {
            opacity: 0.5;
        }
    }
    .label {
        flex: 1;
    }
    .time {
        flex: none;
        font-size: 0.72rem;
        opacity: 0.65;
        font-variant-numeric: tabular-nums;
    }
    .pill {
        flex: none;
        padding: 0.05rem 0.45rem;
        border-radius: 1rem;
        background: var(--accent);
        color: var(--accent-text);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1.4;
    }
</style>

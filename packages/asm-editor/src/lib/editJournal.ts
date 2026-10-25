/**
 * The **Edit journal** ([ADR 0063](../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)):
 * the Undo and Redo of what the Hex and Pixel editors change in a File, kept beside the Project
 * rather than in it, so a File is only ever its current bytes. Each **Edit step** keeps the change
 * that takes it back, which is the bytes the change overwrote, or the whole content Canvas size
 * replaced: Undo makes that change and keeps, for Redo, the one that takes it back in turn.
 */
import type { ByteChange } from '#lib/languages/peripherals/FileSystem.ts'
import type { FileEncoding, ProjectFiles } from '#lib/projectFiles.ts'
import { fileFingerprint } from '#lib/sourceCompilation/fingerprints.ts'

/**
 * One **Edit step**: a change the Hex or Pixel editor made to a File, as the change that takes it
 * back, labelled as the Edit history shows it, such as `Pencil` or `Typing`, and when it was made,
 * in milliseconds since 1970.
 */
export type EditStep = Readonly<{ label: string; time: number; change: ByteChange }>

/** A File's steps: those Undo takes back, oldest first, and those Redo puts back, the next last. */
export type FileJournal = Readonly<{ undo: readonly EditStep[]; redo: readonly EditStep[] }>

/**
 * A File's journal as a store keeps it, with a fingerprint of the File its last step left, so that
 * one the File no longer fits, which something else changed since, is dropped rather than written
 * back over it.
 */
export type SavedJournal = FileJournal & Readonly<{ fingerprint: string }>

/**
 * Where a host keeps a Project's journals between visits, the IndexedDB of the browser. A journal
 * is kept with the save of the Project that holds the File it fits, never ahead of it or behind
 * it: the session says whose journal changed and how to read it, and the host reads it as it takes
 * the Project's snapshot and writes both at once, so that a tab closed between two saves leaves a
 * journal and a File that still fit.
 */
export type EditJournalStore = {
    /** Every journal saved for the Project, by the path of its File. */
    load(): Promise<ReadonlyMap<string, unknown>>
    /** The journal of the File at `path` changed; `read` gives it, undefined to forget it. */
    changed(path: string, read: () => SavedJournal | undefined): void
}

/** What one File's steps may keep, past which the oldest are forgotten (the newest stays). */
export const JOURNAL_FILE_BUDGET = 1024 * 1024
/** What all a Project's Files' steps may keep together. */
export const JOURNAL_PROJECT_BUDGET = 4 * 1024 * 1024
/** How many steps one File keeps, so the Edit history never lists more. */
export const JOURNAL_STEP_LIMIT = 1000
export const STEP_LABEL_LIMIT = 80

/** The FileSystem calls the journal makes: the Files, and a change to one of them. */
export type JournalFiles = {
    readonly files: ProjectFiles
    changeBytes(path: string, changes: readonly ByteChange[]): ByteChange[]
}

/** The bytes a change keeps. */
export function changeSize(change: ByteChange): number {
    if ('content' in change) return change.content.length
    let size = 0
    for (const run of change.runs) size += run.bytes.length
    return size
}

/** The bytes a File's steps keep, those to redo too. */
export function journalSize(journal: FileJournal): number {
    let size = 0
    for (const step of journal.undo) size += changeSize(step.change)
    for (const step of journal.redo) size += changeSize(step.change)
    return size
}

/**
 * One File's steps and the File they fit: its content and encoding after the last step, or, for
 * steps a store gave back, the fingerprint of it, checked against the File when they are first
 * used.
 */
type Entry = {
    undo: EditStep[]
    redo: EditStep[]
    encoding?: FileEncoding
    content?: string
    fingerprint?: string
}

/**
 * Whether `value` is a Uint8Array of whichever realm made it: a store's structured clone may
 * come from another, as under jsdom.
 */
const isBytes = (value: unknown): value is Uint8Array =>
    Object.prototype.toString.call(value) === '[object Uint8Array]'

/** A saved journal checked for the shape the editor saves; undefined when it is not that. */
function cleanSaved(value: unknown): SavedJournal | undefined {
    if (!value || typeof value !== 'object') return undefined
    const { fingerprint, undo, redo } = value as Record<string, unknown>
    if (typeof fingerprint !== 'string' || !Array.isArray(undo) || !Array.isArray(redo))
        return undefined
    const steps = [...undo, ...redo]
    const valid = steps.every((step: unknown) => {
        if (!step || typeof step !== 'object') return false
        const { label, time, change } = step as Record<string, unknown>
        if (typeof label !== 'string' || label.length > STEP_LABEL_LIMIT) return false
        if (typeof time !== 'number' || !Number.isFinite(time)) return false
        if (!change || typeof change !== 'object') return false
        const { runs, content, encoding } = change as Record<string, unknown>
        if (content !== undefined)
            return isBytes(content) && (encoding === 'plain' || encoding === 'base64')
        return (
            Array.isArray(runs) &&
            runs.every(
                (run: unknown) =>
                    !!run &&
                    typeof run === 'object' &&
                    Number.isSafeInteger((run as Record<string, unknown>).offset) &&
                    isBytes((run as Record<string, unknown>).bytes)
            )
        )
    })
    if (!valid || steps.length > 2 * JOURNAL_STEP_LIMIT) return undefined
    return { fingerprint, undo: undo as EditStep[], redo: redo as EditStep[] }
}

/**
 * The Edit journals of one Project's Files, for as long as its Workbench session lasts, given back
 * by a store after a reload. Every use first checks that the File is still the one its steps left,
 * and forgets them when it is not: a program, an upload or typing into the Text view changed it.
 * `onChange` is told of each File whose steps changed, for the store.
 */
export class EditJournal {
    private readonly entries = new Map<string, Entry>()

    constructor(
        private readonly fileSystem: JournalFiles,
        private readonly onChange?: (path: string) => void
    ) {}

    /** The paths of the Files that have steps, some of which may no longer fit their File. */
    paths(): string[] {
        return [...this.entries.keys()]
    }

    /** The steps of the File at `path`, when it is still the File they fit. */
    journalOf(path: string): FileJournal | undefined {
        const entry = this.current(path)
        return entry && { undo: [...entry.undo], redo: [...entry.redo] }
    }

    /**
     * Makes `change` to the File at `path` as a new step, which drops the steps Redo had. Returns
     * the change that takes it back; an empty change, which changes nothing, is no step.
     */
    change(path: string, label: string, change: ByteChange, time = Date.now()): ByteChange {
        let entry = this.current(path)
        const [inverse] = this.fileSystem.changeBytes(path, [change])
        if ('runs' in inverse && !inverse.runs.length) return inverse
        if (!entry) this.entries.set(path, (entry = { undo: [], redo: [] }))
        entry.undo.push({ label: label.slice(0, STEP_LABEL_LIMIT), time, change: inverse })
        entry.redo = []
        this.changed(path, entry)
        this.trim(path, entry)
        return inverse
    }

    /**
     * Takes back the File's newest step, or with `redo` puts back the last one taken back.
     * Returns the change it made, undefined when there was none to make.
     */
    undo(path: string, redo = false): ByteChange | undefined {
        const entry = this.current(path)
        if (!entry || !(redo ? entry.redo : entry.undo).length) return undefined
        return this.move(path, entry, redo, 1)[0]
    }

    /**
     * Goes back, or forward, to just after the File's `applied`th step, the oldest first, in one
     * change of the File. False when the File has no such step.
     */
    goTo(path: string, applied: number): boolean {
        const entry = this.current(path)
        if (!entry || !Number.isSafeInteger(applied)) return false
        const done = entry.undo.length
        if (applied < 0 || applied > done + entry.redo.length) return false
        if (applied < done) this.move(path, entry, false, done - applied)
        else if (applied > done) this.move(path, entry, true, applied - done)
        return true
    }

    /** Carries a File's steps to its new path. */
    rename(from: string, to: string) {
        const entry = this.entries.get(from)
        if (!entry || from === to) return
        this.entries.delete(from)
        this.entries.set(to, entry)
        this.onChange?.(from)
        this.onChange?.(to)
    }

    /** Forgets a File's steps, with the File. */
    drop(path: string) {
        if (this.entries.delete(path)) this.onChange?.(path)
    }

    /**
     * Takes a File's steps from a store, unless the File already has steps of this session, which
     * are newer. They are checked against the File when first used.
     */
    load(path: string, saved: unknown) {
        if (this.entries.has(path)) return
        const clean = cleanSaved(saved)
        if (!clean || (!clean.undo.length && !clean.redo.length)) return
        this.entries.set(path, {
            undo: [...clean.undo],
            redo: [...clean.redo],
            fingerprint: clean.fingerprint
        })
    }

    /** A File's steps as a store keeps them, undefined when it has none to keep. */
    saved(path: string): SavedJournal | undefined {
        const entry = this.entries.get(path)
        if (!entry || (!entry.undo.length && !entry.redo.length)) return undefined
        //once a step changed it, the File is known by its content
        entry.fingerprint ??= fileFingerprint({
            encoding: entry.encoding!,
            content: entry.content!
        })!
        return { fingerprint: entry.fingerprint, undo: [...entry.undo], redo: [...entry.redo] }
    }

    /**
     * A File's steps, when the File is the one they left. A File something else changed since, or
     * one gone, has none, and they are forgotten.
     */
    private current(path: string): Entry | undefined {
        const entry = this.entries.get(path)
        if (!entry) return undefined
        const file = this.fileSystem.files[path]
        let fits = !!file
        if (file && entry.content === undefined) {
            //steps a store gave back: the File is the one they left when its fingerprint is
            fits = fileFingerprint(file) === entry.fingerprint
            if (fits) Object.assign(entry, { encoding: file.encoding, content: file.content })
        } else if (file) fits = entry.content === file.content && entry.encoding === file.encoding
        if (fits) return entry
        this.drop(path)
        return undefined
    }

    /**
     * Makes the changes of the File's last `count` steps to undo, or to redo, in one change of the
     * File, each moving to the other list as the change that takes it back. Returns the changes
     * made. A change the FileSystem refuses moves no step. Moving steps forgets none: the budgets
     * are kept as steps are made, and Undo past a large step must not take the ones before it.
     */
    private move(path: string, entry: Entry, redo: boolean, count: number): ByteChange[] {
        const [from, to] = redo ? [entry.redo, entry.undo] : [entry.undo, entry.redo]
        const taken = from.slice(from.length - count).reverse()
        const changes = taken.map((step) => step.change)
        const inverses = this.fileSystem.changeBytes(path, changes)
        from.length -= count
        taken.forEach((step, index) => to.push({ ...step, change: inverses[index] }))
        this.changed(path, entry)
        return changes
    }

    /** Notes the File a change left. */
    private changed(path: string, entry: Entry) {
        const file = this.fileSystem.files[path]
        entry.encoding = file?.encoding
        entry.content = file?.content
        entry.fingerprint = undefined
        this.onChange?.(path)
    }

    /** Forgets the oldest steps past the budgets, once a new step is made. */
    private trim(path: string, entry: Entry) {
        let size = journalSize(entry)
        while (
            entry.undo.length > 1 &&
            (size > JOURNAL_FILE_BUDGET ||
                entry.undo.length + entry.redo.length > JOURNAL_STEP_LIMIT)
        )
            size -= changeSize(entry.undo.shift()!.change)
        this.trimProject(path)
    }

    /**
     * Forgets the Project's oldest steps, of any File, past {@link JOURNAL_PROJECT_BUDGET}, except
     * the newest of the File just changed.
     */
    private trimProject(changed: string) {
        let total = 0
        for (const entry of this.entries.values()) total += journalSize(entry)
        while (total > JOURNAL_PROJECT_BUDGET) {
            let oldest: [string, Entry] | undefined
            for (const [path, entry] of this.entries) {
                if (entry.undo.length <= (path === changed ? 1 : 0)) continue
                if (!oldest || entry.undo[0].time < oldest[1].undo[0].time) oldest = [path, entry]
            }
            if (!oldest) return
            const [path, entry] = oldest
            total -= changeSize(entry.undo.shift()!.change)
            if (!entry.undo.length && !entry.redo.length) this.entries.delete(path)
            this.onChange?.(path)
        }
    }
}

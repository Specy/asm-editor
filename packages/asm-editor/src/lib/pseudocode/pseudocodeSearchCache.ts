import type { DecompiledLine } from '@specy/decompiler'
import { executableAnalysis } from '#lib/executables.ts'
import type { ElfAnalysis } from '#lib/listing/decoder.ts'
import { LINE_KIND, type Listing, type ListingFunction } from '#lib/listing/listing.ts'
import { fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import {
    pseudocodeNameSpans,
    pseudocodeWidenedNames,
    rewriteNames,
    type NameSpan
} from '#lib/projectSearch/nameSpans.ts'
import { programNames, type PseudocodeName } from './programImage'
import { functionAnnotations, functionAnnotationsKey } from './pseudocodeAnnotations'
import { isTimeLimit, type PseudocodeClient, type PseudocodeResult } from './pseudocodeClient'

/**
 * Every function's Pseudocode of an Executable, as text, for the Search panel
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 28, and "Decompiling every function"):
 *
 * - a batch decompiles the functions one at a time in the Pseudocode worker at background
 *   priority, so a pane's request waits behind at most the one under way, which has
 *   `BACKGROUND_TIME_LIMIT_MS`; functions reachable from `main` by direct calls first, breadth
 *   first, then the rest by address, so a static program's own code comes before its glibc; PLT
 *   stubs never, whose Pseudocode is the library function's;
 * - it reports each function's text as it comes, and its progress; it stops on `stop`, keeping
 *   what was done;
 * - the cache keeps each function's text and where its function and data names are in it, by the
 *   File's content and load base and each function's own Annotations (its locals'
 *   names, its comments, its function comment), for the Workbench session, never saved. A global
 *   rename rewrites the texts that name what it renamed rather than decompiling them again
 *   ("The cached text with a new name"), their lines then breaking where a fresh decompilation's
 *   might not; where a rename changes more than the name's own text, its function is decompiled
 *   again, as one whose locals or comments changed is: a C++ name moved out of its namespaces or
 *   back, which the decompiler qualifies relative to the function it prints, and whose function
 *   then qualifies every other name relative to the global scope; and a name the decompiler
 *   widened (`_name`), which names no target to rewrite.
 *
 * A function past the time limit, or one the worker failed on, is listed as not searched
 * ({@link PseudocodeSearchFailure.retryable}) and tried again by `retry` or the next `start`: a
 * less busy machine may beat it. A decompiler error otherwise stays for that version of the File.
 */

/** One function's Pseudocode as the search reads it. */
export type PseudocodeSearchEntry = Readonly<{
    /** The function's link-time address. */
    address: number
    /** What lists name it by: the Listing's short name for a C++ one, else its name. */
    name: string
    /**
     * The decompiler's text (`DecompiledFunction.text`, without the pane's header), its names
     * rewritten after a global rename.
     */
    text: string
    /** Where its function and data names are in `text` (`pseudocodeNameSpans`). */
    spans: readonly NameSpan[]
}>

/** A function not searched: the decompiler gave an error rather than its Pseudocode. */
export type PseudocodeSearchFailure = Readonly<{
    address: number
    name: string
    error: string
    /**
     * Whether another try may succeed: it was past the time limit, or the worker failed. Such a
     * failure is never kept: `retry` asks again at once, and the next `start` asks again.
     */
    retryable: boolean
}>

export type PseudocodeSearchProgress = Readonly<{
    path: string
    /** How many functions there are to decompile: every function but the PLT stubs. */
    total: number
    /** How many of them have their text, or failed. */
    done: number
    /** Whether a batch is decompiling them. */
    running: boolean
    /** The function being decompiled, by its link-time address. */
    current?: number
    /** The functions not searched, by address. */
    failures: readonly PseudocodeSearchFailure[]
}>

export type PseudocodeSearchChange =
    /** Functions whose text is new or changed: decompiled, decompiled again or rewritten. */
    | { type: 'entries'; path: string; entries: readonly PseudocodeSearchEntry[] }
    /**
     * Functions whose text is gone until they are decompiled again: the File's bytes changed, the
     * function is gone, or its locals or comments changed.
     */
    | { type: 'removed'; path: string; addresses: readonly number[] }
    | { type: 'progress'; progress: PseudocodeSearchProgress }

/** The sections whose functions are PLT stubs, the first of which has an Invented name. */
const PLT_SECTIONS = new Set(['.plt', '.plt.sec', '.plt.got'])
const STUB_NAME = /@plt(?:_resolver)?$/

/**
 * The functions of an Executable's Listing a search decompiles: all but its PLT stubs (named
 * `@plt` or `@plt_resolver`, or starting inside `.plt`, `.plt.sec` or `.plt.got`), in address
 * order. A static program's glibc is the program's own and is included.
 */
export function searchableFunctions(
    listing: Listing,
    analysis: Pick<ElfAnalysis, 'sections'>
): ListingFunction[] {
    const stubs = analysis.sections
        .filter((section) => PLT_SECTIONS.has(section.name) && section.size > 0)
        .map((section) => [Number(section.address), Number(section.address) + section.size])
    const stubLabels = new Set<number>()
    for (const label of listing.labels) if (label.origin === 'plt') stubLabels.add(label.address)
    return listing.functions.filter(
        (fn) =>
            !STUB_NAME.test(fn.name) &&
            !stubLabels.has(fn.address) &&
            !stubs.some(([start, end]) => fn.address >= start && fn.address < end)
    )
}

/** Bytes an instruction may start with before a direct call's or jump's opcode: `bnd`, `notrack`. */
const PREFIXES = new Set([0xf2, 0x3e])

/**
 * The link-time addresses a function calls or jumps to directly (`call rel32`, a tail call's
 * `jmp rel32` or `jmp rel8`), read from its instructions' bytes in its Listing lines.
 */
function directTargets(listing: Listing, bytes: Uint8Array, fn: ListingFunction): number[] {
    const { kinds, addresses, sizes, offsets } = listing.lines
    const targets: number[] = []
    for (let line = fn.line; line < fn.endLine; line++) {
        if (kinds[line] !== LINE_KIND.instruction || offsets[line] < 0) continue
        const end = offsets[line] + sizes[line]
        let at = offsets[line]
        while (at < end && PREFIXES.has(bytes[at])) at++
        const next = addresses[line] + sizes[line]
        if ((bytes[at] === 0xe8 || bytes[at] === 0xe9) && at + 5 === end)
            targets.push(
                next +
                    (bytes[at + 1] |
                        (bytes[at + 2] << 8) |
                        (bytes[at + 3] << 16) |
                        (bytes[at + 4] << 24))
            )
        else if (bytes[at] === 0xeb && at + 2 === end)
            targets.push(next + ((bytes[at + 1] << 24) >> 24))
    }
    return targets
}

/**
 * The order a batch decompiles `functions` in: from `main` (else the entry point) through direct
 * calls, breadth first, then the rest by address.
 */
export function searchOrder(
    listing: Listing,
    bytes: Uint8Array,
    functions: readonly ListingFunction[]
): number[] {
    const byAddress = new Map(functions.map((fn) => [fn.address, fn]))
    const order: number[] = []
    const seen = new Set<number>()
    const visit = (address: number | undefined) => {
        if (address === undefined || seen.has(address) || !byAddress.has(address)) return
        seen.add(address)
        order.push(address)
    }
    visit(listing.main ?? listing.entry)
    for (let i = 0; i < order.length; i++)
        for (const target of directTargets(listing, bytes, byAddress.get(order[i])!)) visit(target)
    for (const fn of [...functions].sort((left, right) => left.address - right.address))
        visit(fn.address)
    return order
}

/** What one version of an Executable's Listing gives the search, kept per Listing. */
type ListingFacts = {
    /** The functions to decompile, by link-time address. */
    functions: Map<number, ListingFunction>
    /** The names the program image gives, by link-time address. */
    names: Map<number, PseudocodeName>
    /** The order to decompile them in, worked out when a batch first needs it. */
    order?: number[]
}

/** A version of an Executable: its File and the Listing made from it. */
type Version = {
    file: ProjectFile
    listing: Listing
    facts: ListingFacts
}

/**
 * Whether two versions decompile to the same texts but for names and Annotations: the same
 * bytes, at the same base, with the same names version.
 */
function sameBytes(left: Version, right: Version): boolean {
    return (
        left.file.encoding === right.file.encoding &&
        left.file.content === right.file.content &&
        left.listing.base === right.listing.base &&
        left.listing.version === right.listing.version
    )
}

type Entry = PseudocodeSearchEntry & {
    /** The function's Annotations it was decompiled with (`functionAnnotationsKey`). */
    annotationsKey: string
    /** The names its text holds. */
    names: Map<number, PseudocodeName>
    /** The global names its text prints widened (`pseudocodeWidenedNames`), with no target. */
    widened: readonly string[]
}

type Failure = { failure: PseudocodeSearchFailure; annotationsKey: string }

type PathState = {
    version: Version
    entries: Map<number, Entry>
    failures: Map<number, Failure>
    /** While a batch runs: the functions still to decompile, in order. */
    pending?: number[]
    /** Lets go of the program the batch keeps open. */
    letGo?: () => void
}

/** A name that changed between two versions' names, by target. */
type NameChange = { from?: PseudocodeName; to?: PseudocodeName }

const sameName = (left?: PseudocodeName, right?: PseudocodeName) =>
    left?.name === right?.name &&
    (left?.namespace ?? []).join('::') === (right?.namespace ?? []).join('::')

/** The targets whose names differ between two versions' names. */
function nameChanges(
    from: Map<number, PseudocodeName>,
    to: Map<number, PseudocodeName>
): Map<number, NameChange> {
    const changes = new Map<number, NameChange>()
    for (const [target, name] of from)
        if (!sameName(name, to.get(target))) changes.set(target, { from: name, to: to.get(target) })
    for (const [target, name] of to)
        if (!from.has(target)) changes.set(target, { from: undefined, to: name })
    return changes
}

/**
 * Whether a change moves a name into or out of namespaces: a C++ name renamed into the global
 * scope, as a person's name goes, or reset into its namespaces. The decompiler qualifies a name
 * relative to the function it prints, so the texts naming it, and the renamed function's own,
 * whose scope it is, read otherwise than by the name alone.
 */
const movesScope = ({ from, to }: NameChange) =>
    !!(from?.namespace?.length || to?.namespace?.length)

/**
 * Whether a name's text in a Pseudocode can be rewritten for its change: a name in the global
 * scope before and after, printed as it was named.
 */
function rewritable(text: string, span: NameSpan, change: NameChange): boolean {
    const { from, to } = change
    if (!from || !to || movesScope(change)) return false
    return text.slice(span.start, span.end) === from.name
}

const oldNamesOf = new WeakMap<Map<number, NameChange>, Set<string>>()

/** The names before of the changes, as the decompiler prints a name without its namespaces. */
function oldNames(changes: Map<number, NameChange>): Set<string> {
    let names = oldNamesOf.get(changes)
    if (!names) {
        names = new Set()
        for (const { from } of changes.values()) if (from) names.add(from.name)
        oldNamesOf.set(changes, names)
    }
    return names
}

/** The function's text with names rewritten from its own names to `names`; undefined when it cannot be. */
function rewrite(
    entry: Entry,
    names: Map<number, PseudocodeName>,
    changes: Map<number, NameChange>
): Entry | undefined {
    if (entry.names === names) return entry
    //its own name moved scope: every name in it may be qualified otherwise
    const own = changes.get(entry.address)
    if (own && movesScope(own)) return undefined
    //a widened name names no target, but may be a renamed one's
    if (entry.widened.length) {
        const renamed = oldNames(changes)
        if (entry.widened.some((name) => renamed.has(name))) return undefined
    }
    let touched = false
    for (const span of entry.spans) {
        const change = changes.get(span.target)
        if (!change) continue
        if (!rewritable(entry.text, span, change)) return undefined
        touched = true
    }
    if (!touched) return { ...entry, names }
    const { text, spans } = rewriteNames(
        entry.text,
        entry.spans,
        (target) => changes.get(target)?.to?.name
    )
    return { ...entry, text, spans, names }
}

/** Whether a failure may not happen again: past the time limit, or the client's own. */
function isRetryable(error: string): boolean {
    return isTimeLimit(error) || error.startsWith('The decompiler ')
}

/** A function's text as the spans' offsets count it: its lines, joined by line breaks. */
function textOf(lines: readonly DecompiledLine[]): string {
    return lines.map((line) => line.text).join('\n')
}

/** An entry as the cache gives it out, without what it keeps it by. */
function publicEntry({ address, name, text, spans }: Entry): PseudocodeSearchEntry {
    return { address, name, text, spans }
}

/**
 * The Search panel's Pseudocode of every function of the session's Executables, each by its
 * path ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 28). It never decompiles but while a batch runs (`start` to `stop`, or until every
 * function is done), one at a time across Executables, in the order they were started.
 */
export class PseudocodeSearchCache {
    private readonly paths = new Map<string, PathState>()
    /** The paths whose batch runs, in the order they were started. */
    private readonly active: string[] = []
    private running?: { path: string; address: number; controller: AbortController }
    private pumping = false
    private disposed = false
    private readonly listeners = new Set<(change: PseudocodeSearchChange) => void>()
    private readonly facts = new WeakMap<Listing, ListingFacts>()

    /** `client` gives the session's Pseudocode client, undefined once it has ended. */
    constructor(private readonly client: () => PseudocodeClient | undefined) {}

    /** Calls `listener` with each change, until what this returns is called. */
    subscribe(listener: (change: PseudocodeSearchChange) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /**
     * Brings the cache of the Executable at `path` to this version of its File and the Listing
     * made from it, decompiling nothing: texts of other bytes are dropped, texts of other names
     * rewritten, texts of functions whose Annotations changed dropped; a running batch then
     * decompiles what this left out.
     */
    update(path: string, file: ProjectFile, listing: Listing): void {
        if (this.disposed) return
        if (this.refresh(path, file, listing)) this.progressed(path)
    }

    /** `update` but for its progress: whether anything changed. */
    private refresh(path: string, file: ProjectFile, listing: Listing): boolean {
        const state = this.paths.get(path)
        if (!state) {
            const version = this.versionOf(file, listing)
            this.paths.set(path, { version, entries: new Map(), failures: new Map() })
            return true
        }
        const previous = state.version
        if (previous.file === file && previous.listing === listing) return false
        const version = this.versionOf(file, listing)
        state.version = version
        const { functions, names } = version.facts
        const removed: number[] = []
        const changed: Entry[] = []
        if (!sameBytes(previous, version)) {
            removed.push(...state.entries.keys())
            state.entries.clear()
            state.failures.clear()
        } else {
            const changes = new Map<Map<number, PseudocodeName>, Map<number, NameChange>>()
            for (const [address, entry] of state.entries) {
                const fn = functions.get(address)
                let next =
                    fn && this.annotationsKeyOf(version, fn) === entry.annotationsKey
                        ? entry
                        : undefined
                if (next && entry.names !== names) {
                    let change = changes.get(entry.names)
                    if (!change) {
                        change = nameChanges(entry.names, names)
                        changes.set(entry.names, change)
                    }
                    next = rewrite(entry, names, change)
                }
                if (next && fn) {
                    const name = fn.list ?? fn.name
                    if (next.name !== name) next = { ...next, name }
                }
                if (!next) {
                    state.entries.delete(address)
                    removed.push(address)
                } else if (next !== entry) {
                    state.entries.set(address, next)
                    if (next.text !== entry.text || next.name !== entry.name) changed.push(next)
                }
            }
            for (const [address, { failure, annotationsKey }] of state.failures) {
                const fn = functions.get(address)
                if (!fn || this.annotationsKeyOf(version, fn) !== annotationsKey)
                    state.failures.delete(address)
                else if (failure.name !== (fn.list ?? fn.name))
                    state.failures.set(address, {
                        failure: { ...failure, name: fn.list ?? fn.name },
                        annotationsKey
                    })
            }
        }
        if (removed.length) this.emit({ type: 'removed', path, addresses: removed })
        if (changed.length) this.emit({ type: 'entries', path, entries: changed.map(publicEntry) })
        if (state.pending) state.pending = this.pendingOf(state)
        return true
    }

    /**
     * Decompiles every function of the Executable at `path` that this version of it has no text
     * for, in the background, after `update`; one already running carries on with this version.
     * Functions past the time limit before are tried again.
     */
    start(path: string, file: ProjectFile, listing: Listing): void {
        if (this.disposed) return
        this.refresh(path, file, listing)
        const state = this.paths.get(path)!
        if (!state.pending) {
            for (const [address, { failure }] of state.failures)
                if (failure.retryable) state.failures.delete(address)
            state.pending = this.pendingOf(state)
            state.letGo = this.client()?.hold(path)
            this.active.push(path)
        }
        this.progressed(path)
        void this.pump()
    }

    /**
     * Stops the batch of one Executable, or of every one: what was decompiled stays. A function
     * being decompiled is not waited for.
     */
    stop(path?: string): void {
        for (const stopped of path === undefined ? [...this.active] : [path]) {
            const state = this.paths.get(stopped)
            if (!state?.pending) continue
            this.halt(stopped, state)
            if (this.running?.path === stopped) this.running.controller.abort()
            this.progressed(stopped)
        }
    }

    /** Decompiles a function not searched again, first: what Try again does. */
    retry(path: string, address: number): void {
        if (this.disposed) return
        const state = this.paths.get(path)
        if (!state?.version.facts.functions.has(address) || state.entries.has(address)) return
        state.failures.delete(address)
        if (!state.pending) this.start(path, state.version.file, state.version.listing)
        state.pending = [address, ...state.pending!.filter((pending) => pending !== address)]
        this.progressed(path)
    }

    /** Forgets an Executable, as when its File is deleted or is no Executable any more. */
    forget(path: string): void {
        const state = this.paths.get(path)
        if (!state) return
        this.stop(path)
        this.paths.delete(path)
        if (state.entries.size)
            this.emit({ type: 'removed', path, addresses: [...state.entries.keys()] })
    }

    /** Moves an Executable's cache to the path its File was renamed to, its batch with it. */
    rename(from: string, to: string): void {
        const state = this.paths.get(from)
        if (!state || from === to || this.paths.has(to)) return
        const running = !!state.pending
        this.stop(from)
        this.paths.delete(from)
        this.paths.set(to, state)
        if (state.entries.size) {
            this.emit({ type: 'removed', path: from, addresses: [...state.entries.keys()] })
            this.emit({ type: 'entries', path: to, entries: this.entries(to) })
        }
        if (running) this.start(to, state.version.file, state.version.listing)
    }

    /** The functions decompiled for the Executable at `path`, in address order. */
    entries(path: string): PseudocodeSearchEntry[] {
        const state = this.paths.get(path)
        if (!state) return []
        return [...state.entries.values()]
            .sort((left, right) => left.address - right.address)
            .map(publicEntry)
    }

    /** Where the batch of the Executable at `path` is; undefined for one never updated. */
    progress(path: string): PseudocodeSearchProgress | undefined {
        const state = this.paths.get(path)
        if (!state) return undefined
        const running = this.running?.path === path ? this.running.address : undefined
        return {
            path,
            total: state.version.facts.functions.size,
            done: state.entries.size + state.failures.size,
            running: !!state.pending,
            ...(running !== undefined ? { current: running } : {}),
            failures: [...state.failures.values()]
                .map(({ failure }) => failure)
                .sort((left, right) => left.address - right.address)
        }
    }

    /** Stops every batch and forgets everything, as the Workbench session ends. */
    dispose(): void {
        this.stop()
        this.disposed = true
        this.paths.clear()
        this.listeners.clear()
    }

    private emit(change: PseudocodeSearchChange) {
        for (const listener of [...this.listeners]) listener(change)
    }

    private progressed(path: string) {
        const progress = this.progress(path)
        if (progress) this.emit({ type: 'progress', progress })
    }

    /** Ends a path's batch, letting go of its program. */
    private halt(path: string, state: PathState) {
        state.pending = undefined
        state.letGo?.()
        state.letGo = undefined
        const at = this.active.indexOf(path)
        if (at >= 0) this.active.splice(at, 1)
    }

    /** The functions a batch decompiles, in order: those without a text or a failure. */
    private pendingOf(state: PathState): number[] {
        const { file, listing, facts } = state.version
        facts.order ??= searchOrder(listing, fileBytes(file), [...facts.functions.values()])
        return facts.order.filter(
            (address) => !state.entries.has(address) && !state.failures.has(address)
        )
    }

    /** Decompiles the active batches' functions one at a time, until none is left. */
    private async pump() {
        if (this.pumping) return
        this.pumping = true
        try {
            while (!this.disposed) {
                const path = this.active[0]
                if (path === undefined) break
                const state = this.paths.get(path)!
                const address = state.pending?.shift()
                //one under way when an `update` queued it again may have settled since
                const settled =
                    address !== undefined &&
                    (state.entries.has(address) || state.failures.has(address))
                const fn =
                    address === undefined || settled
                        ? undefined
                        : state.version.facts.functions.get(address)
                if (!fn) {
                    if (!state.pending?.length) {
                        this.halt(path, state)
                        this.progressed(path)
                    }
                    continue
                }
                const client = this.client()
                if (!client) break
                const { version } = state
                const own = functionAnnotations(version.file.annotations, fn.address, fn.end)
                const controller = new AbortController()
                this.running = { path, address: fn.address, controller }
                this.progressed(path)
                let result: PseudocodeResult
                try {
                    result = await client.decompile(
                        path,
                        version.file,
                        version.listing,
                        fn.address,
                        {
                            priority: 'background',
                            annotations: own,
                            signal: controller.signal
                        }
                    )
                } catch {
                    //stopped, or the File changed under it
                    continue
                } finally {
                    this.running = undefined
                }
                this.settle(path, version, fn, functionAnnotationsKey(own), result)
            }
        } finally {
            this.pumping = false
        }
    }

    /** Keeps a function's Pseudocode, decompiled from `version`, if that is still the path's. */
    private settle(
        path: string,
        version: Version,
        fn: ListingFunction,
        annotationsKey: string,
        result: PseudocodeResult
    ) {
        const state = this.paths.get(path)
        if (!state || !sameBytes(state.version, version)) return
        const current = state.version.facts.functions.get(fn.address)
        //its locals or comments changed meanwhile: `update` queued it again
        if (!current || this.annotationsKeyOf(state.version, current) !== annotationsKey) return
        const name = current.list ?? current.name
        if ('error' in result) {
            state.failures.set(fn.address, {
                failure: {
                    address: fn.address,
                    name,
                    error: result.error,
                    retryable: isRetryable(result.error)
                },
                annotationsKey
            })
            return this.progressed(path)
        }
        const names = state.version.facts.names
        let entry: Entry | undefined = {
            address: fn.address,
            name,
            text: textOf(result.lines),
            spans: pseudocodeNameSpans(result.lines),
            widened: pseudocodeWidenedNames(result.lines),
            annotationsKey,
            names: version.facts.names
        }
        if (entry.names !== names) entry = rewrite(entry, names, nameChanges(entry.names, names))
        if (!entry) {
            //renamed meanwhile, where the text cannot be rewritten: decompiled again
            state.pending?.unshift(fn.address)
            return this.progressed(path)
        }
        state.entries.set(fn.address, entry)
        state.failures.delete(fn.address)
        this.emit({ type: 'entries', path, entries: [publicEntry(entry)] })
        this.progressed(path)
    }

    private annotationsKeyOf(version: Version, fn: ListingFunction): string {
        return functionAnnotationsKey(
            functionAnnotations(version.file.annotations, fn.address, fn.end)
        )
    }

    private versionOf(file: ProjectFile, listing: Listing): Version {
        let facts = this.facts.get(listing)
        if (!facts) {
            const analysis = executableAnalysis(file)
            facts = {
                functions: new Map(
                    searchableFunctions(listing, analysis).map((fn) => [fn.address, fn])
                ),
                names: programNames(listing, analysis)
            }
            this.facts.set(listing, facts)
        }
        return { file, listing, facts }
    }
}

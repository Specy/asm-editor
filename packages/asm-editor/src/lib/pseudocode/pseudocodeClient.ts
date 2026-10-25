import type { DecompiledFunction, DecompileOptions } from '@specy/decompiler'
import PseudocodeWorker from './pseudocode.worker?worker'
import type { FunctionAnnotations } from '#lib/annotations/annotations.ts'
import { executableAnalysis } from '#lib/executables.ts'
import { KeyIds } from '#lib/keyIds.ts'
import type { Listing } from '#lib/listing/listing.ts'
import { fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import { programImage, programNamesKey } from './programImage'
import {
    annotationOptions,
    functionAnnotations,
    functionAnnotationsKey
} from './pseudocodeAnnotations'
import { functionAt } from './pseudocodeMap'
import type { PseudocodeRequest, PseudocodeResponse } from './protocol'

/**
 * How long the worker may say nothing while a request waits on it before it is taken for dead
 * and ended (plan decision 8): above the decompiler's own 30-second limit on a function, which
 * answers with an error rather than falling silent.
 */
export const PSEUDOCODE_WORKER_SILENCE_MS = 45_000
/**
 * How long a worker with no program open and nothing to do is kept before it is ended, giving
 * back its memory: WebAssembly memory never shrinks, and one large function grows it past 100 MB.
 */
export const PSEUDOCODE_WORKER_IDLE_MS = 30_000
/** How many decompiled functions are kept, across Executables. */
export const KEPT_PSEUDOCODE = 32
/** The contents whose numbers are kept, a few Executables and their Build's versions. */
const KEPT_CONTENTS = 8
/**
 * How long the decompiler works on a function asked for in the background, for the Search panel,
 * before giving up on it ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 28): a decompilation cannot be interrupted, so a pane's request waits behind at most
 * this much of one.
 */
export const BACKGROUND_TIME_LIMIT_MS = 5_000

/**
 * Why there is no Pseudocode when the worker died, could not start or was closed: the client's own
 * failure, which another try may not have.
 */
const DECOMPILER_STOPPED = 'The decompiler stopped unexpectedly. Try again.'

/**
 * A function's Pseudocode as the decompiler gives it, or `{ address, error }` with the reason
 * there is none. Its addresses (the result's, each line's `addresses`, each token's `address` and
 * `target`) are link-time ones, as the Listing's line table has them; the text prints them as the
 * Listing's text does, shifted by the Listing's base.
 */
export type PseudocodeResult = DecompiledFunction

/**
 * What a request is waiting on once its turn has come: the decompiler loading (the first
 * request of a worker), then the decompilation itself.
 */
export type PseudocodeStage = 'loading' | 'decompiling'

/**
 * Whom a request is for: a pane showing the function, or the Search panel's batch, whose
 * requests wait while any of a pane's do, have {@link BACKGROUND_TIME_LIMIT_MS} each, and whose
 * results are not among the kept ones.
 */
export type PseudocodePriority = 'visible' | 'background'

export type PseudocodeOptions = {
    /** Gives up waiting: the promise rejects with the signal's reason. */
    signal?: AbortSignal
    onStage?: (stage: PseudocodeStage) => void
    /**
     * The function's Annotations at link-time addresses, as `functionAnnotations` gives them; by
     * default those `file.annotations` hold for the function of `listing` starting at `address`.
     */
    annotations?: FunctionAnnotations
    /** `'visible'` by default. */
    priority?: PseudocodePriority
}

type ClientOptions = {
    silenceMs?: number
    idleMs?: number
    /** The prototypes passed with every program; glibc's from the package by default. */
    prototypes?: () => Promise<string>
    /** A background request's time limit, {@link BACKGROUND_TIME_LIMIT_MS} by default. */
    backgroundTimeLimitMs?: number
}

/** What the client uses of a Worker, which a stand-in on the calling thread has too. */
export type PseudocodeWorkerLike = {
    postMessage(request: PseudocodeRequest, transfer: Transferable[]): void
    terminate(): void
    addEventListener(
        type: 'message' | 'error' | 'messageerror',
        listener: (event: Event) => void
    ): void
}

export type PseudocodeWorkerConstructor = new () => PseudocodeWorkerLike

type WorkerState = {
    worker: PseudocodeWorkerLike
    /** Whether it has announced its listener; until then requests are held, in order. */
    ready: boolean
    held: [PseudocodeRequest, Transferable[]][]
    /** Whether its decompiler has loaded, which the first request waits on. */
    loaded: boolean
}

/** A program open in the worker: one per path, for the bytes and Listing it was opened with. */
type OpenProgram = { path: string; key: string; number: number }

type Caller = {
    /** Whom it asks for: a request may wait on a job of the other lane. */
    lane: PseudocodePriority
    resolve(result: PseudocodeResult): void
    reject(reason: unknown): void
    onStage?: (stage: PseudocodeStage) => void
    cleanup?: () => void
}

type Job = {
    key: string
    lane: PseudocodePriority
    programKey: string
    path: string
    file: ProjectFile
    listing: Listing
    /** Link-time. */
    address: number
    /** The function's Annotations as the decompiler takes them, at the image's addresses. */
    options?: DecompileOptions
    callers: Set<Caller>
    started: boolean
    stage?: PseudocodeStage
    /** The request's id once posted, and the program it names. */
    id?: number
    program?: number
}

/**
 * The editor's side of the Pseudocode worker (plan decision 8), one per Workbench session. It
 * keeps one program open in the worker per Executable path, opened with the Executable's bytes
 * and its Listing's names (`programImage`), the person's renames among them,
 * and opened again when they change; `release` closes one once no pane shows it, and `hold` keeps
 * one open meanwhile for a batch. Requests are answered one at a time, in order, a pane's before
 * any of the background's ({@link PseudocodePriority}); one asked for again while it waits, by
 * another pane, waits with it. A request carries the function's Annotations: its renamed locals,
 * its comments and its function comment
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions
 * 13 to 17 and 22). Results are kept by the File's content, the Listing's base,
 * names version and renames, the function's address and Annotations and the decompiler's version,
 * the last {@link KEPT_PSEUDOCODE} a pane asked for; a failure is not kept when another try may
 * answer: past the decompiler's time limit (a busy machine), or the worker failing.
 *
 * The decompiler package is loaded with the first request. A worker silent for
 * {@link PSEUDOCODE_WORKER_SILENCE_MS} while a request waits, or that errors or cannot start (where
 * there is no `Worker`), is ended and the request answered with an error; the next request starts
 * a new one. The tests, in Node and jsdom, pass a stand-in that answers the same messages on the
 * calling thread (`InThreadWorker`), which the app never imports, so that its bundle holds the
 * decompiler package once, in the worker's.
 */
export class PseudocodeClient {
    private state?: WorkerState
    /** The requests waiting their turn, a pane's first. */
    private readonly queues: Record<PseudocodePriority, Job[]> = { visible: [], background: [] }
    /** Every request asked for and not answered, by its lane and key ({@link jobKey}). */
    private readonly jobs = new Map<string, Job>()
    private current?: Job
    private readonly programs = new Map<string, OpenProgram>()
    /** The paths a pane asked for since `release`: their programs stay open when a batch ends. */
    private readonly shown = new Set<string>()
    /** How many batches keep each path's program open ({@link hold}). */
    private readonly holds = new Map<string, number>()
    /** Opens still unanswered, by request id, and why each that failed did. */
    private readonly opening = new Map<number, OpenProgram>()
    private readonly openFailures = new Map<number, string>()
    private readonly results = new Map<string, PseudocodeResult>()
    /**
     * A short number for each content string, as `ListingDocuments` keeps them, and apart, for
     * each key of renames (`programNamesKey`) and of a function's Annotations, so that a run of
     * those never takes a content's number away, which would open its program again. Few
     * contents: each holds a whole File, every overwrite in the Hex editor makes a new one
     * (ADR 0063), and the one in use, asked for at each request, keeps its number.
     */
    private readonly contentIds = new KeyIds(KEPT_CONTENTS)
    private readonly annotationIds = new KeyIds(4 * KEPT_PSEUDOCODE)
    private nextId = 1
    private nextProgram = 1
    /** Counts `dispose` calls, so work started before one does not finish after it. */
    private generation = 0
    private watchdog: ReturnType<typeof setTimeout> | undefined
    private idle: ReturnType<typeof setTimeout> | undefined
    private glibc?: Promise<string>
    private readonly silenceMs: number
    private readonly idleMs: number
    private readonly backgroundTimeLimitMs: number
    /** The Ghidra release and commit of the decompiler, once one has loaded. */
    version: string | undefined

    constructor(
        private readonly WorkerClass: PseudocodeWorkerConstructor = PseudocodeWorker,
        private readonly options: ClientOptions = {}
    ) {
        this.silenceMs = options.silenceMs ?? PSEUDOCODE_WORKER_SILENCE_MS
        this.idleMs = options.idleMs ?? PSEUDOCODE_WORKER_IDLE_MS
        this.backgroundTimeLimitMs = options.backgroundTimeLimitMs ?? BACKGROUND_TIME_LIMIT_MS
    }

    /**
     * The Pseudocode of the function starting at a link-time `address` of the Executable shown at
     * `path`, whose `listing` was made from `file`'s bytes, with the function's Annotations.
     * Never rejects but through `signal`.
     */
    decompile(
        path: string,
        file: ProjectFile,
        listing: Listing,
        address: number,
        options: PseudocodeOptions = {}
    ): Promise<PseudocodeResult> {
        const lane = options.priority ?? 'visible'
        const own =
            options.annotations ??
            functionAnnotations(
                file.annotations,
                address,
                functionAt(listing, address)?.end ?? address
            )
        const programKey = `${this.contentIds.of(file.content)}\0${listing.base}\0${listing.version}\0${this.annotationIds.of(programNamesKey(listing))}`
        const key = `${programKey}\0${address}\0${this.annotationIds.of(functionAnnotationsKey(own))}`
        if (lane === 'visible') this.shown.add(path)
        const kept = this.version === undefined ? undefined : this.kept(key)
        if (kept) return Promise.resolve(kept)
        const { signal } = options
        if (signal?.aborted) return Promise.reject(signal.reason)
        return new Promise<PseudocodeResult>((resolve, reject) => {
            const waiting =
                this.jobs.get(jobKey(lane, key)) ??
                //the background rides along a pane's request; a pane's takes the background's
                //place in the queue when it has not started
                (lane === 'background'
                    ? this.jobs.get(jobKey('visible', key))
                    : this.promoted(key)) ??
                this.enqueue({
                    key,
                    lane,
                    programKey,
                    path,
                    file,
                    listing,
                    address,
                    options: annotationOptions(own, listing.base),
                    callers: new Set(),
                    started: false
                })
            const caller: Caller = { lane, resolve, reject, onStage: options.onStage }
            waiting.callers.add(caller)
            if (signal) {
                const abort = () => {
                    waiting.callers.delete(caller)
                    reject(signal.reason)
                    if (waiting.started) return
                    // Nobody waits for it any more: it is not asked for. One no longer queued
                    // (answered, or dropped with the client) takes nothing else with it.
                    if (!waiting.callers.size) {
                        if (this.dequeue(waiting)) this.heard()
                    } else if ([...waiting.callers].every((each) => each.lane === 'background'))
                        this.demoted(waiting)
                }
                signal.addEventListener('abort', abort, { once: true })
                caller.cleanup = () => signal.removeEventListener('abort', abort)
            }
            if (waiting.stage) caller.onStage?.(waiting.stage)
            void this.next()
        })
    }

    /**
     * Closes the program open for a path, once no pane shows its Pseudocode; a batch holding it
     * ({@link hold}) closes it as it lets go. A request for it later opens it again.
     */
    release(path: string): void {
        this.shown.delete(path)
        if (!this.holds.has(path)) this.close(path)
    }

    /**
     * Keeps the program open for a path while a batch decompiles its functions in the background,
     * whether a pane shows it or not; what this returns lets go, once, closing the program unless
     * a pane asked for it since it was last released.
     */
    hold(path: string): () => void {
        this.holds.set(path, (this.holds.get(path) ?? 0) + 1)
        let held = true
        return () => {
            if (!held) return
            held = false
            //a hold from before `dispose` lets go of nothing
            const count = (this.holds.get(path) ?? 1) - 1
            if (count > 0) return void this.holds.set(path, count)
            this.holds.delete(path)
            if (!this.shown.has(path)) this.close(path)
        }
    }

    private close(path: string) {
        const program = this.programs.get(path)
        if (!program) return
        this.programs.delete(path)
        if (this.state) this.post({ type: 'close', program: program.number })
        this.heard()
    }

    /** Queues a new request at the back of its lane. */
    private enqueue(job: Job): Job {
        this.jobs.set(jobKey(job.lane, job.key), job)
        this.queues[job.lane].push(job)
        return job
    }

    /** Takes a request that has not started out of its lane; whether it was there. */
    private dequeue(job: Job): boolean {
        const queue = this.queues[job.lane]
        const at = queue.indexOf(job)
        if (at < 0) return false
        queue.splice(at, 1)
        this.jobs.delete(jobKey(job.lane, job.key))
        return true
    }

    /**
     * The background's request of a function a pane now asks for, moved to the pane's lane with
     * the pane's time limit, when it has not started; undefined otherwise.
     */
    private promoted(key: string): Job | undefined {
        const job = this.jobs.get(jobKey('background', key))
        if (!job || job.started || !this.dequeue(job)) return undefined
        job.lane = 'visible'
        return this.enqueue(job)
    }

    /**
     * A pane's request that no pane waits for any more, only the background's that rode along:
     * back in the background's lane, behind every pane's request, with the background's time
     * limit, and not kept. Left as it is when it has started or is no longer queued.
     */
    private demoted(job: Job) {
        if (job.lane !== 'visible' || this.jobs.has(jobKey('background', job.key))) return
        if (!this.dequeue(job)) return
        job.lane = 'background'
        this.enqueue(job)
    }

    /**
     * Ends the worker and forgets every program and result, as the Workbench session ends;
     * whatever still waits is answered with an error. A later request starts afresh.
     */
    dispose(): void {
        this.generation++
        const waiting = [...new Set(this.jobs.values())]
        this.queues.visible.length = 0
        this.queues.background.length = 0
        this.jobs.clear()
        this.shown.clear()
        this.holds.clear()
        this.current = undefined
        if (this.state) this.end(this.state)
        this.results.clear()
        this.contentIds.clear()
        this.annotationIds.clear()
        for (const job of waiting)
            this.answer(job, { address: job.address, error: DECOMPILER_STOPPED })
    }

    private kept(key: string): PseudocodeResult | undefined {
        const cacheKey = `${this.version}\0${key}`
        const result = this.results.get(cacheKey)
        if (result) {
            this.results.delete(cacheKey)
            this.results.set(cacheKey, result)
        }
        return result
    }

    private keep(key: string, result: PseudocodeResult) {
        if (this.version === undefined) return
        this.results.set(`${this.version}\0${key}`, result)
        if (this.results.size > KEPT_PSEUDOCODE)
            this.results.delete(this.results.keys().next().value!)
    }

    /** Starts the next request, a pane's before the background's, once none is under way. */
    private async next() {
        if (this.current) return
        const job = this.queues.visible.shift() ?? this.queues.background.shift()
        if (!job) return this.heard()
        this.current = job
        job.started = true
        const generation = this.generation
        let prototypes: string
        try {
            this.glibc ??= (
                this.options.prototypes ??
                (() =>
                    import('@specy/decompiler/prototypes/glibc').then((module) => module.default))
            )()
            prototypes = await this.glibc
        } catch (error) {
            this.glibc = undefined
            if (generation === this.generation) this.finish(job, failed(job, error), false)
            return
        }
        if (generation !== this.generation) return
        let state: WorkerState
        try {
            state = this.state ?? this.start()
        } catch {
            return this.finish(job, { address: job.address, error: DECOMPILER_STOPPED }, false)
        }
        this.stage(job, state.loaded ? 'decompiling' : 'loading')
        let program = this.programs.get(job.path)
        if (program?.key !== job.programKey) {
            if (program) this.post({ type: 'close', program: program.number })
            this.programs.delete(job.path)
            let image
            try {
                image = programImage({
                    bytes: fileBytes(job.file),
                    listing: job.listing,
                    analysis: executableAnalysis(job.file),
                    prototypes
                })
            } catch (error) {
                return this.finish(job, failed(job, error), false)
            }
            program = { path: job.path, key: job.programKey, number: this.nextProgram++ }
            this.programs.set(job.path, program)
            const id = this.nextId++
            this.opening.set(id, program)
            this.post(
                { type: 'open', id, program: program.number, image },
                image.regions.map((region) => region.bytes.buffer as ArrayBuffer)
            )
        }
        job.id = this.nextId++
        job.program = program.number
        const options: DecompileOptions | undefined =
            job.lane === 'background'
                ? { ...job.options, timeLimitMs: this.backgroundTimeLimitMs }
                : job.options
        this.post({
            type: 'decompile',
            id: job.id,
            program: program.number,
            address: job.address + job.listing.base,
            ...(options ? { options } : {})
        })
        this.heard()
    }

    private stage(job: Job, stage: PseudocodeStage) {
        if (job.stage === stage) return
        job.stage = stage
        for (const caller of job.callers) caller.onStage?.(stage)
    }

    /**
     * Answers a request and starts the next. A result another try would give again (`keep`) also
     * answers the same function waiting in the other lane, and is kept when a pane asked for it.
     */
    private finish(job: Job, result: PseudocodeResult, keep: boolean) {
        if (this.current === job) this.current = undefined
        this.jobs.delete(jobKey(job.lane, job.key))
        const twin = keep
            ? this.jobs.get(jobKey(job.lane === 'visible' ? 'background' : 'visible', job.key))
            : undefined
        const answered = twin && !twin.started && this.dequeue(twin) ? [job, twin] : [job]
        for (const done of answered) {
            if (keep && done.lane === 'visible') this.keep(done.key, result)
            this.answer(done, result)
        }
        this.heard()
        void this.next()
    }

    private answer(job: Job, result: PseudocodeResult) {
        for (const caller of job.callers) {
            caller.cleanup?.()
            caller.resolve(result)
        }
        job.callers.clear()
    }

    private receive(state: WorkerState, response: PseudocodeResponse) {
        if (this.state !== state) return
        switch (response.type) {
            case 'ready':
                state.ready = true
                for (const [request, transfer] of state.held.splice(0))
                    state.worker.postMessage(request, transfer)
                break
            case 'loaded':
                state.loaded = true
                this.version = response.version
                if (this.current) this.stage(this.current, 'decompiling')
                break
            case 'opened':
                this.opening.delete(response.id)
                break
            case 'failure': {
                const opened = this.opening.get(response.id)
                if (response.dropped) {
                    // The worker dropped its decompiler, and every program with it.
                    state.loaded = false
                    this.programs.clear()
                    this.opening.clear()
                }
                if (opened) {
                    this.opening.delete(response.id)
                    this.openFailures.set(opened.number, response.message)
                    if (this.programs.get(opened.path) === opened) this.programs.delete(opened.path)
                    break
                }
                const job = this.current
                if (job?.id !== response.id) break
                const message = this.openFailures.get(job.program!) ?? response.message
                this.openFailures.delete(job.program!)
                this.finish(job, { address: job.address, error: decompilerReason(message) }, false)
                return
            }
            case 'function': {
                const job = this.current
                if (job?.id !== response.id) break
                const linked = toLinkTime(response.result, job.listing.base)
                const result =
                    'error' in linked
                        ? { address: linked.address, error: decompilerReason(linked.error) }
                        : linked
                this.finish(job, result, !('error' in result && isTimeLimit(result.error)))
                return
            }
        }
        this.heard()
    }

    /**
     * The worker said something, or was given something to do: it has until the watchdog fires to
     * say more while a request waits, and is ended once it has had no program open and nothing to
     * do for a while.
     */
    private heard() {
        clearTimeout(this.watchdog)
        clearTimeout(this.idle)
        const state = this.state
        if (!state) return
        if (this.current)
            this.watchdog = setTimeout(
                () =>
                    this.fail(
                        state,
                        `The decompiler stopped responding after ${this.silenceMs / 1000} seconds.`
                    ),
                this.silenceMs
            )
        else if (
            !this.programs.size &&
            !this.queues.visible.length &&
            !this.queues.background.length
        )
            this.idle = setTimeout(() => this.end(state), this.idleMs)
    }

    /** Ends a worker and forgets its programs, so the next request starts a fresh one. */
    private end(state: WorkerState) {
        if (this.state !== state) return
        clearTimeout(this.watchdog)
        clearTimeout(this.idle)
        state.worker.terminate()
        this.state = undefined
        this.programs.clear()
        this.opening.clear()
        this.openFailures.clear()
    }

    /** Answers the request waiting on a worker that died or fell silent, and ends the worker. */
    private fail(state: WorkerState, message: string) {
        if (this.state !== state) return
        this.end(state)
        const job = this.current
        if (job) this.finish(job, { address: job.address, error: message }, false)
    }

    private post(request: PseudocodeRequest, transfer: Transferable[] = []) {
        const state = this.state ?? this.start()
        if (state.ready) state.worker.postMessage(request, transfer)
        else state.held.push([request, transfer])
    }

    /** Starts a worker; throws where none can start, such as where there is no `Worker`. */
    private start(): WorkerState {
        const worker = new this.WorkerClass()
        const state: WorkerState = { worker, ready: false, held: [], loaded: false }
        this.state = state
        worker.addEventListener('message', (event) =>
            this.receive(state, (event as MessageEvent<PseudocodeResponse>).data)
        )
        // A worker that fails to load or dies answers nothing: fail what waits on it, and let the
        // next request start a fresh one.
        worker.addEventListener('error', () => this.fail(state, DECOMPILER_STOPPED))
        worker.addEventListener('messageerror', () => this.fail(state, DECOMPILER_STOPPED))
        return state
    }
}

/** A request's key in `PseudocodeClient.jobs`: the same function is asked for once per lane. */
function jobKey(lane: PseudocodePriority, key: string) {
    return `${lane}\0${key}`
}

function failed(job: Job, error: unknown): PseudocodeResult {
    const message = error instanceof Error ? error.message : String(error)
    return { address: job.address, error: message }
}

/**
 * The decompiler's reason there is no Pseudocode, as the editor says it: a function past the time
 * limit ("main took longer than 30 seconds to decompile.") or past the instruction count ("main is
 * too long to decompile (over 100000 instructions).") as a sentence, anything else as given.
 */
export function decompilerReason(error: string): string {
    const tooLong = /^(.+) has more than (\d+) instructions$/s.exec(error)
    if (tooLong) return `${tooLong[1]} is too long to decompile (over ${tooLong[2]} instructions).`
    return / took longer than .* to decompile$/.test(error) ? `${error}.` : error
}

/** The reason for a function past its time limit, which a less busy machine may beat. */
export function isTimeLimit(error: string): boolean {
    return / took longer than .* to decompile\.?$/.test(error)
}

/** A result at the image's addresses, which are the Listing's shifted by its base, at link-time ones. */
function toLinkTime(result: DecompiledFunction, base: number): PseudocodeResult {
    if (!base) return result
    if ('error' in result) return { address: result.address - base, error: result.error }
    return {
        address: result.address - base,
        name: result.name,
        text: result.text,
        //ids are offsets from the function's entry, so no base moves them; a comment's tokens
        //carry the address it is at, shifted below as an instruction's are
        variables: result.variables,
        lines: result.lines.map((line) => ({
            text: line.text,
            addresses: line.addresses.map((address) => address - base),
            tokens: line.tokens.map((token) => {
                const moved = { ...token }
                if (token.address !== undefined) moved.address = token.address - base
                if (token.target !== undefined) moved.target = token.target - base
                return moved
            })
        }))
    }
}

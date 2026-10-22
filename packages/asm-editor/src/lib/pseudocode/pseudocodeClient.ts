import type { DecompiledFunction } from '@specy/decompiler'
import PseudocodeWorker from './pseudocode.worker?worker'
import { executableAnalysis } from '#lib/executables.ts'
import type { Listing } from '#lib/listing/listing.ts'
import { byteEditsKey, fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import { programImage } from './programImage'
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

export type PseudocodeOptions = {
    /** Gives up waiting: the promise rejects with the signal's reason. */
    signal?: AbortSignal
    onStage?: (stage: PseudocodeStage) => void
}

type ClientOptions = {
    silenceMs?: number
    idleMs?: number
    /** The prototypes passed with every program; glibc's from the package by default. */
    prototypes?: () => Promise<string>
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
    resolve(result: PseudocodeResult): void
    reject(reason: unknown): void
    onStage?: (stage: PseudocodeStage) => void
    cleanup?: () => void
}

type Job = {
    key: string
    programKey: string
    path: string
    file: ProjectFile
    listing: Listing
    /** Link-time. */
    address: number
    callers: Set<Caller>
    started: boolean
    stage?: PseudocodeStage
    /** The request's id once posted, and the program it names. */
    id?: number
    program?: number
}

/**
 * The editor's side of the Pseudocode worker (plan decision 8), one per Workbench session. It
 * keeps one program open in the worker per Executable path, opened with the Executable's bytes,
 * Byte edits included, and its Listing's names (`programImage`), and opened again when they
 * change; `release` closes one once no pane shows it. Requests are answered one at a time, in
 * order; one asked for again while it waits, by another pane, waits with it. Results are kept by
 * the File's content, its Byte edits, the Listing's base and names version, the function's
 * address and the decompiler's version, the last {@link KEPT_PSEUDOCODE}; a failure is not kept
 * when another try may answer: past the decompiler's time limit (a busy machine), or the worker
 * failing.
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
    private readonly queue: Job[] = []
    private readonly jobs = new Map<string, Job>()
    private current?: Job
    private readonly programs = new Map<string, OpenProgram>()
    /** Opens still unanswered, by request id, and why each that failed did. */
    private readonly opening = new Map<number, OpenProgram>()
    private readonly openFailures = new Map<number, string>()
    private readonly results = new Map<string, PseudocodeResult>()
    /** A short number for each content string, as `ListingDocuments` keeps them. */
    private readonly contentIds = new Map<string, number>()
    private nextContentId = 0
    private nextId = 1
    private nextProgram = 1
    /** Counts `dispose` calls, so work started before one does not finish after it. */
    private generation = 0
    private watchdog: ReturnType<typeof setTimeout> | undefined
    private idle: ReturnType<typeof setTimeout> | undefined
    private glibc?: Promise<string>
    private readonly silenceMs: number
    private readonly idleMs: number
    /** The Ghidra release and commit of the decompiler, once one has loaded. */
    version: string | undefined

    constructor(
        private readonly WorkerClass: PseudocodeWorkerConstructor = PseudocodeWorker,
        private readonly options: ClientOptions = {}
    ) {
        this.silenceMs = options.silenceMs ?? PSEUDOCODE_WORKER_SILENCE_MS
        this.idleMs = options.idleMs ?? PSEUDOCODE_WORKER_IDLE_MS
    }

    /**
     * The Pseudocode of the function starting at a link-time `address` of the Executable shown at
     * `path`, whose `listing` was made from `file`'s bytes. Never rejects but through `signal`.
     */
    decompile(
        path: string,
        file: ProjectFile,
        listing: Listing,
        address: number,
        options: PseudocodeOptions = {}
    ): Promise<PseudocodeResult> {
        const programKey = `${this.contentId(file.content)}\0${byteEditsKey(file)}\0${listing.base}\0${listing.version}`
        const key = `${programKey}\0${address}`
        const kept = this.version === undefined ? undefined : this.kept(key)
        if (kept) return Promise.resolve(kept)
        const { signal } = options
        if (signal?.aborted) return Promise.reject(signal.reason)
        return new Promise<PseudocodeResult>((resolve, reject) => {
            let job = this.jobs.get(key)
            if (!job) {
                job = {
                    key,
                    programKey,
                    path,
                    file,
                    listing,
                    address,
                    callers: new Set(),
                    started: false
                }
                this.jobs.set(key, job)
                this.queue.push(job)
            }
            const waiting = job
            const caller: Caller = { resolve, reject, onStage: options.onStage }
            waiting.callers.add(caller)
            if (signal) {
                const abort = () => {
                    waiting.callers.delete(caller)
                    reject(signal.reason)
                    // Nobody waits for it any more: unless it has started, it is not asked for.
                    // One no longer queued (answered, or dropped with the client) takes nothing
                    // else with it.
                    const queued = this.queue.indexOf(waiting)
                    if (!waiting.started && !waiting.callers.size && queued >= 0) {
                        this.jobs.delete(waiting.key)
                        this.queue.splice(queued, 1)
                        this.heard()
                    }
                }
                signal.addEventListener('abort', abort, { once: true })
                caller.cleanup = () => signal.removeEventListener('abort', abort)
            }
            if (waiting.stage) caller.onStage?.(waiting.stage)
            void this.next()
        })
    }

    /**
     * Closes the program open for a path, once no pane shows its Pseudocode. A request for it
     * later opens it again.
     */
    release(path: string): void {
        const program = this.programs.get(path)
        if (!program) return
        this.programs.delete(path)
        if (this.state) this.post({ type: 'close', program: program.number })
        this.heard()
    }

    /**
     * Ends the worker and forgets every program and result, as the Workbench session ends;
     * whatever still waits is answered with an error. A later request starts afresh.
     */
    dispose(): void {
        this.generation++
        const waiting = [...this.jobs.values()]
        this.queue.length = 0
        this.jobs.clear()
        this.current = undefined
        if (this.state) this.end(this.state)
        this.results.clear()
        this.contentIds.clear()
        for (const job of waiting)
            this.answer(job, { address: job.address, error: 'The decompiler was closed' })
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

    /** Starts the next request in the queue once none is under way. */
    private async next() {
        if (this.current) return
        const job = this.queue.shift()
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
        } catch (error) {
            return this.finish(job, failed(job, error, 'The decompiler failed: '), false)
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
        this.post({
            type: 'decompile',
            id: job.id,
            program: program.number,
            address: job.address + job.listing.base
        })
        this.heard()
    }

    private stage(job: Job, stage: PseudocodeStage) {
        if (job.stage === stage) return
        job.stage = stage
        for (const caller of job.callers) caller.onStage?.(stage)
    }

    /** Answers a request and starts the next. */
    private finish(job: Job, result: PseudocodeResult, keep: boolean) {
        if (this.current === job) this.current = undefined
        this.jobs.delete(job.key)
        if (keep) this.keep(job.key, result)
        this.answer(job, result)
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
                this.finish(job, { address: job.address, error: message }, false)
                return
            }
            case 'function': {
                const job = this.current
                if (job?.id !== response.id) break
                const result = toLinkTime(response.result, job.listing.base)
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
                        `The decompiler stopped answering: nothing came from it for ${this.silenceMs / 1000} seconds`
                    ),
                this.silenceMs
            )
        else if (!this.programs.size && !this.queue.length)
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
        worker.addEventListener('error', (event) =>
            this.fail(
                state,
                `The decompiler failed: ${(event as ErrorEvent).message || 'its worker failed to start'}`
            )
        )
        worker.addEventListener('messageerror', () =>
            this.fail(state, 'The decompiler failed: its worker sent an unreadable message')
        )
        return state
    }

    private contentId(content: string): number {
        let id = this.contentIds.get(content)
        if (id === undefined) {
            //ids are never reused, so forgetting them only costs a result decompiled again
            if (this.contentIds.size >= 4 * KEPT_PSEUDOCODE) this.contentIds.clear()
            id = ++this.nextContentId
            this.contentIds.set(content, id)
        }
        return id
    }
}

function failed(job: Job, error: unknown, prefix = ''): PseudocodeResult {
    const message = error instanceof Error ? error.message : String(error)
    return { address: job.address, error: `${prefix}${message}` }
}

/** The decompiler's message for a function past its time limit, which a less busy machine may beat. */
function isTimeLimit(error: string) {
    return / took longer than .* to decompile$/.test(error)
}

/** A result at the image's addresses, which are the Listing's shifted by its base, at link-time ones. */
function toLinkTime(result: DecompiledFunction, base: number): PseudocodeResult {
    if (!base) return result
    if ('error' in result) return { address: result.address - base, error: result.error }
    return {
        address: result.address - base,
        name: result.name,
        text: result.text,
        //ids are offsets from the function's entry, so no base moves them
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

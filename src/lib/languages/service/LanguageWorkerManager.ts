import M68kWorker from './workers/m68k.worker?worker'
import MarsWorker from './workers/mars.worker?worker'
import X86Worker from './workers/x86.worker?worker'
import Z80Worker from './workers/z80.worker?worker'
import type { ProjectAnalysisTarget, ProjectWorkerRequest, ProjectWorkerResponse } from './protocol'

type Listener = (response: ProjectWorkerResponse) => void
type WorkerConstructor = new () => Worker
type WorkerState = {
    worker: Worker
    listeners: Map<string, Listener>
    idleTimer?: ReturnType<typeof setTimeout>
}

const IDLE_TERMINATION_MS = 30_000

const WORKER_BY_TARGET = {
    M68K: M68kWorker,
    MIPS: MarsWorker,
    'RISC-V': MarsWorker,
    'RISC-V-64': MarsWorker,
    X86: X86Worker,
    Z80: Z80Worker
} satisfies Record<ProjectAnalysisTarget, WorkerConstructor>

class LanguageWorkerManager {
    private states = new Map<ProjectAnalysisTarget, WorkerState>()
    /** Kept past a Worker's death so its sessions can still be told that it died. */
    private failureListeners = new Map<string, Listener>()

    acquire(target: ProjectAnalysisTarget, sessionId: string, listener: Listener) {
        if (typeof Worker === 'undefined') return undefined
        let state = this.states.get(target)
        if (!state) {
            state = this.createWorker(target)
            this.states.set(target, state)
        }
        if (state.idleTimer !== undefined) {
            clearTimeout(state.idleTimer)
            state.idleTimer = undefined
        }
        state.listeners.set(sessionId, listener)
        this.failureListeners.set(sessionId, listener)
        return {
            post: (request: ProjectWorkerRequest) => state.worker.postMessage(request),
            dispose: () => this.release(target, sessionId)
        }
    }

    private createWorker(target: ProjectAnalysisTarget): WorkerState {
        const WorkerClass = WORKER_BY_TARGET[target]
        const worker = new WorkerClass()
        const state: WorkerState = { worker, listeners: new Map() }
        worker.addEventListener('message', (event: MessageEvent<ProjectWorkerResponse>) => {
            const response = event.data
            const sessionId =
                response.type === 'analysis' ? response.snapshot.sessionId : response.sessionId
            state.listeners.get(sessionId)?.(response)
        })
        /**
         * A Worker that fails to load, or dies part way through an analysis, answers nothing at all:
         * without this every session waiting on it stays pending forever, showing a spinner, no
         * diagnostics and no reason why. Tell every session attached to it, then drop the state so
         * the next session to ask for this Target builds a fresh Worker.
         */
        const fail = (message: string) => {
            const waiting = [...state.listeners.keys()]
            if (this.states.get(target) === state) this.states.delete(target)
            state.listeners.clear()
            if (state.idleTimer !== undefined) clearTimeout(state.idleTimer)
            state.worker.terminate()
            for (const sessionId of waiting) {
                //revision 0 is older than any live revision, so a session takes it whatever it is
                //waiting for rather than matching it against the request it never got an answer to.
                this.notify(sessionId, { type: 'failure', sessionId, revision: 0, message })
            }
        }
        worker.addEventListener('error', (event) =>
            fail(
                `${target} analysis stopped: ${event.message || 'the worker failed to start'}. Reload the page to restart it.`
            )
        )
        worker.addEventListener('messageerror', () =>
            fail(
                `${target} analysis stopped: unreadable worker message. Reload the page to restart it.`
            )
        )
        return state
    }

    private notify(sessionId: string, response: ProjectWorkerResponse) {
        this.failureListeners.get(sessionId)?.(response)
    }

    private release(target: ProjectAnalysisTarget, sessionId: string) {
        const state = this.states.get(target)
        if (!state) return
        state.worker.postMessage({ type: 'dispose', sessionId } satisfies ProjectWorkerRequest)
        state.listeners.delete(sessionId)
        this.failureListeners.delete(sessionId)
        if (state.listeners.size > 0) return
        state.idleTimer = setTimeout(() => {
            if (state.listeners.size > 0) return
            state.worker.terminate()
            this.states.delete(target)
        }, IDLE_TERMINATION_MS)
    }
}

export const languageWorkerManager = new LanguageWorkerManager()

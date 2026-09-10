import M68kWorker from './workers/m68k.worker?worker'
import MarsWorker from './workers/mars.worker?worker'
import X86Worker from './workers/x86.worker?worker'
import Z80Worker from './workers/z80.worker?worker'
import type {
    ProjectAnalysisTarget,
    ProjectWorkerRequest,
    ProjectWorkerResponse
} from './protocol'

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
        return state
    }

    private release(target: ProjectAnalysisTarget, sessionId: string) {
        const state = this.states.get(target)
        if (!state) return
        state.worker.postMessage({ type: 'dispose', sessionId } satisfies ProjectWorkerRequest)
        state.listeners.delete(sessionId)
        if (state.listeners.size > 0) return
        state.idleTimer = setTimeout(() => {
            if (state.listeners.size > 0) return
            state.worker.terminate()
            this.states.delete(target)
        }, IDLE_TERMINATION_MS)
    }
}

export const languageWorkerManager = new LanguageWorkerManager()

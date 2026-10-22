import type { DecompiledProgram, Decompiler } from '@specy/decompiler'
import type { PseudocodeRequest, PseudocodeResponse } from './protocol'

/** Loads the decompiler package and its x86-64 description, on the first request only. */
export async function loadX86Decompiler(): Promise<Decompiler> {
    const { loadDecompiler } = await import('@specy/decompiler')
    return loadDecompiler({ architecture: 'x86-64' })
}

export type PseudocodeServiceOptions = {
    /** How the decompiler is loaded; {@link loadX86Decompiler} by default. */
    load?: () => Promise<Decompiler>
}

/**
 * Answers Pseudocode requests one at a time, in order, keeping the programs the client opens:
 * one per Executable shown, until the client closes it. A decompilation runs on this thread until
 * it returns, up to the decompiler's own 30-second limit, so the service runs in a worker.
 *
 * A decompiler that throws rather than answering (a WebAssembly trap in Ghidra's code) may have
 * been left inconsistent, so it is dropped with every program, and the next request loads a new
 * one; the client opens its programs again.
 */
export function createPseudocodeService(
    post: (response: PseudocodeResponse) => void,
    options: PseudocodeServiceOptions = {}
) {
    const load = options.load ?? loadX86Decompiler
    let loading: Promise<Decompiler> | undefined
    const programs = new Map<number, DecompiledProgram>()
    let queue = Promise.resolve()

    function decompiler(): Promise<Decompiler> {
        if (!loading) {
            const loaded = load().then((decompiler) => {
                post({ type: 'loaded', version: decompiler.version })
                return decompiler
            })
            loaded.catch(() => {
                if (loading === loaded) loading = undefined
            })
            loading = loaded
        }
        return loading
    }

    /** Disposes every program and the decompiler, so the next request loads a new one. */
    function drop() {
        const dropped = loading
        loading = undefined
        programs.clear()
        dropped?.then(
            (decompiler) => {
                try {
                    decompiler.dispose()
                } catch {
                    // A decompiler that trapped may fail to dispose too; it is dropped anyway.
                }
            },
            () => undefined
        )
    }

    async function answer(request: PseudocodeRequest) {
        if (request.type === 'close') {
            programs.get(request.program)?.dispose()
            programs.delete(request.program)
            return
        }
        let loaded: Decompiler
        try {
            loaded = await decompiler()
        } catch (error) {
            return post({ type: 'failure', id: request.id, message: messageOf(error) })
        }
        try {
            if (request.type === 'open') {
                programs.get(request.program)?.dispose()
                programs.delete(request.program)
                //a C++ name as far as tells it apart where it is used: `std::string::operator+=`
                //from `main`, `size` inside another member of `std::string` (cpp-demangling.md,
                //decision 14)
                const program = loaded.openProgram(request.image, { namespaces: 'minimal' })
                programs.set(request.program, program)
                post({ type: 'opened', id: request.id, warnings: program.warnings })
            } else {
                const program = programs.get(request.program)
                if (!program) throw new ClosedProgramError('The program is not open')
                post({
                    type: 'function',
                    id: request.id,
                    result: program.decompile(request.address, request.options)
                })
            }
        } catch (error) {
            // A malformed image is refused before the decompiler sees it; anything else thrown
            // came out of the decompiler itself.
            const dropped =
                !(error instanceof ClosedProgramError) && !isRefusedImage(request, error)
            if (dropped) drop()
            post({
                type: 'failure',
                id: request.id,
                message: messageOf(error),
                ...(dropped ? { dropped } : {})
            })
        }
    }

    return {
        /** Queued, so a long decompilation and a short one asked for after it answer in order. */
        handle(request: PseudocodeRequest): Promise<void> {
            queue = queue.then(() => answer(request))
            return queue
        },
        /** Disposes every program and the decompiler, as the worker ends. */
        dispose() {
            drop()
        }
    }
}

class ClosedProgramError extends Error {}

/** `openProgram` throws a RangeError or an Error naming the image for one it will not take. */
function isRefusedImage(request: PseudocodeRequest, error: unknown) {
    return request.type === 'open' && !(error instanceof WebAssembly.RuntimeError)
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/** The part of a dedicated worker's global scope the service uses. */
export type PseudocodeWorkerScope = {
    postMessage(response: PseudocodeResponse): void
    addEventListener(
        type: 'message',
        listener: (event: MessageEvent<PseudocodeRequest>) => void
    ): void
}

/** Runs the service in a dedicated worker's global scope. */
export function startPseudocodeWorker(scope: PseudocodeWorkerScope) {
    const service = createPseudocodeService((response) => scope.postMessage(response))
    scope.addEventListener('message', (event: MessageEvent<PseudocodeRequest>) => {
        const type = event.data?.type
        if (type === 'open' || type === 'decompile' || type === 'close')
            void service.handle(event.data)
    })
    scope.postMessage({ type: 'ready' } satisfies PseudocodeResponse)
}

import type { DecompiledFunction, ProgramImage } from '@specy/decompiler'

/**
 * What the editor asks the decompiler's worker. The worker answers requests one at a time, in the
 * order they come, and loads the decompiler with the first one.
 */
export type PseudocodeRequest =
    /**
     * Opens a program image; `program` is the client's number for it, which the requests after
     * it name. A program already open under that number is disposed first.
     */
    | { type: 'open'; id: number; program: number; image: ProgramImage }
    /** Decompiles the function starting at `address`, an address of the image. */
    | { type: 'decompile'; id: number; program: number; address: number }
    /** Disposes a program. Nothing answers it. */
    | { type: 'close'; program: number }

export type PseudocodeResponse =
    /**
     * The worker's first message, once its listener exists: a request posted before it has
     * nothing listening for it yet, so the client holds requests until it arrives.
     */
    | { type: 'ready' }
    /**
     * Sent once the decompiler has loaded, before the answer to the request that loaded it, with
     * the Ghidra release and commit it was built from.
     */
    | { type: 'loaded'; version: string }
    | { type: 'opened'; id: number; warnings: readonly string[] }
    /** The decompiler's answer, its `{ address, error }` included. */
    | { type: 'function'; id: number; result: DecompiledFunction }
    /**
     * A request the decompiler could not answer: it did not load, the program did not open or is
     * not open, or the decompiler threw. `dropped` when the decompiler threw from inside (a
     * WebAssembly trap), after which the worker drops it with every program it had open; the
     * next request loads it again, and programs must be opened again.
     */
    | { type: 'failure'; id: number; message: string; dropped?: boolean }

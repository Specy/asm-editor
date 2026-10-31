/**
 * What the PCM worklet and the output that owns its node say to each other. Apart from
 * `pcmProcessor.ts`, so the page imports these without bundling the processor, which registers
 * itself the moment it loads.
 */

/** The name the worklet registers its processor under. */
export const PCM_PROCESSOR = 'asm-editor-pcm'

/** Times are seconds on the output's clock, which the output mapped from Program time. */
export type PcmCommand =
    /** Interleaved stereo frames due from `start`, at `rate` frames a second. */
    | { type: 'chunk'; start: number; rate: number; frames: Float32Array }
    /** Every frame due after `after` dropped. */
    | { type: 'cut'; after: number }
    /** The program's mixer gain for each side from `at`, 0 to 1. */
    | { type: 'gain'; at: number; left: number; right: number }

/** What the output posts to the node. */
export type PcmMessage = { type: 'commands'; commands: PcmCommand[] } | { type: 'dispose' }

/** What the node posts back: whether it still has sound to play, each time that changes. */
export type PcmReport = { type: 'busy'; busy: boolean }

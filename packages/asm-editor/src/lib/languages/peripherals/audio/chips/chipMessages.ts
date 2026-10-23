import type { ChipCommand } from '../AudioOutput'

/**
 * What the chip worklet and the output that owns its node say to each other. Apart from
 * `chipProcessor.ts`, so the page imports these without bundling the processor, which registers
 * itself the moment it loads.
 */

/** The name the worklet registers its processor under. */
export const CHIP_PROCESSOR = 'asm-editor-chips'

/** What the output posts to the node. */
export type ChipMessage = { type: 'commands'; commands: ChipCommand[] } | { type: 'dispose' }

/** What the node posts back: whether it can still be heard, each time that changes. */
export type ChipReport = { type: 'audible'; audible: boolean }

import { describe, it } from 'vitest'
import { settingsStore } from '$stores/settingsStore.svelte'
import {
    ANIMATION_EXAMPLES,
    buildProgram,
    example,
    median,
    printTable,
    round,
    startFakeRenderer,
    type AnimationExample
} from './harness'

/**
 * What the animation examples cost and how evenly they run: the interval between the frames a
 * program paces itself with under the host clock ([ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)),
 * and the Screen Undo journal they fill ([ADR 0005](../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
 *
 * The journal number is what sets the shipped history budget: Undo walks the Core's instruction
 * history one Screen record per step, the shipped Core history is 100 steps, so the budget has to
 * hold the newest 100 records of the heaviest program — a clear and a present at 640 by 480 are a
 * megabyte each.
 *
 * A run is bounded by an instruction limit rather than by Stop, because Stop resets the Screen and
 * its journal; the limit is found by doubling until the program has drawn enough frames.
 */

/** Frames to pace and to fill the journal with: enough that the newest 100 records are all frames. */
const WANTED_FRAMES = 120
/** The Undo depth the shipped `maxHistorySize` gives the Core, and so the window to measure. */
const UNDO_STEPS = 100
/**
 * A budget nothing evicts within the frames measured, so the journal is read before it is truncated.
 * It is not unlimited on purpose: the M68K example journals a megabyte a frame.
 */
const MEASUREMENT_BUDGET_MB = 512
/** Big enough that the frame count, not the limit, is what ends a run. */
const INSTRUCTION_LIMIT = 50_000_000
/**
 * How the run is ended once it has drawn enough frames. Stop would reset the Screen and its journal,
 * and an instruction limit buys a different number of frames on every Core — one M68K slice charges
 * one instruction per trap where the Z80 charges every instruction it runs — so the run is ended
 * from inside the clock the program paces itself on, which leaves everything else standing.
 */
const ENOUGH_FRAMES = 'measurement: enough frames'

type Frames = {
    /** When the program asked for time to pass, which is once per frame in every example here. */
    waits: number[]
    presents: number
    historyBytes: number
    historyDepth: number
    bytesPerUndoWindow: number
    recordsUndone: number
    errors: string[]
    size: string
}

async function measure(animation: AnimationExample): Promise<Frames> {
    const emulator = await buildProgram(animation.language, example(animation.path), {
        display: animation.display
    })
    const screen = emulator.peripherals.screen
    const clock = emulator.peripherals.clock
    const waits: number[] = []
    let presents = 0
    //the adapters read the clock and draw on the Screen through these very instances, so wrapping
    //the two methods is enough to see every frame a program asks for
    const wait = clock.wait.bind(clock)
    const nextFrame = clock.nextFrame.bind(clock)
    const present = screen.present.bind(screen)
    const wrapped = clock as unknown as {
        wait: (ms: number) => Promise<void>
        nextFrame: () => Promise<void>
    }
    const frame = () => {
        waits.push(performance.now())
        if (waits.length >= WANTED_FRAMES) throw new Error(ENOUGH_FRAMES)
    }
    wrapped.wait = (milliseconds: number) => {
        frame()
        return wait(milliseconds)
    }
    wrapped.nextFrame = () => {
        frame()
        return nextFrame()
    }
    ;(screen as unknown as { present: () => void }).present = () => {
        presents++
        present()
    }
    const stopRenderer = startFakeRenderer(screen)
    await emulator.run(INSTRUCTION_LIMIT)
    stopRenderer()

    const historyBytes = screen.history.bytes
    const historyDepth = screen.history.depth
    let recordsUndone = 0
    while (recordsUndone < UNDO_STEPS && screen.canUndo()) {
        screen.undo()
        recordsUndone++
    }
    const frames: Frames = {
        waits,
        presents,
        historyBytes,
        historyDepth,
        bytesPerUndoWindow: historyBytes - screen.history.bytes,
        recordsUndone,
        //the run was ended from the clock once it had drawn enough, which is not a failure here
        errors: emulator.errors.filter(
            (error) => !error.includes(ENOUGH_FRAMES) && !/limit/i.test(error)
        ),
        size: `${screen.width} × ${screen.height}`
    }
    emulator.dispose?.()
    return frames
}

function intervals(stamps: number[]): number[] {
    //the first frames carry the program's own set-up, which is not the pace it settles at
    const settled = stamps.slice(5)
    const gaps: number[] = []
    for (let index = 1; index < settled.length; index++)
        gaps.push(settled[index] - settled[index - 1])
    return gaps
}

describe('the animation examples', () => {
    const budget = settingsStore.values.screenHistoryBudgetMb.value
    const results = new Map<string, Frames>()

    it('paces its frames under the host clock and fills the Screen journal', async () => {
        settingsStore.values.screenHistoryBudgetMb.value = MEASUREMENT_BUDGET_MB
        try {
            for (const animation of ANIMATION_EXAMPLES) {
                results.set(animation.path, await measure(animation))
            }
        } finally {
            settingsStore.values.screenHistoryBudgetMb.value = budget
        }

        printTable(
            'Frame pacing under the host clock',
            [
                'Core',
                'Program',
                'Paces on',
                'Frames',
                'Presents',
                'Median frame ms',
                'Slowest frame ms',
                'Frames/s'
            ],
            ANIMATION_EXAMPLES.map((animation) => {
                const frames = results.get(animation.path)
                if (!frames) return [animation.language, animation.path, animation.pacing, '—']
                const gaps = intervals(frames.waits)
                const middle = median(gaps)
                return [
                    animation.language,
                    animation.path,
                    animation.pacing,
                    frames.waits.length,
                    frames.presents,
                    round(middle),
                    round(Math.max(...gaps)),
                    round(1000 / middle)
                ]
            })
        )

        printTable(
            `Screen journal of the animation examples, ${UNDO_STEPS} undo steps`,
            [
                'Core',
                'Program',
                'Screen',
                'Frames',
                'Records',
                'Journal KB',
                'Records/frame',
                `KB for ${UNDO_STEPS} undo steps`
            ],
            ANIMATION_EXAMPLES.map((animation) => {
                const frames = results.get(animation.path)
                if (!frames) return [animation.language, animation.path, '—']
                return [
                    animation.language,
                    animation.path,
                    frames.size,
                    frames.waits.length,
                    frames.historyDepth,
                    Math.round(frames.historyBytes / 1024).toLocaleString('en-US'),
                    round(frames.historyDepth / Math.max(1, frames.waits.length), 2),
                    Math.round(frames.bytesPerUndoWindow / 1024).toLocaleString('en-US')
                ]
            })
        )

        const failed = ANIMATION_EXAMPLES.flatMap(
            (animation) => results.get(animation.path)?.errors ?? []
        )
        if (failed.length > 0) console.log(`errors: ${failed.join(' | ')}`)
    })
})

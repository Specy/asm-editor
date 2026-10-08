// Run against a Vite dev server; use PLAYWRIGHT_MODULE for an external Playwright installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
import fs from 'node:fs/promises'
import { cpus } from 'node:os'

const label = process.argv[2] ?? 'current'
const destination = process.argv[3] ?? `x86-scheduling-${label}.json`
const baseUrl = process.env.ASM_EDITOR_BENCH_URL ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM,
    headless: true,
    args: ['--no-sandbox']
})
try {
    const page = await browser.newPage()
    const errors = []
    const client = await page.context().newCDPSession(page)
    await page.exposeFunction('benchmarkThrottle', (rate) =>
        client.send('Emulation.setCPUThrottlingRate', { rate })
    )
    const responseThrottle = Number(process.env.BENCH_RESPONSIVENESS_THROTTLE ?? 1)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(new URL('/projects', baseUrl).href, { waitUntil: 'networkidle' })
    const results = await page.evaluate(async (responseThrottle) => {
        const { X86Emulator } = await import('/src/lib/languages/X86/X86Emulator.svelte.ts')
        const { UNDO_HISTORY_SIZE } = await import('/src/lib/projectSettings.ts')
        const programs = {
            compute: { body: 'inc rbx\njmp loop', width: 2 },
            memory: { body: 'inc rbx\nmov [cell], rbx\nmov rdx, [cell]\njmp loop', width: 4 },
            sse: {
                setup: 'pcmpeqd xmm1, xmm1',
                body: 'inc rbx\npaddq xmm0, xmm1\npxor xmm2, xmm0\njmp loop',
                width: 4
            }
        }
        const results = []
        const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
        for (const history of [UNDO_HISTORY_SIZE, 0]) {
            for (const [workload, program] of Object.entries(programs)) {
                const code = `bits 64\nglobal _start\nsection .data\ncell: dq 0\nsection .text\n_start:\n${program.setup ?? ''}\nloop:\n${program.body}\n`
                const emulator = await X86Emulator(code, { automaticChecking: false })
                try {
                    const count = 1000000
                    await emulator.compile(history, code)
                    const core = emulator.core
                    const slice = async () => {
                        let instructions = 0
                        while (instructions < count) {
                            const budget = Math.min(50000, count - instructions)
                            await core.run(budget, [], { skipBreakpointAtPc: true })
                            if (Number(core.stopReason?.executedInstructions) !== budget)
                                throw Error('Core did not run its full budget')
                            instructions += budget
                        }
                        return { instructions }
                    }
                    await slice()
                    const unsliced = []
                    for (let i = 0; i < 3; i++) {
                        const before = core.getRegisterValue('rbx')
                        const start = performance.now()
                        const result = await slice()
                        unsliced.push(performance.now() - start)
                        if (result.instructions !== count)
                            throw Error(`Wrong slice count: ${result.instructions}`)
                        const increment = Number(core.getRegisterValue('rbx') - before)
                        if (Math.abs(increment - count / program.width) > 1)
                            throw Error('Wrong final RBX')
                    }
                    await emulator.compile(history, code)
                    const traces = []
                    const original = emulator._runSlice.bind(emulator)
                    emulator._runSlice = async (request) => {
                        const start = performance.now()
                        const result = await original(request)
                        traces.push({
                            count: result.instructions,
                            ms: performance.now() - start,
                            correction: request.speedCorrection,
                            start,
                            end: performance.now()
                        })
                        return result
                    }
                    const coldStart = performance.now()
                    await emulator.run(count)
                    const coldRunMs = performance.now() - coldStart
                    const coldSlices = traces.length
                    const firstSlice = traces[0]
                    const sliced = []
                    const hostYieldPercent = []
                    for (let i = 0; i < 3; i++) {
                        const before = core.getRegisterValue('rbx')
                        const start = performance.now()
                        const first = traces.length
                        await emulator.run(count)
                        const elapsed = performance.now() - start
                        sliced.push(elapsed)
                        let gap = 0
                        for (let j = first + 1; j < traces.length; j++)
                            gap += traces[j].start - traces[j - 1].end
                        hostYieldPercent.push((gap / elapsed) * 100)
                        const increment = Number(core.getRegisterValue('rbx') - before)
                        if (Math.abs(increment - count / program.width) > 1)
                            throw Error('Wrong scheduled RBX')
                    }
                    await window.benchmarkThrottle(responseThrottle)
                    const pauseDue = performance.now() + 500
                    let pauseAt
                    const pauseTimer = setTimeout(() => {
                        pauseAt = performance.now()
                        emulator.pause()
                    }, 500)
                    await emulator.run(0)
                    const pausedAt = performance.now()
                    clearTimeout(pauseTimer)
                    if (!pauseAt || !emulator.state.paused) throw Error('Pause failed')
                    const lag = []
                    let due = performance.now() + 10
                    const timer = setInterval(() => {
                        const now = performance.now()
                        lag.push(Math.max(0, now - due))
                        due = now + 10
                    }, 10)
                    const stopDue = performance.now() + 1000
                    let stopAt
                    const stopTimer = setTimeout(() => {
                        stopAt = performance.now()
                        emulator.clear()
                    }, 1000)
                    const running = emulator.run(0)
                    await running
                    const stoppedAt = performance.now()
                    clearInterval(timer)
                    clearTimeout(stopTimer)
                    const rows = {
                        workload,
                        history,
                        instructions: count,
                        responseThrottle,
                        hostYieldPercent,
                        unslicedMs: unsliced,
                        slicedMs: sliced,
                        unslicedMedianMs: median(unsliced),
                        slicedMedianMs: median(sliced),
                        unslicedInstructionsPerMs: count / median(unsliced),
                        slicedInstructionsPerMs: count / median(sliced),
                        schedulingOverheadPercent: (median(sliced) / median(unsliced) - 1) * 100,
                        coldRunMs,
                        coldSlices,
                        firstSlice,
                        worstSliceMs: Math.max(...traces.map((row) => row.ms)),
                        maxInstructionsPerSlice: Math.max(...traces.map((row) => row.count)),
                        maxCorrection: Math.max(...traces.map((row) => row.correction)),
                        medianLoopLagMs: median(lag),
                        worstLoopLagMs: Math.max(...lag),
                        stopDeliveryLagMs: stopAt - stopDue,
                        stopSettlementMs: stoppedAt - stopAt,
                        stopTotalDelayMs: stoppedAt - stopDue,
                        pauseTotalDelayMs: pausedAt - pauseDue,
                        errors: [...emulator.errors]
                    }
                    if (!stopAt || rows.errors.length) throw Error(JSON.stringify(rows))
                    results.push(rows)
                    console.log('MEASURE', JSON.stringify(rows))
                    await window.benchmarkThrottle(1)
                } finally {
                    emulator.dispose()
                }
            }
        }
        return results
    }, responseThrottle)
    const output = {
        label,
        browser: browser.version(),
        cpu: cpus()[0]?.model,
        results,
        pageErrors: errors
    }
    await fs.writeFile(destination, JSON.stringify(output, null, 2) + '\n')
    console.table(
        results.map(
            ({
                workload,
                history,
                unslicedInstructionsPerMs,
                slicedInstructionsPerMs,
                schedulingOverheadPercent,
                coldRunMs,
                worstLoopLagMs,
                stopTotalDelayMs
            }) => ({
                workload,
                history,
                unslicedIPS: Math.round(unslicedInstructionsPerMs * 1000),
                slicedIPS: Math.round(slicedInstructionsPerMs * 1000),
                overhead: schedulingOverheadPercent.toFixed(1) + '%',
                coldRunMs: coldRunMs.toFixed(1),
                worstLag: worstLoopLagMs.toFixed(1),
                stopMs: stopTotalDelayMs.toFixed(1)
            })
        )
    )
    if (errors.length) throw Error(errors.join('\n'))
} finally {
    await browser.close()
}

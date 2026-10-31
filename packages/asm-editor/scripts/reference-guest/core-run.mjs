// Runs the reference guest's probe in the x86 Core, @specy/x86 built in
// packages/x86/blink-js/dist, one section a run, for comparing with facts.txt
// (guest.py compare). The Core takes the same static binary the guest runs.
//
//     node core-run.mjs PROBE OUT [SECTION...]
//
// The events section is left out by default: nothing injects input here.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [probe, out, ...asked] = process.argv.slice(2)
if (!probe || !out) {
    console.error('usage: node core-run.mjs PROBE OUT [SECTION...]')
    process.exit(2)
}
const sections = asked.length
    ? asked
    : ['system', 'nodes', 'input', 'fb', 'dsp-busy', 'dsp', 'mixer', 'midi', 'speaker', 'console']
const dist = fileURLToPath(new URL('../../../x86/blink-js/dist/index.mjs', import.meta.url))
const { createX86Emulator, BlinkState } = await import(dist)
const bytes = readFileSync(probe)

let text = ''
for (const section of sections) {
    const emulator = await createX86Emulator()
    emulator.on('stdout', (b) => void (text += new TextDecoder().decode(b)))
    emulator.on('stderr', (b) => void (text += new TextDecoder().decode(b)))
    emulator.setDisplayMode({ width: 320, height: 240 })
    await emulator.loadElf(bytes)
    emulator.setProgramArguments('/program', ['--qemu=core', '--machine=core', section])
    emulator.initialize(0)
    try {
        for (let slice = 0; slice < 20000 && !emulator.hasTerminated(); slice++) {
            await emulator.run(5_000_000)
            if (emulator.stopReason?.kind === 'input') {
                await emulator.provideInput('\n')
                continue
            }
            // finite waits end on a host timer; the program may wait again at once
            while (emulator.state === BlinkState.ProgramWaitPause) {
                await new Promise((resolve) => {
                    const stop = emulator.on('stateChange', () => {
                        stop()
                        resolve()
                    })
                })
            }
        }
    } catch (error) {
        text += `core.error=${error}\n`
    }
    const stop = emulator.stopReason
    text += `core.stop=${stop?.kind} ${stop?.exitCode ?? ''}\n`
    emulator.dispose()
    console.error(`${section}: ${stop?.kind}`)
}
writeFileSync(out, text)

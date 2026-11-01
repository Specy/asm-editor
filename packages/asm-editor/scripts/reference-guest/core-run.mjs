// Runs the reference guest's probe in the x86 Core, @specy/x86 built in
// packages/x86/blink-js/dist, one section a run, for comparing with facts.txt
// (guest.py compare). The Core takes the same static binary the guest runs.
//
//     node core-run.mjs PROBE OUT [SECTION...]
//
// The events section gets the input guest.py injects through QMP, as the
// editor's Screen would deliver it (sendInputReport), at the same pace; the
// relative move QMP sends the PS/2 mouse has no counterpart, since the editor
// has no relative pointer.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [probe, out, ...asked] = process.argv.slice(2)
if (!probe || !out) {
    console.error('usage: node core-run.mjs PROBE OUT [SECTION...]')
    process.exit(2)
}
const sections = asked.length
    ? asked
    : [
          'system',
          'nodes',
          'input',
          'events',
          'fb',
          'dsp-midi',
          'dsp',
          'mixer',
          'midi',
          'speaker',
          'console'
      ]
const dist = fileURLToPath(new URL('../../../x86/blink-js/dist/index.mjs', import.meta.url))
const { createX86Emulator, BlinkState } = await import(dist)
const bytes = readFileSync(probe)

const EV_KEY = 1
const EV_REL = 2
const EV_ABS = 3
const REL_WHEEL = 8
// QMP's qcodes the injection uses, as Linux's KEY_* codes
const KEYS = {
    a: 30,
    right: 106,
    caps_lock: 58,
    num_lock: 69,
    scroll_lock: 70,
    pause: 119,
    print: 99,
    kp_1: 79,
    ctrl_r: 97,
    meta_l: 125,
    shift: 42
}
const BUTTONS = { left: 0x110, right: 0x111, middle: 0x112, side: 0x113, extra: 0x114 }
const WIDTH = 320
const HEIGHT = 240

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** guest.py's inject_input(), step for step, through sendInputReport(). */
async function injectInput(emulator) {
    const key = (code, down) =>
        emulator.sendInputReport('keyboard', [
            { type: EV_KEY, code: KEYS[code], value: down ? 1 : 0 }
        ])
    const tablet = (events) => emulator.sendInputReport('tablet', events)
    const abs = (axis, value) => ({ type: EV_ABS, code: axis === 'x' ? 0 : 1, value })
    const btn = (name, down) => ({ type: EV_KEY, code: BUTTONS[name], value: down ? 1 : 0 })
    const tap = async (code, hold = 150) => {
        key(code, true)
        await sleep(hold)
        key(code, false)
        await sleep(600)
    }
    for (const code of [
        'a',
        'right',
        'caps_lock',
        'caps_lock',
        'num_lock',
        'num_lock',
        'scroll_lock',
        'scroll_lock',
        'pause',
        'print',
        'kp_1',
        'ctrl_r',
        'meta_l'
    ])
        await tap(code)
    key('a', true)
    await sleep(1200)
    key('a', false)
    await sleep(600)
    key('shift', true)
    await sleep(100)
    await tap('a')
    key('shift', false)
    await sleep(600)
    const value = (pixel, size) => Math.floor((pixel * 32767) / size)
    for (const [px, py] of [
        [0, 0],
        [WIDTH - 1, 0],
        [WIDTH - 1, HEIGHT - 1],
        [0, HEIGHT - 1],
        [WIDTH / 2, HEIGHT / 2]
    ]) {
        tablet([abs('x', value(px, WIDTH)), abs('y', value(py, HEIGHT))])
        await sleep(500)
    }
    tablet([abs('x', 32767), abs('y', 32767)])
    await sleep(500)
    tablet([abs('x', 16384)])
    await sleep(400)
    tablet([abs('y', 16384)])
    await sleep(500)
    for (const name of ['left', 'right', 'middle', 'side', 'extra']) {
        tablet([btn(name, true)])
        await sleep(200)
        tablet([btn(name, false)])
        await sleep(500)
    }
    tablet([btn('left', true), btn('right', true)])
    await sleep(200)
    tablet([btn('left', false), btn('right', false)])
    await sleep(500)
    // QEMU's tablet has no horizontal wheel: wheel-left and wheel-right send nothing
    for (const notch of [1, 1, -1, 0, 0]) {
        if (notch) tablet([{ type: EV_REL, code: REL_WHEEL, value: notch }])
        await sleep(500)
    }
    tablet([btn('left', true)])
    await sleep(200)
    tablet([abs('x', 20000), abs('y', 20000)])
    await sleep(200)
    tablet([btn('left', false)])
    await sleep(500)
    await sleep(800)
}

let text = ''
for (const section of sections) {
    const emulator = await createX86Emulator()
    let injection = null
    emulator.on('stdout', (b) => void (text += new TextDecoder().decode(b)))
    emulator.on('stderr', (b) => {
        const written = new TextDecoder().decode(b)
        // the events section says when it listens on standard error
        if (written.includes('probe: events ready')) {
            injection = sleep(1000)
                .then(() => injectInput(emulator))
                .then(() => sleep(1000))
                .then(() => emulator.provideInput('\n'))
            return
        }
        text += written
    })
    emulator.setDisplayMode({ width: WIDTH, height: HEIGHT })
    await emulator.loadElf(bytes)
    emulator.setProgramArguments('/program', ['--qemu=core', '--machine=core', section])
    emulator.initialize(0)
    try {
        for (let slice = 0; slice < 20000 && !emulator.hasTerminated(); slice++) {
            await emulator.run(5_000_000)
            if (emulator.stopReason?.kind === 'input') {
                if (section === 'events') {
                    await injection
                    continue
                }
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
    await injection
    const stop = emulator.stopReason
    text += `core.stop=${stop?.kind} ${stop?.exitCode ?? ''}\n`
    emulator.dispose()
    console.error(`${section}: ${stop?.kind}`)
}
writeFileSync(out, text)

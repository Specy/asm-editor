import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import {
    RecordingAudioOutput,
    type AudioCommand
} from '#lib/languages/peripherals/audio/AudioOutput.ts'
import type { SoundBus, SoundClock } from './soundDevice'

/**
 * A memory, a clock and an Audio for the sound devices' tests: what a program stores lands in the
 * memory as the Core would put it there, then the device hears of it, as the Core's observers tell
 * it after the store.
 */
export function soundRig(options: { virtual?: boolean; silent?: boolean } = {}) {
    let time = 0
    const clock: SoundClock = {
        now: () => time,
        isVirtual: options.virtual ?? false,
        wait: (ms) => {
            time += ms
            return Promise.resolve()
        }
    }
    const output = new RecordingAudioOutput()
    const notes: string[] = []
    const audio = new Audio({ clock: { now: () => time }, output, silent: options.silent })
    audio.onNote = (text) => notes.push(text)
    const memory = new Map<number, number>()
    const word = (address: number) => memory.get(address >>> 0) ?? 0
    const bus: SoundBus = {
        push: (address, value) => memory.set(address >>> 0, value | 0),
        readWord: (address) => word(address)
    }
    let position: bigint | null = null
    let serial = 0n
    /** Everything the Audio has sent its output, the pending batch flushed first. */
    const commands = (): AudioCommand[] => {
        audio.flush()
        return output.commands
    }
    return {
        clock,
        audio,
        output,
        notes,
        bus,
        word,
        host: { clock: () => clock, audio: () => audio },
        at: (ms: number) => (time = ms),
        get now() {
            return time
        },
        /** Names a new instruction as the one running, as the Core's serial does, and returns it. */
        instruction: () => (position = ++serial),
        position: () => position,
        /** A store of `length` bytes into memory, little-endian, then the device's observer. */
        store(
            address: number,
            value: number,
            length: number,
            observe: (a: number, l: number, v: number) => void
        ) {
            for (let i = 0; i < length; i++) {
                const at = (address + i) >>> 0
                const aligned = (at & ~3) >>> 0
                const shift = 8 * (at & 3)
                const byte = (value >>> (8 * i)) & 0xff
                memory.set(aligned, (word(aligned) & ~(0xff << shift)) | (byte << shift))
            }
            observe(address >>> 0, length, value)
        },
        commands,
        midi: (): { at: number; message: number[] }[] =>
            commands().flatMap((command) =>
                command.type === 'midi' ? [{ at: command.at, message: [...command.message] }] : []
            ),
        cuts: () => commands().flatMap((command) => (command.type === 'cut' ? [command] : [])),
        pcm: () => commands().flatMap((command) => (command.type === 'pcm' ? [command] : []))
    }
}

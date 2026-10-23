import {
    SYNTH_BASES,
    SYNTH_CHANNEL_REGISTERS,
    SYNTH_UPLOAD_REGISTERS,
    SYNTH_WAVEFORMS,
    SYNTH_WAVETABLES,
    type SynthRegister,
    type SynthWaveform
} from '#lib/languages/synthRegisters.ts'
import { fillPlaceholders, proseEntries, type DocumentationEntry } from './entries'
import template from './synth.md?raw'

/**
 * The **Synth** chapter of MIPS, RISC-V and the M68K, one text for the three
 * ([the design record](../../../../../docs/design/waveform-sound.md#documentation-lectures-and-examples)):
 * the register tables come from `synthRegisters.ts`, which the device itself reads, and only the
 * addresses, the store instructions, the reference simulator and the examples vary.
 */

type Variant = 'MIPS' | 'RISC-V' | 'M68K'

const WAVEFORM_DESCRIPTIONS: Record<SynthWaveform, string> = {
    pulse: 'High while the phase is below the pulse width out of 4096, low for the rest of the period: 2048 is a square wave, and a narrower pulse sounds thinner and buzzier.',
    triangle: 'Rises and falls in straight lines: soft and flute-like, the classic bass.',
    sawtooth: 'Rises in a straight line and drops at once: bright and brassy.',
    sine: 'A pure tone, read from a 256-entry table.',
    noise: 'A 15-bit shift register stepped every time the phase wraps, so the frequency sets how bright the noise is: a few thousand Hz for a drum, tens of thousands for a cymbal.',
    wavetable: 'The channel’s 32 programmable samples, played once a period.',
    sample: 'Samples from Sample memory, the frequency being the playback rate.'
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

function hex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, '0')
}

function address(variant: Variant, value: number): string {
    return variant === 'M68K' ? `$${hex(value, 6)}` : `0x${hex(value, 8)}`
}

function offset(variant: Variant, value: number): string {
    return variant === 'M68K' ? `$${hex(value, 2)}` : `0x${hex(value, 2)}`
}

function fence(variant: Variant, code: string): string {
    const language = variant === 'MIPS' ? 'mips' : variant === 'RISC-V' ? 'riscv' : 'm68k'
    return `\`\`\`${language}\n${code}\n\`\`\``
}

function registerTable(variant: Variant, registers: readonly SynthRegister[]): string {
    //C reaches the registers through <sim.h> on MIPS and RISC-V; the M68K has no C
    const c = variant !== 'M68K'
    const rows = registers.map((register) =>
        [
            `\`${offset(variant, register.offset)}\``,
            String(register.bytes * 8),
            ...(c ? [`\`SIM_SYNTH_${register.name}\``] : []),
            register.description
        ].join(' | ')
    )
    const header = ['Offset', 'Bits', ...(c ? ['In C'] : []), 'Register']
    return [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row} |`)
    ].join('\n')
}

/** How C reaches the Synth through `<sim.h>`, on MIPS and RISC-V. */
function fromC(variant: Variant): string {
    if (variant === 'M68K') return ''
    const route = variant === 'MIPS' ? 'mips' : 'risc-v'
    return `## From C {#from-c}

\`<sim.h>\` names every register: \`SIM_SYNTH8(channel, register)\` and \`SIM_SYNTH16(channel, register)\` read and write a channel's registers of 8 and 16 bits, \`SIM_SYNTH_TABLE(channel)\` points at its wavetable, and the waveforms are \`SIM_SYNTH_PULSE\` to \`SIM_SYNTH_SAMPLE\`. Three functions do the common things: \`sim_synth_play(channel, hz)\` sets the frequency and turns the gate on, \`sim_synth_gate(channel, on)\` turns it on or off, and \`sim_synth_upload(source, length, offset)\` copies samples into Sample memory. See [Using C and C++](/documentation/${route}/using-c) for compiling.

\`\`\`c
#include <sim.h>

int main(void) {
    SIM_SYNTH8(0, SIM_SYNTH_WAVEFORM) = SIM_SYNTH_TRIANGLE;
    SIM_SYNTH8(0, SIM_SYNTH_VOLUME) = 100;
    SIM_SYNTH8(0, SIM_SYNTH_SUSTAIN) = 127;
    SIM_SYNTH16(0, SIM_SYNTH_RELEASE) = 300;
    unsigned scale[] = {262, 294, 330, 349, 392, 440, 494, 523};
    for (int i = 0; i < 8; i++) {
        sim_synth_play(0, scale[i]); /* C major, one note at a time */
        sim_sleep(200);
        sim_synth_gate(0, 0);
        sim_sleep(50);
    }
    return 0;
}
\`\`\`

`
}

function waveformTable(): string {
    const rows = SYNTH_WAVEFORMS.map(
        (waveform, value) => `| ${value} | ${waveform} | ${WAVEFORM_DESCRIPTIONS[waveform]} |`
    )
    return ['| Value | Waveform | Sound |', '| --- | --- | --- |', ...rows].join('\n')
}

function frequencyTable(): string {
    const octaves = [2, 3, 4, 5, 6]
    const rows = NOTE_NAMES.map((name, semitone) => {
        const cells = octaves.map((octave) => {
            const midi = 12 * (octave + 1) + semitone
            return String(Math.round(440 * 2 ** ((midi - 69) / 12)))
        })
        return `| ${name} | ${cells.join(' | ')} |`
    })
    return [
        `| Note | ${octaves.map((octave) => `Octave ${octave}`).join(' | ')} |`,
        `| --- | ${octaves.map(() => '---').join(' | ')} |`,
        ...rows,
        '',
        'Octave 4 starts at middle C, and its A is 440 Hz. One octave up doubles a frequency.'
    ].join('\n')
}

const TONE_EXAMPLE: Record<Variant, string> = {
    MIPS: `        li      $s0, 0xffff0100 # channel 0
        li      $t0, 440        # A above middle C, in Hz
        sh      $t0, 0($s0)     # frequency
        li      $t0, 1024       # a pulse high a quarter of the time
        sh      $t0, 2($s0)     # pulse width
        li      $t0, 20
        sh      $t0, 4($s0)     # attack: 20 ticks, about 20 ms
        li      $t0, 300
        sh      $t0, 6($s0)     # decay
        li      $t0, 400
        sh      $t0, 8($s0)     # release
        sb      $zero, 0x11($s0) # waveform 0: pulse
        li      $t0, 100
        sb      $t0, 0x12($s0)  # volume
        li      $t0, 64
        sb      $t0, 0x13($s0)  # sustain at half
        li      $t0, 1
        sb      $t0, 0x10($s0)  # gate on: the note starts
        li      $v0, 32
        li      $a0, 500
        syscall                 # half a second
        sb      $zero, 0x10($s0) # gate off: the note fades
        li      $a0, 500
        syscall
        li      $v0, 10
        syscall`,
    'RISC-V': `        li      s0, 0xffff0100  # channel 0
        li      t0, 440         # A above middle C, in Hz
        sh      t0, 0(s0)       # frequency
        li      t0, 1024        # a pulse high a quarter of the time
        sh      t0, 2(s0)       # pulse width
        li      t0, 20
        sh      t0, 4(s0)       # attack: 20 ticks, about 20 ms
        li      t0, 300
        sh      t0, 6(s0)       # decay
        li      t0, 400
        sh      t0, 8(s0)       # release
        sb      zero, 0x11(s0)  # waveform 0: pulse
        li      t0, 100
        sb      t0, 0x12(s0)    # volume
        li      t0, 64
        sb      t0, 0x13(s0)    # sustain at half
        li      t0, 1
        sb      t0, 0x10(s0)    # gate on: the note starts
        li      a7, 32
        li      a0, 500
        ecall                   # half a second
        sb      zero, 0x10(s0)  # gate off: the note fades
        li      a0, 500
        ecall
        li      a7, 10
        ecall`,
    M68K: `SYNTH   equ     $E00100
        ORG     $1000
start:  lea     SYNTH,a0        ; channel 0
        move.w  #440,(a0)       ; frequency: A above middle C, in Hz
        move.w  #1024,2(a0)     ; pulse width: high a quarter of the time
        move.w  #20,4(a0)       ; attack: 20 ticks, about 20 ms
        move.w  #300,6(a0)      ; decay
        move.w  #400,8(a0)      ; release
        move.b  #0,$11(a0)      ; waveform 0: pulse
        move.b  #100,$12(a0)    ; volume
        move.b  #64,$13(a0)     ; sustain at half
        move.b  #1,$10(a0)      ; gate on: the note starts
        move.l  #50,d1          ; half a second, in hundredths
        move.b  #23,d0
        trap    #15
        move.b  #0,$10(a0)      ; gate off: the note fades
        move.b  #23,d0
        trap    #15
        simhalt
        END     start`
}

const WAVETABLE_EXAMPLE: Record<Variant, string> = {
    MIPS: `        li      $s0, 0xffff0100
        li      $t0, 0xfffffff0 # 15, 15, ... then 0, 0, ...:
        sw      $t0, 0x100($s0) # the first eight samples of channel 0's table
        li      $t0, 5
        sb      $t0, 0x11($s0)  # waveform 5: wavetable`,
    'RISC-V': `        li      s0, 0xffff0100
        li      t0, 0xfffffff0  # 15, 15, ... then 0, 0, ...:
        sw      t0, 0x100(s0)   # the first eight samples of channel 0's table
        li      t0, 5
        sb      t0, 0x11(s0)    # waveform 5: wavetable`,
    M68K: `        lea     $E00100,a0
        move.l  #$FFFFFFF0,$100(a0) ; the first eight samples of channel 0's table
        move.b  #5,$11(a0)          ; waveform 5: wavetable`
}

const UPLOAD_EXAMPLE: Record<Variant, string> = {
    MIPS: `        li      $s0, 0xffff0100
        la      $t0, sound      # a buffer of signed 8-bit samples
        sw      $t0, 0x180($s0) # copy from it
        li      $t1, 8000
        sh      $t1, 0x184($s0) # 8,000 bytes
        sh      $zero, 0x186($s0) # to the start of Sample memory
        sb      $zero, 0x188($s0) # now
        sh      $zero, 0xa($s0) # channel 0 plays from 0
        sh      $t1, 0xc($s0)   # for 8,000 samples
        li      $t0, 6
        sb      $t0, 0x11($s0)  # waveform 6: sample
        sh      $t1, 0($s0)     # at 8,000 samples a second: one second`,
    'RISC-V': `        li      s0, 0xffff0100
        la      t0, sound       # a buffer of signed 8-bit samples
        sw      t0, 0x180(s0)   # copy from it
        li      t1, 8000
        sh      t1, 0x184(s0)   # 8,000 bytes
        sh      zero, 0x186(s0) # to the start of Sample memory
        sb      zero, 0x188(s0) # now
        sh      zero, 0xa(s0)   # channel 0 plays from 0
        sh      t1, 0xc(s0)     # for 8,000 samples
        li      t0, 6
        sb      t0, 0x11(s0)    # waveform 6: sample
        sh      t1, 0(s0)       # at 8,000 samples a second: one second`,
    M68K: `        lea     $E00100,a0
        move.l  #sound,$180(a0) ; copy from a buffer of signed 8-bit samples
        move.w  #8000,$184(a0)  ; 8,000 bytes
        move.w  #0,$186(a0)     ; to the start of Sample memory
        move.b  #0,$188(a0)     ; now
        move.w  #0,$A(a0)       ; channel 0 plays from 0
        move.w  #8000,$C(a0)    ; for 8,000 samples
        move.b  #6,$11(a0)      ; waveform 6: sample
        move.w  #8000,(a0)      ; at 8,000 samples a second: one second`
}

/** Where the block meets the Target's other devices. */
const PLACEMENT_NOTE: Record<Variant, string> = {
    MIPS: ' With the bitmap display at its "memory map" base, `0xffff0000`, the display\'s words cover these registers: they are pixels then, and the Synth is off.',
    'RISC-V':
        ' With the bitmap display at its "memory map" base, `0xffff0000`, the display\'s words cover these registers: they are pixels then, and the Synth is off.',
    M68K: ' The Build sets the block to 0 where the program has not put code or data of its own: a program that does keeps its bytes there, and the Log says so.'
}

const REFERENCE: Record<Variant, { name: string; notes: string }> = {
    MIPS: { name: 'MARS', notes: '[services 31 and 33](/documentation/mips/syscalls#sound)' },
    'RISC-V': {
        name: 'RARS',
        notes: '[services 31 and 33](/documentation/risc-v/syscalls#sound)'
    },
    M68K: { name: 'EASy68K', notes: '[tasks 70 to 77](/documentation/m68k/traps#sound)' }
}

export function synthEntries(
    variant: Variant,
    language: 'mips' | 'risc-v' | 'm68k',
    chapterHref: string
): DocumentationEntry[] {
    const base = variant === 'M68K' ? SYNTH_BASES.m68k : SYNTH_BASES.mips
    const m68k = variant === 'M68K'
    const markdown = fillPlaceholders(template, {
        base: address(variant, base),
        reference: REFERENCE[variant].name,
        notes: REFERENCE[variant].notes,
        storeHalf: m68k ? 'move.w' : 'sh',
        storeByte: m68k ? 'move.b' : 'sb',
        wavetables: address(variant, base + SYNTH_WAVETABLES),
        channelRegisters: registerTable(variant, SYNTH_CHANNEL_REGISTERS),
        uploadRegisters: registerTable(variant, SYNTH_UPLOAD_REGISTERS),
        waveforms: waveformTable(),
        frequencies: frequencyTable(),
        toneExample: fence(variant, TONE_EXAMPLE[variant]),
        wavetableExample: fence(variant, WAVETABLE_EXAMPLE[variant]),
        uploadExample: fence(variant, UPLOAD_EXAMPLE[variant]),
        fromC: fromC(variant),
        placementNote: PLACEMENT_NOTE[variant]
    })
    return proseEntries({ language, chapter: 'synth', chapterHref, markdown })
}

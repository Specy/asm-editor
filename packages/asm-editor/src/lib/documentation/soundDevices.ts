import {
    MIDI_PORT_BASE,
    MIDI_PORT_BUFFER_BYTES,
    MIDI_PORT_REGISTERS,
    type MidiPortRegister
} from '#lib/languages/midiPortRegisters.ts'
import {
    PCM_BASE,
    PCM_FIFO_FRAMES,
    PCM_RATE_DEFAULT,
    PCM_RATE_MAX,
    PCM_RATE_MIN,
    PCM_REGISTERS,
    type PcmRegister
} from '#lib/languages/sampledAudioRegisters.ts'
import { fillPlaceholders, proseEntries, type DocumentationEntry } from './entries'
import template from './soundDevices.md?raw'

/**
 * The **MIDI port** and **Sampled-audio output** chapter of MIPS and RISC-V, one text for both
 * ([ADR 0075](../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)):
 * the register tables come from `midiPortRegisters.ts` and `sampledAudioRegisters.ts`, which the
 * devices themselves read, and only the examples, the reference simulator and RISC-V 64's notes
 * vary. The examples are the ones the MIPS and RISC-V tests run against the real Cores.
 */

type Variant = 'MIPS' | 'RISC-V'

function hex(value: number, digits = 2): string {
    return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`
}

function fence(language: string, code: string): string {
    return `\`\`\`${language}\n${code}\n\`\`\``
}

const asm = (variant: Variant, code: string) => fence(variant === 'MIPS' ? 'mips' : 'riscv', code)

const thousands = (value: number) => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function registerTable(
    prefix: string,
    registers: readonly (MidiPortRegister | PcmRegister)[]
): string {
    return [
        '| Offset | Register | In C | Access | What it holds |',
        '| --- | --- | --- | --- | --- |',
        ...registers.map(
            (register) =>
                `| \`${hex(register.offset)}\` | ${register.name[0]}${register.name.slice(1).toLowerCase()} | \`SIM_${prefix}_${register.name}\` | ${register.access} | ${register.description} |`
        )
    ].join('\n')
}

const MESSAGES: readonly [message: string, bytes: string, meaning: string][] = [
    [
        'Note on',
        '`0x9n`, key, velocity',
        'Starts a note: key 0 to 127, 60 being middle C; velocity 1 to 127, how hard it is struck. Velocity 0 ends the note instead'
    ],
    ['Note off', '`0x8n`, key, velocity', 'Ends a note; the velocity is usually 0'],
    ['Program change', '`0xCn`, program', 'Picks the channel’s instrument, 0 to 127'],
    [
        'Control change',
        '`0xBn`, controller, value',
        'Sets one of the channel’s controllers: 7 is volume, 10 left-right position (64 the middle), 64 the sustain pedal (127 down, 0 up), 123 ends every note on the channel'
    ],
    [
        'Pitch bend',
        '`0xEn`, low 7 bits, high 7 bits',
        'Bends every note on the channel: 8192, bytes 0 and 64, is no bend; 0 and 16383 are two semitones down and up'
    ],
    [
        'Channel pressure',
        '`0xDn`, pressure',
        'How hard held keys are pressed, which some instruments respond to'
    ],
    [
        'System exclusive',
        '`0xF0`, data…, `0xF7`',
        'A message for the synthesizer itself, such as GM System On, which resets every channel'
    ]
]

function messageTable(): string {
    return [
        '| Message | Bytes, for channel `n` + 1 | What it does |',
        '| --- | --- | --- |',
        ...MESSAGES.map(([message, bytes, meaning]) => `| ${message} | ${bytes} | ${meaning} |`)
    ].join('\n')
}

const MIDI_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .data
scale:  .byte   60, 62, 64, 65, 67, 69, 71, 72  # C major, as MIDI keys
        .text
main:   li      $s0, 0xffff0340 # the MIDI port
        li      $a0, 0xC0       # program change, channel 1...
        jal     send
        li      $a0, 0          # ...to instrument 0, a piano
        jal     send
        la      $s1, scale
        li      $s2, 8          # eight notes
note:   li      $a0, 0x90       # note on, channel 1
        jal     send
        lbu     $a0, 0($s1)     # the key
        jal     send
        li      $a0, 100        # the velocity
        jal     send
        li      $a0, 300        # let it sound for 300 ms
        li      $v0, 32
        syscall
        li      $a0, 0x80       # note off, channel 1
        jal     send
        lbu     $a0, 0($s1)
        jal     send
        li      $a0, 0
        jal     send
        addiu   $s1, $s1, 1
        addiu   $s2, $s2, -1
        bnez    $s2, note
        li      $v0, 10
        syscall

# send: writes the byte in $a0 to the MIDI port once it can take one
send:   lw      $t0, 4($s0)     # Status
        andi    $t0, $t0, 0x40  # bit 6: busy
        bnez    $t0, send
        sb      $a0, 0($s0)     # Data
        jr      $ra`,
    'RISC-V': `        .data
scale:  .byte   60, 62, 64, 65, 67, 69, 71, 72  # C major, as MIDI keys
        .text
main:   li      s0, 0xffff0340  # the MIDI port
        li      a0, 0xC0        # program change, channel 1...
        jal     send
        li      a0, 0           # ...to instrument 0, a piano
        jal     send
        la      s1, scale
        li      s2, 8           # eight notes
note:   li      a0, 0x90        # note on, channel 1
        jal     send
        lbu     a0, 0(s1)       # the key
        jal     send
        li      a0, 100         # the velocity
        jal     send
        li      a0, 300         # let it sound for 300 ms
        li      a7, 32
        ecall
        li      a0, 0x80        # note off, channel 1
        jal     send
        lbu     a0, 0(s1)
        jal     send
        li      a0, 0
        jal     send
        addi    s1, s1, 1
        addi    s2, s2, -1
        bnez    s2, note
        li      a7, 10
        ecall

# send: writes the byte in a0 to the MIDI port once it can take one
send:   lw      t0, 4(s0)       # Status
        andi    t0, t0, 0x40    # bit 6: busy
        bnez    t0, send
        sb      a0, 0(s0)       # Data
        ret`
}

const PCM_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .text
main:   li      $s0, 0xffff0350 # the sampled-audio output
        li      $t0, 8000
        sw      $t0, 4($s0)     # Rate: 8,000 samples a second
        li      $t0, 1
        sw      $t0, 0($s0)     # Control: on, in mono
        li      $s1, 0x20002000 # a word of two samples, both 8,192
        li      $s2, 0xC000C000 # what turns 8,192 into -8,192 and back
        li      $s3, 8000       # 8,000 words, 16,000 samples: two seconds
        li      $s4, 5          # words before the wave turns
loop:   lw      $t0, 8($s0)     # Free: how many samples fit now
        bnez    $t0, write
        li      $a0, 10         # none: sleep 10 ms and look again
        li      $v0, 32
        syscall
        j       loop
write:  sw      $s1, 12($s0)    # Data: two samples
        addiu   $s4, $s4, -1
        bnez    $s4, next
        xor     $s1, $s1, $s2   # the wave turns: high becomes low
        li      $s4, 5
next:   addiu   $s3, $s3, -1
        bnez    $s3, loop
        li      $v0, 10
        syscall`,
    'RISC-V': `        .text
main:   li      s0, 0xffff0350  # the sampled-audio output
        li      t0, 8000
        sw      t0, 4(s0)       # Rate: 8,000 samples a second
        li      t0, 1
        sw      t0, 0(s0)       # Control: on, in mono
        li      s1, 0x20002000  # a word of two samples, both 8,192
        li      s2, 0xC000C000  # what turns 8,192 into -8,192 and back
        li      s3, 8000        # 8,000 words, 16,000 samples: two seconds
        li      s4, 5           # words before the wave turns
loop:   lw      t0, 8(s0)       # Free: how many samples fit now
        bnez    t0, write
        li      a0, 10          # none: sleep 10 ms and look again
        li      a7, 32
        ecall
        j       loop
write:  sw      s1, 12(s0)      # Data: two samples
        addi    s4, s4, -1
        bnez    s4, next
        xor     s1, s1, s2      # the wave turns: high becomes low
        li      s4, 5
next:   addi    s3, s3, -1
        bnez    s3, loop
        li      a7, 10
        ecall`
}

const PACK_EXAMPLE: Record<Variant, string> = {
    MIPS: `        andi    $t0, $a0, 0xffff # the first sample, in the low half
        sll     $t1, $a1, 16     # the second, in the high half
        or      $t0, $t0, $t1
        sw      $t0, 12($s0)     # Data`,
    'RISC-V': `        li      t2, 0xffff
        and     t0, a0, t2      # the first sample, in the low half
        slli    t1, a1, 16      # the second, in the high half
        or      t0, t0, t1
        sw      t0, 12(s0)      # Data`
}

const C_EXAMPLE = `#include <sim.h>

static const unsigned char scale[] = {60, 62, 64, 65, 67, 69, 71, 72};

int main(void) {
    if (!sim_midi_present() || !sim_pcm_present()) {
        sim_print_string("This simulator has no MIDI port or sampled-audio output.\\n");
        return 1;
    }
    sim_midi_write(0xC0); /* program change, channel 1 */
    sim_midi_write(40);   /* a violin */
    for (int i = 0; i < 8; i++) {
        sim_midi_write(0x90); /* note on */
        sim_midi_write(scale[i]);
        sim_midi_write(100);
        sim_sleep(300);
        sim_midi_write(0x80); /* note off */
        sim_midi_write(scale[i]);
        sim_midi_write(0);
    }

    sim_pcm_start(8000, 0); /* 8,000 samples a second, in mono */
    for (int i = 0; i < 16000; i += 2) {
        int level = (i / 10) % 2 ? -8192 : 8192; /* a square wave at 400 Hz */
        sim_pcm_write(level, level);
    }
    return 0;
}`

const RISCV64_NOTES = `## On RISC-V 64 {#risc-v-64}

The same programs run on RISC-V 64, with the same addresses: \`li s0, 0xffff0340\` reaches the MIDI port there too. \`lw\` fills the upper half of a 64-bit register with copies of bit 31, and no register of either device ever has bit 31 set, so \`lw\` gives the same value as on RISC-V 32. Write Data with \`sw\`, not \`sd\`: an \`sd\` writes two registers at once. In C, \`unsigned\` is 32 bits on both, so the \`SIM_MIDI_\` and \`SIM_PCM_\` macros give the same results.
`

const SIMULATOR: Record<Variant, string> = { MIPS: 'MARS', 'RISC-V': 'RARS' }

/** The chapter's examples, which the MIPS and RISC-V tests run against the real Cores. */
export function soundDeviceExamples(variant: Variant): { midi: string; pcm: string; c: string } {
    return { midi: MIDI_EXAMPLE[variant], pcm: PCM_EXAMPLE[variant], c: C_EXAMPLE }
}

export function soundDeviceEntries(
    variant: Variant,
    language: 'mips' | 'risc-v',
    chapterHref: string
): DocumentationEntry[] {
    const markdown = fillPlaceholders(template, {
        route: language,
        simulator: SIMULATOR[variant],
        midiBase: `0x${MIDI_PORT_BASE.toString(16)}`,
        pcmBase: `0x${PCM_BASE.toString(16)}`,
        midiBuffer: thousands(MIDI_PORT_BUFFER_BYTES),
        midiExample: asm(variant, MIDI_EXAMPLE[variant]),
        midiRegisterTable: registerTable('MIDI', MIDI_PORT_REGISTERS),
        messageTable: messageTable(),
        pcmExample: asm(variant, PCM_EXAMPLE[variant]),
        pcmRegisterTable: registerTable('PCM', PCM_REGISTERS),
        pcmDefaultRate: thousands(PCM_RATE_DEFAULT),
        pcmRateMin: thousands(PCM_RATE_MIN),
        pcmRateMax: thousands(PCM_RATE_MAX),
        pcmFifo: thousands(PCM_FIFO_FRAMES),
        packExample: asm(variant, PACK_EXAMPLE[variant]),
        cExample: fence('c', C_EXAMPLE),
        riscv64: variant === 'RISC-V' ? RISCV64_NOTES : ''
    })
    return proseEntries({ language, chapter: 'midi-and-audio', chapterHref, markdown })
}

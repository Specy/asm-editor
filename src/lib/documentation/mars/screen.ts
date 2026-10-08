import {
    DEFAULT_PROJECT_DISPLAY,
    formatMarsBaseAddress,
    MARS_BASE_ADDRESS_CHOICES,
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES
} from '$lib/languages/mars/marsDisplay'
import {
    MARS_INTERRUPT_ENABLE_BIT,
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_TRANSMITTER_CONTROL,
    MARS_TRANSMITTER_DATA
} from '$lib/languages/mars/MarsDevices'
import { fillPlaceholders, proseEntries, type DocumentationEntry } from '../entries'
import template from './screen.md?raw'

/**
 * Shared screen and keyboard documentation for MIPS and RISC-V. Only register names, service-call
 * syntax and assembly examples vary; the tables use the same constants as the editor.
 */

type Variant = 'MIPS' | 'RISC-V'

function hex(address: number): string {
    return `0x${(address >>> 0).toString(16).padStart(8, '0')}`
}

function fence(variant: Variant, code: string): string {
    return `\`\`\`${variant === 'MIPS' ? 'mips' : 'riscv'}\n${code}\n\`\`\``
}

const BITMAP_EXAMPLE: Record<Variant, string> = {
    MIPS: `# @screen unit=1 width=256 height=256 base=display
        .data
display:.space  262144          # 256 * 256 words
        .text
main:
        la      $t0, display
        li      $t1, 0x00ff8000 # low 24 bits: red 0xff, green 0x80, blue 0x00
        sw      $t1, 0($t0)     # the pixel at the top left
        sw      $t1, 1024($t0)  # 256 words further on: the one below it`,
    'RISC-V': `# @screen unit=1 width=256 height=256 base=display
        .data
display:.space  262144          # 256 * 256 words
        .text
main:
        la      t0, display
        li      t1, 0x00ff8000  # low 24 bits: red 0xff, green 0x80, blue 0x00
        sw      t1, 0(t0)       # the pixel at the top left
        sw      t1, 1024(t0)    # 256 words further on: the one below it`
}

const KEYBOARD_EXAMPLE: Record<Variant, string> = {
    MIPS: `        li      $s0, 0xffff0000
poll:
        lw      $t0, 0($s0)     # receiver control
        andi    $t0, $t0, 1     # the Ready bit
        bnez    $t0, take
        li      $v0, 32         # nothing typed yet: a wait costs no instructions
        li      $a0, 10
        syscall
        j       poll
take:
        lw      $t1, 4($s0)     # receiver data, one character
        sw      $t1, 12($s0)    # transmitter data: print it`,
    'RISC-V': `        li      s0, 0xffff0000
poll:
        lw      t0, 0(s0)       # receiver control
        andi    t0, t0, 1       # the Ready bit
        bnez    t0, take
        li      a7, 32          # nothing typed yet: a wait costs no instructions
        li      a0, 10
        ecall
        j       poll
take:
        lw      t1, 4(s0)       # receiver data, one character
        sw      t1, 12(s0)      # transmitter data: print it`
}

const DIRECTIVE_EXAMPLE: Record<Variant, string> = {
    MIPS: `# @screen unit=1 width=256 height=256 base=display
        .data
display:.space  262144          # 256 * 256 words
        .text
main:
        la      $t0, display`,
    'RISC-V': `# @screen unit=1 width=256 height=256 base=display
        .data
display:.space  262144          # 256 * 256 words
        .text
main:
        la      t0, display`
}

function parameters(): string {
    const display = DEFAULT_PROJECT_DISPLAY
    const bases = MARS_BASE_ADDRESS_CHOICES.map(
        (choice) => `\`${formatMarsBaseAddress(choice.address)}\``
    ).join(', ')
    return [
        `1. **Unit width** and **unit height in pixels**: ${MARS_UNIT_SIZE_CHOICES.join(', ')}. How large one word is drawn. Default ${display.unitWidth} by ${display.unitHeight}.`,
        `2. **Display width** and **height in pixels**: ${MARS_DISPLAY_SIZE_CHOICES.join(', ')}. Default ${display.width} by ${display.height}. Divided by the unit size, they give the word grid: the default is ${display.width} by ${display.height} words.`,
        `3. **Base address for display**: where the grid starts. ${bases}. Default \`${formatMarsBaseAddress(display.baseAddress)}\`, which is where \`.data\` puts your first label.`
    ].join('\n')
}

function settings(): string {
    return [
        `- \`width\`: the display width in pixels, one of ${MARS_DISPLAY_SIZE_CHOICES.join(', ')}.`,
        `- \`height\`: the display height in pixels, one of ${MARS_DISPLAY_SIZE_CHOICES.join(', ')}.`,
        `- \`unit\`: how many pixels wide and high one word is drawn, one of ${MARS_UNIT_SIZE_CHOICES.join(', ')}. \`unitWidth\` and \`unitHeight\` set the two separately.`,
        '- `base`: where the grid starts: **a label the program defines**, which is the point of it (the program never has to know the address), or an address such as `0x10010000` or `268500992`. A label not on a word boundary is rounded down to one.'
    ].join('\n')
}

function registers(): string {
    const rows = [
        [
            MARS_RECEIVER_CONTROL,
            'Receiver control',
            'Bit 0 is **Ready**: a typed character is waiting in the receiver data register. The device sets it and clears it; a program only reads it.'
        ],
        [
            MARS_RECEIVER_DATA,
            'Receiver data',
            'The typed character, in the low byte. Reading it takes that character; the next one, if any, appears at once and Ready stays set until the queue is empty.'
        ],
        [
            MARS_TRANSMITTER_CONTROL,
            'Transmitter control',
            'Bit 0 is **Ready**, and here it is always set: the console never makes a program wait to print.'
        ],
        [
            MARS_TRANSMITTER_DATA,
            'Transmitter data',
            'Storing a character in the low byte prints it on the console. ASCII 12, a form feed, clears the console instead.'
        ]
    ] as const
    return rows
        .map(([address, name, description]) => `- \`${hex(address)}\` **${name}**: ${description}`)
        .join('\n')
}

export function screenEntries(
    variant: Variant,
    language: 'mips' | 'risc-v',
    chapterHref: string
): DocumentationEntry[] {
    const mips = variant === 'MIPS'
    const markdown = fillPlaceholders(template, {
        variant,
        call: mips ? 'syscall' : 'ecall',
        service: mips ? '$v0' : 'a7',
        argument: mips ? '$a0' : 'a0',
        highArgument: mips ? '$a1' : 'a1',
        receiverControl: hex(MARS_RECEIVER_CONTROL),
        readyBit: String(MARS_READY_BIT),
        interruptBit: String(MARS_INTERRUPT_ENABLE_BIT),
        parameters: parameters(),
        settings: settings(),
        registers: registers(),
        bitmapExample: fence(variant, BITMAP_EXAMPLE[variant]),
        keyboardExample: fence(variant, KEYBOARD_EXAMPLE[variant]),
        directiveExample: fence(variant, DIRECTIVE_EXAMPLE[variant])
    })
    return proseEntries({ language, chapter: 'screen', chapterHref, markdown })
}

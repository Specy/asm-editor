import { DEVICE_HEADERS } from '../../../../scripts/sim-header/deviceTable.mjs'
import { evaluate, structLayout, valueOf } from '../../../../scripts/sim-header/deviceHeaders.mjs'
import {
    DEFAULT_X86_DISPLAY,
    formatX86Display,
    X86_DISPLAY_SIZE_CHOICES,
    X86_DISPLAY_SIZE_MAX,
    X86_DISPLAY_SIZE_MIN,
    X86_DISPLAY_WIDTH_STEP
} from '#lib/languages/X86/x86Display.ts'
import { fillPlaceholders, proseEntries, type Chapter } from '../entries'
import screenProse from './screen.md?raw'
import inputProse from './input.md?raw'
import soundProse from './sound.md?raw'

/**
 * The x86 device Chapters: the Screen (`/dev/fb0`), keys and the pointer (`/dev/input` and the
 * Terminal's modes) and sound (`/dev/dsp`, `/dev/mixer`, the MIDI port and the PC speaker)
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), M10 of
 * [the plan](../../../../../../docs/design/x86-devices-plan.md)). The prose is in the three
 * Markdown files; every number in their tables comes from the device table the C headers and NASM
 * include files are generated from (`scripts/sim-header/deviceTable.mjs`), so a table cannot say
 * what the headers do not, and the Screen's sizes from the Display configuration itself.
 */

const BASE = '/documentation/x86'

/** What the documentation reads of an item of the device table. */
type TableField = { name: string; type: string; doc?: string }
type TableItem = {
    kind: string
    name?: string | null
    typedef?: string
    doc?: string
    radix?: number
    fields?: TableField[]
}
type PlacedField = TableField & { offset: number; size: number }

const ITEMS = new Map<string, TableItem>()
for (const header of DEVICE_HEADERS) {
    for (const item of header.items as TableItem[]) {
        if (item.name && !ITEMS.has(item.name)) ITEMS.set(item.name, item)
    }
}

/** An item the table must have: a Chapter naming one it lacks is an error, not a blank cell. */
function item(name: string): TableItem {
    const found = ITEMS.get(name)
    if (!found) throw new Error(`The x86 device table has no ${name}`)
    return found
}

/** The table's comment as a table cell: one phrase, without its closing full stop. */
function meaning(doc: string | undefined): string {
    return (doc ?? '').trim().replace(/(?<!\.)\.$/, '')
}

function number(value: bigint, radix: number): string {
    return radix === 16 ? `0x${value.toString(16)}` : value.toString()
}

function table(header: string[], rows: string[][]): string {
    return [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`)
    ].join('\n')
}

/**
 * Requests as the program names them, with the number each one is, the register `rsi` holds when
 * the debugger stops on the `syscall`. A request that takes a size, such as `EVIOCGKEY(96)`, is
 * shown at the size the Chapter's examples use; its meaning is the macro's. A request the table
 * spells through another macro, as `SOUND_MIXER_WRITE_VOLUME` is `MIXER_WRITE(SOUND_MIXER_VOLUME)`,
 * is given its meaning here.
 */
function requests(rows: [spelling: string, argument: string, doc?: string][]): string {
    return table(
        ['Request', 'Number', 'Third ioctl argument', 'What it does'],
        rows.map(([spelling, argument, doc]) => {
            const name = /^\w+/.exec(spelling)![0]
            const value = spelling === name ? valueOf(name) : evaluate(spelling)
            return [
                `\`${spelling}\``,
                `\`${number(value, 16)}\``,
                argument,
                meaning(doc ?? item(name).doc)
            ]
        })
    )
}

/**
 * Constants with their values, in the radix the table writes each one in. A row may give its own
 * meaning where the table has no comment, as for the key codes, whose names say what they are.
 */
function constants(rows: (string | [name: string, doc: string])[]): string {
    return table(
        ['Name', 'Value', 'Meaning'],
        rows.map((row) => {
            const [name, doc] = typeof row === 'string' ? [row, undefined] : row
            const constant = item(name)
            return [
                `\`${name}\``,
                `\`${number(valueOf(name), constant.radix ?? 10)}\``,
                meaning(doc ?? constant.doc)
            ]
        })
    )
}

/**
 * A structure's fields with their offsets and sizes, for NASM, where a program reaches a field as
 * `[address + name.field]`; `only` keeps the fields a Chapter talks about.
 */
function fields(name: string, only?: string[]): string {
    const layout = structLayout(item(name)) as { size: number; fields: PlacedField[] }
    const shown = only
        ? only.map((field) => {
              const placed = layout.fields.find((candidate) => candidate.name === field)
              if (!placed) throw new Error(`struct ${name} has no ${field}`)
              return placed
          })
        : layout.fields
    return [
        table(
            ['Offset', 'Bytes', 'Field', 'Meaning'],
            shown.map((field) => [
                String(field.offset),
                String(field.size),
                `\`${field.name}\``,
                meaning(field.doc)
            ])
        ),
        '',
        `\`struct ${name}\` is ${layout.size} bytes, \`${name}_size\` in NASM.`
    ].join('\n')
}

function screen(): Chapter {
    const href = `${BASE}/screen`
    const markdown = fillPlaceholders(screenProse, {
        requests: requests([
            ['FBIOGET_VSCREENINFO', '`struct fb_var_screeninfo *` (output)'],
            ['FBIOGET_FSCREENINFO', '`struct fb_fix_screeninfo *` (output)'],
            ['FBIOPUT_VSCREENINFO', '`struct fb_var_screeninfo *` (input/output)'],
            ['FBIOPAN_DISPLAY', '`struct fb_var_screeninfo *` (input/output)'],
            ['FBIO_WAITFORVSYNC', 'Pointer to a 32-bit 0']
        ]),
        fields: [
            fields('fb_var_screeninfo', [
                'xres',
                'yres',
                'xres_virtual',
                'yres_virtual',
                'xoffset',
                'yoffset',
                'bits_per_pixel'
            ]),
            '',
            fields('fb_fix_screeninfo', ['id', 'smem_len', 'line_length'])
        ].join('\n'),
        defaultSize: formatX86Display(DEFAULT_X86_DISPLAY),
        sizes: X86_DISPLAY_SIZE_CHOICES.map(formatX86Display).join(', '),
        widthStep: String(X86_DISPLAY_WIDTH_STEP),
        sizeMin: String(X86_DISPLAY_SIZE_MIN),
        sizeMax: String(X86_DISPLAY_SIZE_MAX)
    })
    return {
        id: 'screen',
        language: 'x86',
        title: 'The Screen',
        href,
        description:
            'Draw pixels and switch framebuffer pages through /dev/fb0. Configure the Screen size with Display or @screen.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'screen',
            chapterHref: href,
            markdown,
            openingTitle: 'The Screen'
        })
    }
}

function input(): Chapter {
    const href = `${BASE}/input`
    const markdown = fillPlaceholders(inputProse, {
        eventFields: fields('input_event'),
        eventCodes: constants([
            'EV_SYN',
            'EV_KEY',
            'EV_REL',
            'EV_ABS',
            'EV_MSC',
            'EV_LED',
            'SYN_REPORT',
            'SYN_DROPPED',
            ['MSC_SCAN', "The key's scan code, just before the key's own event"],
            ['KEY_ESC', 'Escape'],
            ['KEY_ENTER', 'Enter'],
            ['KEY_SPACE', 'The space bar'],
            ['KEY_A', 'A, on a US keyboard'],
            ['KEY_D', 'D'],
            ['KEY_S', 'S'],
            ['KEY_W', 'W, on a US keyboard'],
            ['KEY_LEFTSHIFT', 'The left Shift; the right one is KEY_RIGHTSHIFT'],
            ['KEY_LEFTCTRL', 'The left Ctrl; the right one is KEY_RIGHTCTRL'],
            ['KEY_UP', 'The up arrow'],
            ['KEY_LEFT', 'The left arrow'],
            ['KEY_RIGHT', 'The right arrow'],
            ['KEY_DOWN', 'The down arrow'],
            ['BTN_LEFT', "The pointer's left button"],
            ['BTN_RIGHT', 'Its right button'],
            ['BTN_MIDDLE', 'Its middle button, the wheel pressed'],
            ['BTN_SIDE', "Its back button, the browser's back"],
            ['BTN_EXTRA', 'Its forward button'],
            ['ABS_X', "The pointer's position across, 0 to 32767"],
            ['ABS_Y', 'Its position down, 0 to 32767'],
            ['REL_WHEEL', 'A wheel notch: 1 away from you, -1 toward you'],
            ['REL_WHEEL_HI_RES', 'The same notch in 120ths, in the same report: 120 or -120']
        ]),
        absinfoFields: fields('input_absinfo', ['value', 'minimum', 'maximum']),
        stateRequests: requests([
            ['EVIOCGNAME(64)', 'Pointer to a 64-byte output buffer', 'Read the device name'],
            ['EVIOCGBIT(0, 4)', 'Pointer to a 4-byte output bit set', 'Read supported event types'],
            [
                'EVIOCGBIT(EV_KEY, 96)',
                'Pointer to a 96-byte output bit set',
                'Read supported key and button codes'
            ],
            [
                'EVIOCGKEY(96)',
                'Pointer to a 96-byte output bit set',
                'Read held keys and buttons into the 96-byte bit set, one bit per code; discard queued EV_KEY events for this reader'
            ],
            [
                'EVIOCGABS(ABS_X)',
                '`struct input_absinfo *` (output)',
                'Read the horizontal position and range; queued events remain'
            ],
            [
                'EVIOCGABS(ABS_Y)',
                '`struct input_absinfo *` (output)',
                'Read the vertical position and range; queued events remain'
            ],
            ['EVIOCGRAB', 'Immediate integer: 1 to grab, 0 to release']
        ])
    })
    return {
        id: 'input',
        language: 'x86',
        title: 'Keys and the pointer',
        href,
        description:
            'Read Screen keys, pointer positions and buttons through /dev/input, or read Terminal characters through standard input.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'input',
            chapterHref: href,
            markdown,
            openingTitle: 'Keys and the pointer'
        })
    }
}

function sound(): Chapter {
    const href = `${BASE}/sound`
    const markdown = fillPlaceholders(soundProse, {
        speakerRequests: [
            constants([
                'EV_SND',
                ['SND_TONE', 'A tone of value Hz; 0 stops it'],
                ['SND_BELL', '1000 Hz for any value but 0; 0 stops it']
            ]),
            '',
            requests([
                ['KIOCSOUND', 'Immediate integer: timer divider, or 0 to stop'],
                ['KDMKTONE', 'Immediate integer: duration and divider packed into 32 bits']
            ])
        ].join('\n'),
        dspFormats: constants(['AFMT_U8', 'AFMT_S16_LE', 'AFMT_S32_LE']),
        bufferFields: fields('audio_buf_info'),
        dspRequests: requests([
            ['SNDCTL_DSP_SETFRAGMENT', '`int *` (input)'],
            ['SNDCTL_DSP_SETFMT', '`int *` (input/output)'],
            ['SNDCTL_DSP_CHANNELS', '`int *` (input/output)'],
            ['SNDCTL_DSP_SPEED', '`int *` (input/output)'],
            ['SNDCTL_DSP_GETBLKSIZE', '`int *` (output)'],
            ['SNDCTL_DSP_SYNC', 'Ignored; pass 0'],
            ['SNDCTL_DSP_RESET', 'Ignored; pass 0'],
            ['SNDCTL_DSP_GETOSPACE', '`audio_buf_info *` (output)'],
            ['SNDCTL_DSP_GETODELAY', '`int *` (output)']
        ]),
        mixerRequests: requests([
            [
                'SOUND_MIXER_READ_VOLUME',
                '`int *` (output)',
                'Read the master volume into an int, left in the low byte and right in the next'
            ],
            [
                'SOUND_MIXER_WRITE_VOLUME',
                '`int *` (input/output)',
                'Set the master volume and write back the applied levels'
            ]
        ])
    })
    return {
        id: 'sound',
        language: 'x86',
        title: 'Sound',
        href,
        description:
            'Play PC speaker tones, MIDI notes or audio samples. Configure playback buffering and volume through /dev/dsp and /dev/mixer.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'sound',
            chapterHref: href,
            markdown,
            openingTitle: 'Sound'
        })
    }
}

/** The three device Chapters, in the order the sidebar has them. */
export function deviceChapters(): Chapter[] {
    return [screen(), input(), sound()]
}

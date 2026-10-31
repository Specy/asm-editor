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
function requests(rows: (string | [spelling: string, doc: string])[]): string {
    return table(
        ['Request', 'Number', 'What it does'],
        rows.map((row) => {
            const [spelling, doc] = typeof row === 'string' ? [row, undefined] : row
            const name = /^\w+/.exec(spelling)![0]
            const value = spelling === name ? valueOf(name) : evaluate(spelling)
            return [`\`${spelling}\``, `\`${number(value, 16)}\``, meaning(doc ?? item(name).doc)]
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
            'FBIOGET_VSCREENINFO',
            'FBIOGET_FSCREENINFO',
            'FBIOPUT_VSCREENINFO',
            'FBIOPAN_DISPLAY',
            'FBIO_WAITFORVSYNC'
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
            'Draw on the Screen through /dev/fb0: read its size, map its pixels, show the other page for smooth animation, wait for the vertical blank, and choose its size with @screen.',
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
            ['ABS_X', "The pointer's position across, 0 to 32767"],
            ['ABS_Y', 'Its position down, 0 to 32767'],
            ['REL_WHEEL', 'A wheel notch: 1 away from you, -1 toward you']
        ]),
        absinfoFields: fields('input_absinfo', ['value', 'minimum', 'maximum']),
        stateRequests: requests([
            'EVIOCGNAME(64)',
            'EVIOCGBIT(0, 4)',
            'EVIOCGBIT(EV_KEY, 96)',
            'EVIOCGKEY(96)',
            'EVIOCGABS(ABS_X)',
            'EVIOCGABS(ABS_Y)',
            'EVIOCGRAB'
        ])
    })
    return {
        id: 'input',
        language: 'x86',
        title: 'Keys and the pointer',
        href,
        description:
            "Read the Screen's keys and pointer through /dev/input: find the devices, read input events, turn the pointer's position into pixels, wait with poll, and read the Terminal's keys one at a time.",
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
            requests(['KIOCSOUND', 'KDMKTONE'])
        ].join('\n'),
        dspFormats: constants(['AFMT_U8', 'AFMT_S16_LE', 'AFMT_S32_LE']),
        dspRequests: requests([
            'SNDCTL_DSP_SETFRAGMENT',
            'SNDCTL_DSP_SETFMT',
            'SNDCTL_DSP_CHANNELS',
            'SNDCTL_DSP_SPEED',
            'SNDCTL_DSP_SYNC',
            'SNDCTL_DSP_RESET',
            'SNDCTL_DSP_GETOSPACE',
            'SNDCTL_DSP_GETODELAY'
        ]),
        mixerRequests: requests([
            [
                'SOUND_MIXER_READ_VOLUME',
                'Read the master volume into an int, left in the low byte and right in the next'
            ],
            ['SOUND_MIXER_WRITE_VOLUME', 'Set the master volume from an int, which it writes back']
        ])
    })
    return {
        id: 'sound',
        language: 'x86',
        title: 'Sound',
        href,
        description:
            'Make sound through device files: a tone on the PC speaker, notes on the MIDI port, samples on /dev/dsp with a buffer small enough to answer at once, and the volume on /dev/mixer.',
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

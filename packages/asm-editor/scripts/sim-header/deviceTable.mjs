/**
 * The x86 device table: every constant, structure, ioctl request and POSIX call the x86 headers
 * offer, in the order and the files Linux's own headers have them ([ADR 0070](../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)).
 * `deviceHeaders.mjs` writes the C headers and the NASM include files from it, and the layout
 * test compares what it promises with the kernel's UAPI headers and glibc's.
 *
 * Values are Linux x86-64's, as the pinned guest's Linux 7.2 has them
 * ([x86-devices.md](../../../../docs/design/x86-devices.md)). A value is a number, or a C expression
 * over other names of the table, which both languages read; an ioctl request is its direction,
 * type, number and argument type, as `_IOR('E', 0x02, struct input_id)` spells it. The comments
 * are written for this editor, not copied from the kernel's headers.
 *
 * Plain JavaScript and no imports, like `simHeader.mjs`: the generator runs it under Node and the
 * editor's tests import it.
 */

/** A comment between groups of items, in both languages. */
const note = (text) => ({ kind: 'comment', text })
/**
 * A constant. `value` is a number, written in `radix`, or a C expression. `options.c` replaces the
 * C text where C needs a cast; `options.nasm` false leaves it out of the NASM file; `options.linux`
 * false marks a name Linux's own header does not have, which the layout test cannot compare.
 */
const define = (name, value, doc, options = {}) => ({
    kind: 'define',
    name,
    value,
    doc,
    ...options
})
/** A run of constants of one radix: `[name, value]` pairs, or `[name, value, doc]`. */
const defines = (pairs, radix = 10) =>
    pairs.map(([name, value, doc]) => define(name, value, doc, { radix }))
/** An ioctl request: `_IO`, `_IOR`, `_IOW` or `_IOWR` by direction ('', 'R', 'W', 'WR'). */
const ioctl = (name, direction, type, number, argument, doc, options = {}) => ({
    kind: 'define',
    name,
    ioctl: { direction, type, number, argument },
    doc,
    ...options
})
/**
 * A function-like macro. `c` is its C replacement and `nasm` NASM's, when NASM can have one;
 * `samples` are argument lists the layout test evaluates it at. A macro without samples is code,
 * not a value, and only C has it.
 */
const macro = (name, params, c, doc, options = {}) => ({
    kind: 'macro',
    name,
    params,
    c,
    doc,
    ...options
})
/** A field: `type name[count]`, or `type name : bits`. */
const field = (type, name, doc, options = {}) => ({ type, name, doc, ...options })
/** A structure; `options.typedef` also names it, or is its only name when `name` is null. */
const struct = (name, doc, fields, options = {}) => ({
    kind: 'struct',
    name,
    doc,
    fields,
    ...options
})
/** A typedef; `options.c` is its C declaration where C cannot spell it `typedef type name`. */
const typedef = (name, type, doc, options = {}) => ({
    kind: 'typedef',
    name,
    type,
    doc,
    ...options
})
/**
 * A value the layout test compares and nothing else: a C expression, such as the offset of a field
 * a macro names, and the value the table gives it.
 */
const check = (expression, value, options = {}) => ({
    kind: 'check',
    expression,
    value,
    ...options
})
const include = (path) => ({ kind: 'include', path })
/**
 * A POSIX call: a `static inline` function that makes the system call `syscall` with `args` (C
 * expressions, the parameters by default) after the statements `before`, and returns `result`,
 * an expression of `rax`, the kernel's answer (by default the C library's: -1 and errno for a
 * failure). `body` instead is a function that makes no system call. `documentation` names the
 * system call whose Documentation entry describes it, `syscall` by default.
 */
const posix = (name, returns, params, doc, options) => ({
    kind: 'function',
    name,
    returns,
    params,
    doc,
    ...options
})

/** The ioctl directions, as `_IOC` encodes them in its top two bits. */
export const IOC_DIRECTIONS = { '': 0, W: 1, R: 2, WR: 3 }

const errnoCodes = [
    ['EPERM', 1, 'Operation not permitted'],
    ['ENOENT', 2, 'No such file or directory'],
    ['ESRCH', 3, 'No such process: kill found no process with that id'],
    ['EINTR', 4, 'Interrupted system call: a signal arrived while it waited'],
    ['EIO', 5, 'Input/output error'],
    ['ENXIO', 6, 'No such device or address'],
    ['EBADF', 9, 'Bad file descriptor: not open, or not open for this'],
    ['EAGAIN', 11, 'Try again: a non-blocking descriptor has nothing ready'],
    ['ENOMEM', 12, 'Out of memory'],
    ['EACCES', 13, 'Permission denied'],
    ['EFAULT', 14, 'Bad address: a pointer argument points outside the program'],
    ['EBUSY', 16, 'Device or resource busy, such as an input device another reader grabbed'],
    ['EEXIST', 17, 'File exists'],
    ['ENODEV', 19, 'No such device: the device exists but has no driver here'],
    ['ENOTDIR', 20, 'Not a directory'],
    ['EISDIR', 21, 'Is a directory'],
    ['EINVAL', 22, 'Invalid argument'],
    ['EMFILE', 24, 'Too many open files'],
    ['ENOTTY', 25, 'Inappropriate ioctl for device: the device does not know this request'],
    ['EFBIG', 27, 'File too large: a write starting past the end of /dev/fb0'],
    ['ENOSPC', 28, 'No space left on device'],
    ['ESPIPE', 29, 'Illegal seek'],
    ['EPIPE', 32, 'Broken pipe'],
    ['EDOM', 33, 'Argument out of domain'],
    ['ERANGE', 34, 'Result out of range'],
    ['ENOSYS', 38, 'Function not implemented'],
    ['EWOULDBLOCK', 'EAGAIN', 'Same as EAGAIN'],
    ['EOVERFLOW', 75, 'Value too large for defined data type'],
    ['EILSEQ', 84, 'Invalid multibyte or wide character'],
    ['EOPNOTSUPP', 95, 'Operation not supported'],
    ['ENOTSUP', 'EOPNOTSUPP', 'Same as EOPNOTSUPP']
]

/**
 * `KEY_*` from 0 to 248, the keyboard keys: what `KeyboardEvent.code` maps to, whatever the
 * layout. A string value is another key's name.
 */
// prettier-ignore
const keyCodes = [
    ['KEY_RESERVED', 0], ['KEY_ESC', 1], ['KEY_1', 2], ['KEY_2', 3], ['KEY_3', 4], ['KEY_4', 5],
    ['KEY_5', 6], ['KEY_6', 7], ['KEY_7', 8], ['KEY_8', 9], ['KEY_9', 10], ['KEY_0', 11],
    ['KEY_MINUS', 12], ['KEY_EQUAL', 13], ['KEY_BACKSPACE', 14], ['KEY_TAB', 15], ['KEY_Q', 16],
    ['KEY_W', 17], ['KEY_E', 18], ['KEY_R', 19], ['KEY_T', 20], ['KEY_Y', 21], ['KEY_U', 22],
    ['KEY_I', 23], ['KEY_O', 24], ['KEY_P', 25], ['KEY_LEFTBRACE', 26], ['KEY_RIGHTBRACE', 27],
    ['KEY_ENTER', 28], ['KEY_LEFTCTRL', 29], ['KEY_A', 30], ['KEY_S', 31], ['KEY_D', 32],
    ['KEY_F', 33], ['KEY_G', 34], ['KEY_H', 35], ['KEY_J', 36], ['KEY_K', 37], ['KEY_L', 38],
    ['KEY_SEMICOLON', 39], ['KEY_APOSTROPHE', 40], ['KEY_GRAVE', 41], ['KEY_LEFTSHIFT', 42],
    ['KEY_BACKSLASH', 43], ['KEY_Z', 44], ['KEY_X', 45], ['KEY_C', 46], ['KEY_V', 47],
    ['KEY_B', 48], ['KEY_N', 49], ['KEY_M', 50], ['KEY_COMMA', 51], ['KEY_DOT', 52],
    ['KEY_SLASH', 53], ['KEY_RIGHTSHIFT', 54], ['KEY_KPASTERISK', 55], ['KEY_LEFTALT', 56],
    ['KEY_SPACE', 57], ['KEY_CAPSLOCK', 58], ['KEY_F1', 59], ['KEY_F2', 60], ['KEY_F3', 61],
    ['KEY_F4', 62], ['KEY_F5', 63], ['KEY_F6', 64], ['KEY_F7', 65], ['KEY_F8', 66], ['KEY_F9', 67],
    ['KEY_F10', 68], ['KEY_NUMLOCK', 69], ['KEY_SCROLLLOCK', 70], ['KEY_KP7', 71], ['KEY_KP8', 72],
    ['KEY_KP9', 73], ['KEY_KPMINUS', 74], ['KEY_KP4', 75], ['KEY_KP5', 76], ['KEY_KP6', 77],
    ['KEY_KPPLUS', 78], ['KEY_KP1', 79], ['KEY_KP2', 80], ['KEY_KP3', 81], ['KEY_KP0', 82],
    ['KEY_KPDOT', 83], ['KEY_ZENKAKUHANKAKU', 85], ['KEY_102ND', 86], ['KEY_F11', 87],
    ['KEY_F12', 88], ['KEY_RO', 89], ['KEY_KATAKANA', 90], ['KEY_HIRAGANA', 91], ['KEY_HENKAN', 92],
    ['KEY_KATAKANAHIRAGANA', 93], ['KEY_MUHENKAN', 94], ['KEY_KPJPCOMMA', 95], ['KEY_KPENTER', 96],
    ['KEY_RIGHTCTRL', 97], ['KEY_KPSLASH', 98], ['KEY_SYSRQ', 99], ['KEY_RIGHTALT', 100],
    ['KEY_LINEFEED', 101], ['KEY_HOME', 102], ['KEY_UP', 103], ['KEY_PAGEUP', 104],
    ['KEY_LEFT', 105], ['KEY_RIGHT', 106], ['KEY_END', 107], ['KEY_DOWN', 108],
    ['KEY_PAGEDOWN', 109], ['KEY_INSERT', 110], ['KEY_DELETE', 111], ['KEY_MACRO', 112],
    ['KEY_MUTE', 113], ['KEY_VOLUMEDOWN', 114], ['KEY_VOLUMEUP', 115], ['KEY_POWER', 116],
    ['KEY_KPEQUAL', 117], ['KEY_KPPLUSMINUS', 118], ['KEY_PAUSE', 119], ['KEY_SCALE', 120],
    ['KEY_KPCOMMA', 121], ['KEY_HANGEUL', 122], ['KEY_HANGUEL', 'KEY_HANGEUL'], ['KEY_HANJA', 123],
    ['KEY_YEN', 124], ['KEY_LEFTMETA', 125], ['KEY_RIGHTMETA', 126], ['KEY_COMPOSE', 127],
    ['KEY_STOP', 128], ['KEY_AGAIN', 129], ['KEY_PROPS', 130], ['KEY_UNDO', 131],
    ['KEY_FRONT', 132], ['KEY_COPY', 133], ['KEY_OPEN', 134], ['KEY_PASTE', 135], ['KEY_FIND', 136],
    ['KEY_CUT', 137], ['KEY_HELP', 138], ['KEY_MENU', 139], ['KEY_CALC', 140], ['KEY_SETUP', 141],
    ['KEY_SLEEP', 142], ['KEY_WAKEUP', 143], ['KEY_FILE', 144], ['KEY_SENDFILE', 145],
    ['KEY_DELETEFILE', 146], ['KEY_XFER', 147], ['KEY_PROG1', 148], ['KEY_PROG2', 149],
    ['KEY_WWW', 150], ['KEY_MSDOS', 151], ['KEY_COFFEE', 152], ['KEY_SCREENLOCK', 'KEY_COFFEE'],
    ['KEY_ROTATE_DISPLAY', 153], ['KEY_DIRECTION', 'KEY_ROTATE_DISPLAY'], ['KEY_CYCLEWINDOWS', 154],
    ['KEY_MAIL', 155], ['KEY_BOOKMARKS', 156], ['KEY_COMPUTER', 157], ['KEY_BACK', 158],
    ['KEY_FORWARD', 159], ['KEY_CLOSECD', 160], ['KEY_EJECTCD', 161], ['KEY_EJECTCLOSECD', 162],
    ['KEY_NEXTSONG', 163], ['KEY_PLAYPAUSE', 164], ['KEY_PREVIOUSSONG', 165], ['KEY_STOPCD', 166],
    ['KEY_RECORD', 167], ['KEY_REWIND', 168], ['KEY_PHONE', 169], ['KEY_ISO', 170],
    ['KEY_CONFIG', 171], ['KEY_HOMEPAGE', 172], ['KEY_REFRESH', 173], ['KEY_EXIT', 174],
    ['KEY_MOVE', 175], ['KEY_EDIT', 176], ['KEY_SCROLLUP', 177], ['KEY_SCROLLDOWN', 178],
    ['KEY_KPLEFTPAREN', 179], ['KEY_KPRIGHTPAREN', 180], ['KEY_NEW', 181], ['KEY_REDO', 182],
    ['KEY_F13', 183], ['KEY_F14', 184], ['KEY_F15', 185], ['KEY_F16', 186], ['KEY_F17', 187],
    ['KEY_F18', 188], ['KEY_F19', 189], ['KEY_F20', 190], ['KEY_F21', 191], ['KEY_F22', 192],
    ['KEY_F23', 193], ['KEY_F24', 194], ['KEY_PLAYCD', 200], ['KEY_PAUSECD', 201],
    ['KEY_PROG3', 202], ['KEY_PROG4', 203], ['KEY_ALL_APPLICATIONS', 204],
    ['KEY_DASHBOARD', 'KEY_ALL_APPLICATIONS'], ['KEY_SUSPEND', 205], ['KEY_CLOSE', 206],
    ['KEY_PLAY', 207], ['KEY_FASTFORWARD', 208], ['KEY_BASSBOOST', 209], ['KEY_PRINT', 210],
    ['KEY_HP', 211], ['KEY_CAMERA', 212], ['KEY_SOUND', 213], ['KEY_QUESTION', 214],
    ['KEY_EMAIL', 215], ['KEY_CHAT', 216], ['KEY_SEARCH', 217], ['KEY_CONNECT', 218],
    ['KEY_FINANCE', 219], ['KEY_SPORT', 220], ['KEY_SHOP', 221], ['KEY_ALTERASE', 222],
    ['KEY_CANCEL', 223], ['KEY_BRIGHTNESSDOWN', 224], ['KEY_BRIGHTNESSUP', 225], ['KEY_MEDIA', 226],
    ['KEY_SWITCHVIDEOMODE', 227], ['KEY_KBDILLUMTOGGLE', 228], ['KEY_KBDILLUMDOWN', 229],
    ['KEY_KBDILLUMUP', 230], ['KEY_SEND', 231], ['KEY_REPLY', 232], ['KEY_FORWARDMAIL', 233],
    ['KEY_SAVE', 234], ['KEY_DOCUMENTS', 235], ['KEY_BATTERY', 236], ['KEY_BLUETOOTH', 237],
    ['KEY_WLAN', 238], ['KEY_UWB', 239], ['KEY_UNKNOWN', 240], ['KEY_VIDEO_NEXT', 241],
    ['KEY_VIDEO_PREV', 242], ['KEY_BRIGHTNESS_CYCLE', 243], ['KEY_BRIGHTNESS_AUTO', 244],
    ['KEY_BRIGHTNESS_ZERO', 'KEY_BRIGHTNESS_AUTO'], ['KEY_DISPLAY_OFF', 245], ['KEY_WWAN', 246],
    ['KEY_WIMAX', 'KEY_WWAN'], ['KEY_RFKILL', 247], ['KEY_MICMUTE', 248]
]

/**
 * The OSS mixer's channels, `SOUND_MIXER_*`, by number. Each has a `SOUND_MASK_*` bit, and the
 * first seventeen a `SOUND_MIXER_READ_*` and `SOUND_MIXER_WRITE_*` request.
 */
// prettier-ignore
const mixerChannels = [
    'VOLUME', 'BASS', 'TREBLE', 'SYNTH', 'PCM', 'SPEAKER', 'LINE', 'MIC', 'CD', 'IMIX', 'ALTPCM',
    'RECLEV', 'IGAIN', 'OGAIN', 'LINE1', 'LINE2', 'LINE3', 'DIGITAL1', 'DIGITAL2', 'DIGITAL3',
    'PHONEIN', 'PHONEOUT', 'VIDEO', 'RADIO', 'MONITOR'
]

/** Every file the table generates, in the order a C program would meet them. */
export const DEVICE_HEADERS = [
    {
        path: 'bits/syscall.h',
        summary:
            "how the functions of the x86 headers make a system call and turn its result into the C library's. It is included by the headers that need it; a program never includes it itself.",
        externC: true,
        items: [
            {
                kind: 'code',
                doc: "The C library's answer for a system call's result. The kernel reports a failure as a negative error number from -4095 to -1, in rax; a C function returns -1 instead and leaves the error number in errno, which <errno.h> names (EBADF, ENOTTY, EAGAIN, ...). Any other result is the call's answer, returned as it is. errno is declared inside the function alone, so a program that reads it includes <errno.h>, as on Linux.",
                c: [
                    'static inline long __aed_syscall_return(long result) {',
                    '    if ((unsigned long)result > -4096UL) {',
                    '        extern int errno;',
                    '        errno = (int)-result;',
                    '        return -1;',
                    '    }',
                    '    return result;',
                    '}'
                ]
            },
            {
                kind: 'code',
                doc: "A system call for the functions that make more than one: the call's number in rax, its arguments in rdi, rsi, rdx, r10, r8 and r9, and the kernel's answer back in rax.",
                c: [
                    'static inline long __aed_syscall(long number, long a1, long a2, long a3, long a4, long a5, long a6) {',
                    '    register long rax __asm__("rax") = number;',
                    '    register long rdi __asm__("rdi") = a1;',
                    '    register long rsi __asm__("rsi") = a2;',
                    '    register long rdx __asm__("rdx") = a3;',
                    '    register long r10 __asm__("r10") = a4;',
                    '    register long r8 __asm__("r8") = a5;',
                    '    register long r9 __asm__("r9") = a6;',
                    '    __asm__ volatile("syscall" : "+r"(rax) : "r"(rdi), "r"(rsi), "r"(rdx), "r"(r10), "r"(r8), "r"(r9) : "rcx", "r11", "memory");',
                    '    return rax;',
                    '}'
                ]
            }
        ]
    },
    {
        path: 'linux/types.h',
        summary:
            "the kernel's fixed-size integer types. The structures of the device headers use them, so a field is exactly as wide as the kernel expects whatever the compiler: __u32 is an unsigned 32-bit integer, __s16 a signed 16-bit one.",
        items: [
            typedef('__s8', 'signed char'),
            typedef('__u8', 'unsigned char'),
            typedef('__s16', 'short'),
            typedef('__u16', 'unsigned short'),
            typedef('__s32', 'int'),
            typedef('__u32', 'unsigned int'),
            typedef('__s64', 'long long'),
            typedef('__u64', 'unsigned long long')
        ]
    },
    {
        path: 'linux/ioctl.h',
        summary:
            "how an ioctl request number is built. Most requests pack four things into 32 bits: whether the argument is read, written or both, the size of the argument in bytes, a letter for the driver ('E' for input devices, 'P' for sound) and a number within it. The kernel checks all four, so a request with the wrong size answers ENOTTY.",
        items: [
            define('_IOC_NRBITS', 8),
            define('_IOC_TYPEBITS', 8),
            define('_IOC_SIZEBITS', 14),
            define('_IOC_DIRBITS', 2),
            define('_IOC_NRMASK', '(1 << _IOC_NRBITS) - 1'),
            define('_IOC_TYPEMASK', '(1 << _IOC_TYPEBITS) - 1'),
            define('_IOC_SIZEMASK', '(1 << _IOC_SIZEBITS) - 1'),
            define('_IOC_DIRMASK', '(1 << _IOC_DIRBITS) - 1'),
            define('_IOC_NRSHIFT', 0),
            define('_IOC_TYPESHIFT', '_IOC_NRSHIFT + _IOC_NRBITS'),
            define('_IOC_SIZESHIFT', '_IOC_TYPESHIFT + _IOC_TYPEBITS'),
            define('_IOC_DIRSHIFT', '_IOC_SIZESHIFT + _IOC_SIZEBITS'),
            note(
                'The direction, seen from the program: _IOC_READ means the kernel writes the argument for the program to read.'
            ),
            //unsigned, so a request with the top bit set is a positive number
            define('_IOC_NONE', '0U', 'No argument, or a plain number'),
            define('_IOC_WRITE', '1U', 'The kernel reads the argument'),
            define('_IOC_READ', '2U', 'The kernel writes the argument'),
            macro(
                '_IOC',
                ['dir', 'type', 'nr', 'size'],
                '(((dir) << _IOC_DIRSHIFT) | ((type) << _IOC_TYPESHIFT) | ((nr) << _IOC_NRSHIFT) | ((size) << _IOC_SIZESHIFT))',
                'A request number from its four parts.',
                { samples: [['_IOC_READ', "'E'", '0x06', '256']] }
            ),
            macro(
                '_IO',
                ['type', 'nr'],
                '_IOC(_IOC_NONE, (type), (nr), 0)',
                'A request with no argument.',
                {
                    samples: [["'P'", '0']]
                }
            ),
            macro(
                '_IOR',
                ['type', 'nr', 'size'],
                '_IOC(_IOC_READ, (type), (nr), sizeof(size))',
                'A request whose argument the kernel writes; size is its type, such as int. In NASM size is its size in bytes, such as input_id_size.',
                { nasm: '_IOC(_IOC_READ, (type), (nr), (size))', samples: [["'E'", '0x01', 'int']] }
            ),
            macro(
                '_IOW',
                ['type', 'nr', 'size'],
                '_IOC(_IOC_WRITE, (type), (nr), sizeof(size))',
                'A request whose argument the kernel reads; size as for _IOR.',
                {
                    nasm: '_IOC(_IOC_WRITE, (type), (nr), (size))',
                    samples: [["'E'", '0x90', 'int']]
                }
            ),
            macro(
                '_IOWR',
                ['type', 'nr', 'size'],
                '_IOC(_IOC_READ | _IOC_WRITE, (type), (nr), sizeof(size))',
                'A request whose argument the kernel reads and then writes back; size as for _IOR.',
                {
                    nasm: '_IOC(_IOC_READ | _IOC_WRITE, (type), (nr), (size))',
                    samples: [["'P'", '2', 'int']]
                }
            ),
            note('The four parts of a request number, taken apart again.'),
            macro('_IOC_DIR', ['nr'], '(((nr) >> _IOC_DIRSHIFT) & _IOC_DIRMASK)', undefined, {
                samples: [['0xC0045002']]
            }),
            macro('_IOC_TYPE', ['nr'], '(((nr) >> _IOC_TYPESHIFT) & _IOC_TYPEMASK)', undefined, {
                samples: [['0xC0045002']]
            }),
            macro('_IOC_NR', ['nr'], '(((nr) >> _IOC_NRSHIFT) & _IOC_NRMASK)', undefined, {
                samples: [['0xC0045002']]
            }),
            macro('_IOC_SIZE', ['nr'], '(((nr) >> _IOC_SIZESHIFT) & _IOC_SIZEMASK)', undefined, {
                samples: [['0xC0045002']]
            })
        ]
    },
    {
        path: 'sys/types.h',
        summary: 'the integer types the POSIX functions take and return.',
        items: [
            typedef('size_t', '__SIZE_TYPE__', 'A size in bytes'),
            typedef('ssize_t', 'long', 'A size in bytes, or -1 for a failure'),
            typedef('off_t', 'long', 'A position in a file, in bytes'),
            typedef('pid_t', 'int', 'A process id'),
            typedef('uid_t', 'unsigned int', 'A user id'),
            typedef('gid_t', 'unsigned int', 'A group id'),
            typedef('mode_t', 'unsigned int', "A file's type and permission bits"),
            typedef('useconds_t', 'unsigned int', 'A number of microseconds'),
            typedef('suseconds_t', 'long', 'A number of microseconds, signed'),
            typedef('time_t', 'long long', 'Seconds since 1970-01-01 UTC, as <time.h> has it'),
            typedef('clockid_t', 'int', 'Which clock: CLOCK_REALTIME, CLOCK_MONOTONIC, ...'),
            typedef('dev_t', 'unsigned long', "A device's number, its major and minor together"),
            typedef('ino_t', 'unsigned long', "A file's number in its file system"),
            typedef('nlink_t', 'unsigned long', 'How many names a file has'),
            typedef('blksize_t', 'long', 'A block size in bytes'),
            typedef('blkcnt_t', 'long', 'A number of 512-byte blocks')
        ]
    },
    {
        path: 'bits/types/struct_timeval.h',
        nasmSummary: 'struct timeval, a time in seconds and microseconds.',
        summary:
            "struct timeval, which <sys/time.h> and <sys/select.h> both give, as the C library's own headers do. A program includes one of them, not this file.",
        items: [
            typedef('time_t', 'long long', 'Seconds since 1970-01-01 UTC'),
            typedef('suseconds_t', 'long', 'A number of microseconds, signed'),
            struct('timeval', 'A time in seconds and microseconds.', [
                field('time_t', 'tv_sec', 'Whole seconds'),
                field('suseconds_t', 'tv_usec', 'Microseconds, 0 to 999999')
            ])
        ]
    },
    {
        path: 'bits/types/struct_timespec.h',
        nasmSummary: 'struct timespec, a time in seconds and nanoseconds.',
        summary:
            "struct timespec, which <time.h> and <sys/stat.h> both give, as the C library's own headers do. A program includes one of them, not this file.",
        items: [
            typedef('time_t', 'long long', 'Seconds since 1970-01-01 UTC'),
            struct('timespec', 'A time in seconds and nanoseconds.', [
                field('time_t', 'tv_sec', 'Whole seconds'),
                field('long', 'tv_nsec', 'Nanoseconds, 0 to 999999999')
            ])
        ]
    },
    {
        path: 'sys/time.h',
        nasmSummary:
            "struct timeval, a time in seconds and microseconds: the time stamp of every input event, and select's timeout.",
        summary:
            "struct timeval, a time in seconds and microseconds: the time stamp of every input event, select's timeout and gettimeofday's answer. It also gives select, from <sys/select.h>, as the C library's does.",
        includes: ['sys/types.h', 'bits/types/struct_timeval.h', 'bits/syscall.h'],
        items: [
            struct(
                'timezone',
                'What gettimeofday once reported about the time zone; pass NULL instead.',
                [field('int', 'tz_minuteswest'), field('int', 'tz_dsttime')]
            ),
            posix(
                'gettimeofday',
                'int',
                ['struct timeval *tv', 'void *tz'],
                'Stores the current time, CLOCK_REALTIME, in *tv, in seconds and microseconds since 1970-01-01 UTC. Pass NULL for tz. Returns 0, or -1 with errno set.',
                { syscall: 'gettimeofday' }
            ),
            include('sys/select.h')
        ]
    },
    {
        path: 'sys/select.h',
        nasmSummary:
            "select's descriptor sets: an fd_set has one bit per descriptor, descriptor n being bit n % 64 of the qword n / 64.",
        summary:
            'select, the older way to wait on several descriptors at once; <poll.h> does the same with a list instead of bit sets. Descriptors are numbered bits of an fd_set, which FD_ZERO, FD_SET, FD_CLR and FD_ISSET read and change.',
        includes: ['sys/types.h', 'bits/types/struct_timeval.h', 'bits/syscall.h'],
        items: [
            define('FD_SETSIZE', 1024, 'One more than the highest descriptor an fd_set can hold'),
            struct(
                null,
                'A set of descriptors, one bit each.',
                [field('unsigned long', 'fds_bits', undefined, { count: 'FD_SETSIZE / 64' })],
                { typedef: 'fd_set' }
            ),
            macro(
                'FD_ZERO',
                ['set'],
                'do { unsigned __i; for (__i = 0; __i < FD_SETSIZE / 64; __i++) (set)->fds_bits[__i] = 0; } while (0)',
                'Empties the set.'
            ),
            macro(
                'FD_SET',
                ['fd', 'set'],
                '((set)->fds_bits[(fd) / 64] |= 1UL << ((fd) % 64))',
                'Adds fd to the set.'
            ),
            macro(
                'FD_CLR',
                ['fd', 'set'],
                '((set)->fds_bits[(fd) / 64] &= ~(1UL << ((fd) % 64)))',
                'Removes fd from the set.'
            ),
            macro(
                'FD_ISSET',
                ['fd', 'set'],
                '(((set)->fds_bits[(fd) / 64] & (1UL << ((fd) % 64))) != 0)',
                'Whether fd is in the set: 1 or 0.'
            ),
            posix(
                'select',
                'int',
                [
                    'int nfds',
                    'fd_set *readfds',
                    'fd_set *writefds',
                    'fd_set *exceptfds',
                    'struct timeval *timeout'
                ],
                'Waits for readiness: readfds for reading, writefds for writing, and exceptfds for exceptional conditions (POLLPRI). Set nfds to one more than the highest descriptor in any set. Pass NULL for an unused set or an unlimited timeout; a zero timeout only checks. On success, the sets contain only ready descriptors. Returns the total number of ready bits across all sets, 0 on timeout, or -1 with errno set. One descriptor can count in more than one set. The sets and *timeout are modified; prepare them again before another wait. *timeout holds the remaining time.',
                { syscall: 'select' }
            )
        ]
    },
    {
        path: 'time.h',
        nasmSummary:
            'struct timespec, a time in seconds and nanoseconds, and the clocks the clock_gettime system call reads.',
        summary:
            "x86's additions to the Runtime library's <time.h>, which it includes first: struct timespec, the clocks, clock_gettime and nanosleep, as Linux's C library has them.",
        includeNext: 'time.h',
        includes: ['bits/types/struct_timespec.h', 'bits/syscall.h'],
        guard: '_AED_X86_TIME_H',
        items: [
            typedef('clockid_t', 'int', 'Which clock: CLOCK_REALTIME, CLOCK_MONOTONIC, ...'),
            note(
                "The clocks. Every one runs on the program's own time, which a Testcase makes virtual."
            ),
            define('CLOCK_REALTIME', 0, 'The date and time, which can jump'),
            define('CLOCK_MONOTONIC', 1, 'Time since an arbitrary start, which never goes back'),
            define('CLOCK_PROCESS_CPUTIME_ID', 2, 'Processor time this program used'),
            define('CLOCK_THREAD_CPUTIME_ID', 3, 'Processor time this thread used'),
            define('CLOCK_MONOTONIC_RAW', 4),
            define('CLOCK_REALTIME_COARSE', 5),
            define('CLOCK_MONOTONIC_COARSE', 6),
            define('CLOCK_BOOTTIME', 7, 'Like CLOCK_MONOTONIC, counting suspended time too'),
            posix(
                'clock_gettime',
                'int',
                ['clockid_t clockid', 'struct timespec *tp'],
                'Reads the time from clockid into *tp as seconds and nanoseconds. Returns 0, or -1 with errno set (EINVAL for an unknown clock).',
                { syscall: 'clock_gettime' }
            ),
            posix(
                'nanosleep',
                'int',
                ['const struct timespec *request', 'struct timespec *remaining'],
                'Waits for the duration in *request. Returns 0 on completion, or -1 with errno set. If a signal interrupts the wait, errno is EINTR and *remaining receives the time left, unless remaining is NULL.',
                { syscall: 'nanosleep' }
            )
        ]
    },
    {
        path: 'unistd.h',
        nasmSummary: "the standard descriptors, and lseek's starting points.",
        summary:
            'the POSIX calls on descriptors: read, write, close and lseek, which work on files and devices alike, and the sleeps.',
        includes: ['sys/types.h', 'bits/syscall.h'],
        items: [
            define('STDIN_FILENO', 0, 'Standard input: what is typed in the Terminal'),
            define('STDOUT_FILENO', 1, 'Standard output: the Terminal'),
            define('STDERR_FILENO', 2, 'Standard error: the Terminal'),
            define('SEEK_SET', 0, 'lseek from the start'),
            define('SEEK_CUR', 1, 'lseek from the current position'),
            define('SEEK_END', 2, 'lseek from the end'),
            posix(
                'read',
                'ssize_t',
                ['int fd', 'void *buffer', 'size_t count'],
                'Reads up to count bytes from fd into buffer. Returns the byte count, which may be less than count, 0 at end of input, or -1 with errno set. EAGAIN means a nonblocking descriptor has no input ready. For an input device, a buffer smaller than one input_event fails with EINVAL.',
                { syscall: 'read' }
            ),
            posix(
                'write',
                'ssize_t',
                ['int fd', 'const void *buffer', 'size_t count'],
                'Writes up to count bytes from buffer to fd. Returns the byte count, or -1 with errno set. After a short successful write, submit the remaining bytes in another call. EAGAIN means a nonblocking descriptor cannot accept any bytes now.',
                { syscall: 'write' }
            ),
            posix('close', 'int', ['int fd'], 'Closes fd. Returns 0, or -1 with errno set.', {
                syscall: 'close'
            }),
            posix(
                'getpid',
                'pid_t',
                ['void'],
                "Returns the program's process ID, which can be passed to kill. This call does not fail.",
                { syscall: 'getpid', args: [] }
            ),
            posix(
                'lseek',
                'off_t',
                ['int fd', 'off_t offset', 'int whence'],
                'Sets the byte position of fd to offset relative to the start (SEEK_SET), current position (SEEK_CUR) or end (SEEK_END). Returns the new position, or -1 with errno set. The Terminal and devices other than /dev/fb0 have no seek position and fail with ESPIPE.',
                { syscall: 'lseek' }
            ),
            posix(
                'isatty',
                'int',
                ['int fd'],
                'Returns 1 if fd refers to the Terminal or console. Otherwise returns 0 with errno set: ENOTTY for a file or another device, EBADF for a descriptor that is not open.',
                {
                    syscall: 'ioctl',
                    //the kernel's struct termios, which TCGETS fills: 36 bytes
                    before: ['unsigned char modes[36];'],
                    args: ['fd', '0x5401 /* TCGETS */', '(long)modes'],
                    result: '__aed_syscall_return(rax) == 0'
                }
            ),
            posix(
                'fsync',
                'int',
                ['int fd'],
                'Synchronizes pending file changes for fd. On /dev/fb0, requests an immediate update of the Screen from the framebuffer. Returns 0, or -1 with errno set.',
                { syscall: 'fsync' }
            ),
            posix(
                'usleep',
                'int',
                ['useconds_t microseconds'],
                'Waits for the requested number of microseconds. Returns 0 on completion, or -1 with errno set; EINTR means a signal interrupted the wait.',
                {
                    syscall: 'nanosleep',
                    before: [
                        'struct { long tv_sec; long tv_nsec; } request = { (long)(microseconds / 1000000), (long)(microseconds % 1000000) * 1000 };'
                    ],
                    args: ['(long)&request', '0']
                }
            ),
            posix(
                'sleep',
                'unsigned int',
                ['unsigned int seconds'],
                'Waits for the requested number of seconds. Returns 0 on completion, or the whole seconds remaining if a signal interrupts the wait.',
                {
                    syscall: 'nanosleep',
                    before: [
                        'struct { long tv_sec; long tv_nsec; } request = { (long)seconds, 0 }, remaining = { 0, 0 };'
                    ],
                    args: ['(long)&request', '(long)&remaining'],
                    result: '__aed_syscall_return(rax) < 0 ? (unsigned int)remaining.tv_sec : 0'
                }
            )
        ]
    },
    {
        path: 'fcntl.h',
        nasmSummary:
            "the open system call's flags and fcntl's commands: a program that polls a device in a loop opens it with O_NONBLOCK.",
        summary:
            "open and its flags, and fcntl, which reads and changes a descriptor's flags afterwards; a program that polls a device in a loop opens it with O_NONBLOCK.",
        includes: ['sys/types.h', 'bits/syscall.h'],
        items: [
            note('How the file is opened: exactly one of the first three, then any of the others.'),
            ...defines(
                [
                    ['O_ACCMODE', 0o3, 'The bits that hold the first three'],
                    ['O_RDONLY', 0o0, 'For reading'],
                    ['O_WRONLY', 0o1, 'For writing'],
                    ['O_RDWR', 0o2, 'For reading and writing'],
                    [
                        'O_CREAT',
                        0o100,
                        "Create the file if it does not exist, with open's third argument as its mode"
                    ],
                    ['O_EXCL', 0o200, 'With O_CREAT: fail with EEXIST if it exists'],
                    ['O_NOCTTY', 0o400],
                    ['O_TRUNC', 0o1000, 'Empty a file opened for writing'],
                    ['O_APPEND', 0o2000, 'Write at the end'],
                    [
                        'O_NONBLOCK',
                        0o4000,
                        'Never wait: a read with nothing ready fails with EAGAIN'
                    ],
                    ['O_DSYNC', 0o10000],
                    ['O_DIRECTORY', 0o200000, 'Fail unless it is a directory'],
                    ['O_NOFOLLOW', 0o400000, 'Fail if it is a symbolic link'],
                    ['O_CLOEXEC', 0o2000000, 'Close it in a program started by execve'],
                    ['O_SYNC', 0o4010000]
                ],
                8
            ),
            define('O_NDELAY', 'O_NONBLOCK', 'The old name of O_NONBLOCK'),
            note("fcntl's commands."),
            define(
                'F_DUPFD',
                0,
                'Duplicate the descriptor, to the lowest free number from the argument'
            ),
            define('F_GETFD', 1, "Read the descriptor's flags (FD_CLOEXEC)"),
            define('F_SETFD', 2, "Set the descriptor's flags"),
            define('F_GETFL', 3, 'Read the flags it was opened with (O_NONBLOCK, O_APPEND, ...)'),
            define('F_SETFL', 4, 'Change O_NONBLOCK and O_APPEND'),
            define('F_DUPFD_CLOEXEC', 1030),
            define('FD_CLOEXEC', 1, 'The descriptor flag F_GETFD and F_SETFD read and set'),
            posix(
                'open',
                'int',
                ['const char *path', 'int flags', '...'],
                'Opens the file or device at path, such as "/dev/fb0", using flags such as O_RDWR or O_RDONLY | O_NONBLOCK. With O_CREAT, supply a third argument for the new file mode, such as 0644. Returns a file descriptor, or -1 with errno set. ENOENT means the path does not exist; ENODEV means the device is unavailable here.',
                {
                    syscall: 'open',
                    before: [
                        'mode_t mode = 0;',
                        'if (flags & O_CREAT) {',
                        '    __builtin_va_list arguments;',
                        '    __builtin_va_start(arguments, flags);',
                        '    mode = __builtin_va_arg(arguments, mode_t);',
                        '    __builtin_va_end(arguments);',
                        '}'
                    ],
                    args: ['(long)path', 'flags', 'mode']
                }
            ),
            posix(
                'fcntl',
                'int',
                ['int fd', 'int cmd', '...'],
                "Applies cmd to fd. Commands that need a value take a third argument. For example, fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK) enables nonblocking I/O. Returns the command's result, or -1 with errno set.",
                {
                    syscall: 'fcntl',
                    before: [
                        '__builtin_va_list arguments;',
                        '__builtin_va_start(arguments, cmd);',
                        'void *argument = __builtin_va_arg(arguments, void *);',
                        '__builtin_va_end(arguments);'
                    ],
                    args: ['fd', 'cmd', '(long)argument']
                }
            )
        ]
    },
    {
        path: 'sys/ioctl.h',
        nasmSummary: "the Terminal's ioctl requests and struct winsize.",
        summary:
            "ioctl, a device's own operations: each device answers its own requests, which its header names (<linux/fb.h>, <linux/input.h>, <linux/soundcard.h>, ...), and here are the Terminal's. A request a device does not know answers ENOTTY.",
        includes: ['linux/ioctl.h', 'bits/syscall.h'],
        items: [
            note("The Terminal's requests. <termios.h>'s functions make the first four for you."),
            define('TCGETS', 0x5401, "Read the terminal's struct termios", { radix: 16 }),
            define('TCSETS', 0x5402, 'Change it now', { radix: 16 }),
            define('TCSETSW', 0x5403, 'Change it once the output has been sent', { radix: 16 }),
            define('TCSETSF', 0x5404, 'Same, and discard the input not read yet', { radix: 16 }),
            define(
                'TCSBRK',
                0x5409,
                'With an argument other than 0, wait until the output has been sent',
                {
                    radix: 16
                }
            ),
            define(
                'TCFLSH',
                0x540b,
                'Discard the input not read yet (TCIFLUSH, TCIOFLUSH of <termios.h>)',
                {
                    radix: 16
                }
            ),
            define('TIOCGWINSZ', 0x5413, "Read the terminal's size into a struct winsize", {
                radix: 16
            }),
            define('TIOCSWINSZ', 0x5414, 'Set the size a struct winsize gives', { radix: 16 }),
            define('FIONREAD', 0x541b, 'How many bytes a read would get now, into an int', {
                radix: 16
            }),
            define('TIOCINQ', 'FIONREAD'),
            define('FIONBIO', 0x5421, 'Turn O_NONBLOCK on (an int other than 0) or off (0)', {
                radix: 16
            }),
            struct('winsize', "The terminal's size, which TIOCGWINSZ reads.", [
                field('unsigned short', 'ws_row', 'Rows of characters'),
                field('unsigned short', 'ws_col', 'Columns of characters'),
                field('unsigned short', 'ws_xpixel'),
                field('unsigned short', 'ws_ypixel')
            ]),
            posix(
                'ioctl',
                'int',
                ['int fd', 'unsigned long request', '...'],
                "Applies request to the device open on fd. The request defines whether the third argument is a pointer, an immediate integer or unused; check its device reference. Returns the request's result, usually 0, or -1 with errno set. ENOTTY means the device does not support the request; EINVAL means an invalid argument.",
                {
                    syscall: 'ioctl',
                    before: [
                        '__builtin_va_list arguments;',
                        '__builtin_va_start(arguments, request);',
                        'void *argument = __builtin_va_arg(arguments, void *);',
                        '__builtin_va_end(arguments);'
                    ],
                    args: ['fd', '(long)request', '(long)argument']
                }
            )
        ]
    },
    {
        path: 'sys/mman.h',
        nasmSummary:
            "the mmap system call's protections and flags: mapping /dev/fb0 gives the address of the Screen's pixels, written like any memory.",
        summary:
            "mmap, which maps a device's memory into the program: mapping /dev/fb0 gives a pointer to the Screen's pixels, written like any array.",
        includes: ['sys/types.h', 'bits/syscall.h'],
        items: [
            note('What the program may do with the mapped memory.'),
            define('PROT_NONE', 0, 'Nothing'),
            define('PROT_READ', 1, 'Read it'),
            define('PROT_WRITE', 2, 'Write it'),
            define('PROT_EXEC', 4, 'Run it'),
            note('How it is mapped: exactly one of the first two, then any of the others.'),
            ...defines(
                [
                    [
                        'MAP_SHARED',
                        0x01,
                        'Writes reach the device or file, and every mapping of it sees them'
                    ],
                    ['MAP_PRIVATE', 0x02, "Writes stay in the program's own copy"],
                    ['MAP_FIXED', 0x10, 'Exactly at the address given'],
                    [
                        'MAP_ANONYMOUS',
                        0x20,
                        'New zeroed memory, no file: pass -1 as the descriptor'
                    ],
                    ['MAP_NORESERVE', 0x4000],
                    ['MAP_POPULATE', 0x8000]
                ],
                16
            ),
            define('MAP_ANON', 'MAP_ANONYMOUS'),
            define('MAP_FAILED', -1, 'What mmap returns when it fails', {
                c: '((void *)-1)',
                nasm: false,
                probe: '(long long)(long)MAP_FAILED'
            }),
            posix(
                'mmap',
                'void *',
                [
                    'void *address',
                    'size_t length',
                    'int prot',
                    'int flags',
                    'int fd',
                    'off_t offset'
                ],
                "Maps length bytes of fd starting at offset into the program's address space. If address is NULL, the system chooses the address. For the Screen, use mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0). Returns the mapped address, or MAP_FAILED with errno set.",
                { syscall: 'mmap', result: '(void *)__aed_syscall_return(rax)' }
            ),
            posix(
                'munmap',
                'int',
                ['void *address', 'size_t length'],
                'Removes the mapping of length bytes at address. Returns 0, or -1 with errno set.',
                { syscall: 'munmap' }
            )
        ]
    },
    {
        path: 'poll.h',
        nasmSummary:
            'struct pollfd and its events, for the poll system call, which waits on several descriptors at once with a timeout.',
        summary:
            'poll, which waits on several descriptors at once (the keyboard, the pointer, the Terminal) with a timeout: the event loop of an interactive program.',
        includes: ['bits/syscall.h'],
        items: [
            typedef('nfds_t', 'unsigned long', 'How many entries the array holds'),
            struct('pollfd', 'One descriptor to wait on, and what happened to it.', [
                field('int', 'fd', 'The descriptor; a negative one is skipped'),
                field('short', 'events', 'What to wait for: POLLIN, POLLOUT, ...'),
                field('short', 'revents', 'What happened, which poll fills in')
            ]),
            ...defines(
                [
                    ['POLLIN', 0x001, 'There is something to read'],
                    ['POLLPRI', 0x002, 'There is urgent data to read'],
                    ['POLLOUT', 0x004, 'A write would not wait'],
                    ['POLLERR', 0x008, 'An error (revents only)'],
                    ['POLLHUP', 0x010, 'The other end hung up (revents only)'],
                    ['POLLNVAL', 0x020, 'The descriptor is not open (revents only)'],
                    ['POLLRDNORM', 0x040],
                    ['POLLRDBAND', 0x080],
                    ['POLLWRNORM', 0x100],
                    ['POLLWRBAND', 0x200]
                ],
                16
            ),
            posix(
                'poll',
                'int',
                ['struct pollfd *fds', 'nfds_t nfds', 'int timeout'],
                'Checks the first nfds elements of fds. Each events field requests readiness, such as POLLIN for reading or POLLOUT for writing; revents receives the resulting flags. Waits up to timeout milliseconds (-1 waits indefinitely, 0 only checks). Returns the number of array elements with nonzero revents, 0 on timeout, or -1 with errno set.',
                { syscall: 'poll' }
            )
        ]
    },
    {
        path: 'termios.h',
        nasmSummary:
            'struct termios and its mode bits for TCGETS and TCSETS from sys/ioctl.inc. Clear ICANON in c_lflag to read bytes without waiting for Enter, and clear ECHO to hide typed input.',
        summary:
            'terminal settings. Read them with tcgetattr, modify the structure, then apply it with tcsetattr. Clear ICANON to read bytes without waiting for Enter, or ECHO to hide typed input. cfmakeraw disables line buffering, echo, signal-generating control characters and byte processing.',
        includes: ['bits/syscall.h'],
        items: [
            typedef('tcflag_t', 'unsigned int', 'A set of mode bits'),
            typedef('cc_t', 'unsigned char', 'A special character'),
            typedef('speed_t', 'unsigned int', 'A line speed'),
            define('NCCS', 32, 'How many special characters c_cc holds'),
            struct(
                'termios',
                "The Terminal's modes, as tcgetattr reads them and tcsetattr sets them. The kernel reads and writes the fields up to c_cc[18].",
                [
                    field('tcflag_t', 'c_iflag', 'Input modes: ICRNL, IXON, ...'),
                    field('tcflag_t', 'c_oflag', 'Output modes: OPOST, ONLCR'),
                    field('tcflag_t', 'c_cflag', 'Line modes: CS8, ...'),
                    field('tcflag_t', 'c_lflag', 'Local modes: ICANON, ECHO, ISIG, ...'),
                    field('cc_t', 'c_line'),
                    field('cc_t', 'c_cc', 'The special characters, by the V* numbers below', {
                        count: 'NCCS'
                    }),
                    field('speed_t', 'c_ispeed'),
                    field('speed_t', 'c_ospeed')
                ]
            ),
            note(
                'Where each special character is in c_cc. VMIN and VTIME say what a read waits for when ICANON is off: VMIN bytes, or VTIME tenths of a second after the first one.'
            ),
            ...defines([
                ['VINTR', 0, 'Ctrl+C, which sends SIGINT under ISIG'],
                ['VQUIT', 1, 'Ctrl+\\, which sends SIGQUIT under ISIG'],
                ['VERASE', 2],
                ['VKILL', 3],
                ['VEOF', 4, 'Ctrl+D'],
                ['VTIME', 5],
                ['VMIN', 6],
                ['VSWTC', 7],
                ['VSTART', 8],
                ['VSTOP', 9],
                ['VSUSP', 10],
                ['VEOL', 11],
                ['VREPRINT', 12],
                ['VDISCARD', 13],
                ['VWERASE', 14],
                ['VLNEXT', 15],
                ['VEOL2', 16]
            ]),
            note('c_iflag: how typed input is processed.'),
            ...defines(
                [
                    ['IGNBRK', 0o1],
                    ['BRKINT', 0o2],
                    ['IGNPAR', 0o4],
                    ['PARMRK', 0o10],
                    ['INPCK', 0o20],
                    ['ISTRIP', 0o40, 'Clear the top bit of every byte'],
                    ['INLCR', 0o100],
                    ['IGNCR', 0o200],
                    ['ICRNL', 0o400, "Enter gives '\\n' instead of '\\r'"],
                    ['IUCLC', 0o1000],
                    ['IXON', 0o2000, 'Ctrl+S and Ctrl+Q stop and restart output (ignored here)'],
                    ['IXANY', 0o4000],
                    ['IXOFF', 0o10000],
                    ['IMAXBEL', 0o20000],
                    ['IUTF8', 0o40000]
                ],
                8
            ),
            note('c_oflag: how output is processed.'),
            ...defines(
                [
                    ['OPOST', 0o1, 'Process output at all'],
                    ['OLCUC', 0o2],
                    ['ONLCR', 0o4, "Write '\\n' as '\\r' '\\n'"],
                    ['OCRNL', 0o10],
                    ['ONOCR', 0o20],
                    ['ONLRET', 0o40],
                    ['OFILL', 0o100],
                    ['OFDEL', 0o200]
                ],
                8
            ),
            note("c_cflag: the serial line's settings."),
            ...defines(
                [
                    ['CSIZE', 0o60, 'The bits that hold the character size'],
                    ['CS5', 0o0],
                    ['CS6', 0o20],
                    ['CS7', 0o40],
                    ['CS8', 0o60, '8-bit characters'],
                    ['CSTOPB', 0o100],
                    ['CREAD', 0o200],
                    ['PARENB', 0o400],
                    ['PARODD', 0o1000],
                    ['HUPCL', 0o2000],
                    ['CLOCAL', 0o4000],
                    [
                        'CBAUD',
                        0o10017,
                        "The bits that hold the line's speed: B9600 on the serial line here"
                    ],
                    ['CBAUDEX', 0o10000, 'The bit of CBAUD that marks the faster speeds']
                ],
                8
            ),
            note('c_lflag: line editing, echo and signals.'),
            ...defines(
                [
                    ['ISIG', 0o1, 'Ctrl+C and Ctrl+\\ send signals'],
                    [
                        'ICANON',
                        0o2,
                        'Canonical mode: reads get whole lines, which can be edited first'
                    ],
                    ['ECHO', 0o10, 'Show typed characters'],
                    ['ECHOE', 0o20],
                    ['ECHOK', 0o40],
                    ['ECHONL', 0o100],
                    ['NOFLSH', 0o200],
                    ['TOSTOP', 0o400],
                    ['ECHOCTL', 0o1000],
                    ['ECHOPRT', 0o2000],
                    ['ECHOKE', 0o4000],
                    ['FLUSHO', 0o10000],
                    ['PENDIN', 0o40000],
                    ['IEXTEN', 0o100000],
                    ['EXTPROC', 0o200000]
                ],
                8
            ),
            note("When tcsetattr's change takes effect."),
            define('TCSANOW', 0, 'At once'),
            define('TCSADRAIN', 1, 'Once the output has been sent'),
            define(
                'TCSAFLUSH',
                2,
                'Once the output has been sent, discarding the input not read yet'
            ),
            note('What tcflush discards.'),
            define('TCIFLUSH', 0, 'The input not read yet'),
            define('TCOFLUSH', 1, 'The output not sent yet'),
            define('TCIOFLUSH', 2, 'Both'),
            posix(
                'tcgetattr',
                'int',
                ['int fd', 'struct termios *termios'],
                'Reads the terminal settings for fd into *termios. Returns 0, or -1 with errno set (ENOTTY if fd is not a terminal). The c_cc array contains 19 control-character slots used by the kernel; later slots are zero. c_ispeed and c_ospeed reflect the baud-rate bits in c_cflag.',
                {
                    syscall: 'ioctl',
                    args: ['fd', '0x5401 /* TCGETS */', '(long)termios'],
                    //the kernel fills the fields up to c_cc[18], 36 bytes
                    after: [
                        'if (rax == 0) {',
                        '    unsigned __i;',
                        '    for (__i = 19; __i < NCCS; __i++) termios->c_cc[__i] = 0;',
                        '    termios->c_ispeed = termios->c_ospeed = termios->c_cflag & (CBAUD | CBAUDEX);',
                        '}'
                    ]
                }
            ),
            posix(
                'tcsetattr',
                'int',
                ['int fd', 'int action', 'const struct termios *termios'],
                'Applies *termios to terminal fd. action selects when: TCSANOW applies immediately, TCSADRAIN waits for output to drain, and TCSAFLUSH also discards unread input after draining output. These use TCSETS, TCSETSW and TCSETSF respectively. Returns 0, or -1 with errno set.',
                {
                    syscall: 'ioctl',
                    before: [
                        'if (action < TCSANOW || action > TCSAFLUSH)',
                        '    return (int)__aed_syscall_return(-22); /* EINVAL */'
                    ],
                    args: ['fd', '0x5402 /* TCSETS */ + action', '(long)termios']
                }
            ),
            posix(
                'tcflush',
                'int',
                ['int fd', 'int queue'],
                'Discards queued terminal data on fd: unread input for TCIFLUSH, unsent output for TCOFLUSH, or both for TCIOFLUSH. Returns 0, or -1 with errno set.',
                { syscall: 'ioctl', args: ['fd', '0x540b /* TCFLSH */', 'queue'] }
            ),
            posix(
                'tcdrain',
                'int',
                ['int fd'],
                "Waits until all output written to terminal fd has been sent. The editor's Terminal drains immediately. Returns 0, or -1 with errno set.",
                { syscall: 'ioctl', args: ['fd', '0x5409 /* TCSBRK */', '1'] }
            ),
            posix(
                'cfmakeraw',
                'void',
                ['struct termios *termios'],
                "Disables line buffering, echo, signal-generating control characters, input translations and output processing in *termios. Apply the changed settings with tcsetattr. Input remains a byte stream; special keys can produce escape sequences. Output '\\n' no longer supplies '\\r', so write '\\r\\n' for a new line.",
                {
                    documentation: 'ioctl',
                    body: [
                        'termios->c_iflag &= ~(tcflag_t)(IGNBRK | BRKINT | PARMRK | ISTRIP | INLCR | IGNCR | ICRNL | IXON);',
                        'termios->c_oflag &= ~(tcflag_t)OPOST;',
                        'termios->c_lflag &= ~(tcflag_t)(ECHO | ECHONL | ICANON | ISIG | IEXTEN);',
                        'termios->c_cflag &= ~(tcflag_t)(CSIZE | PARENB);',
                        'termios->c_cflag |= CS8;',
                        'termios->c_cc[VMIN] = 1;',
                        'termios->c_cc[VTIME] = 0;'
                    ]
                }
            )
        ]
    },
    {
        path: 'sys/stat.h',
        nasmSummary:
            'struct stat, which the stat, fstat and lstat system calls fill in, and the type and permission bits of its st_mode: S_IFCHR for a device such as /dev/fb0.',
        summary:
            'stat, fstat and lstat, which describe a file: its type, size and permissions and, for a device, which one it is. S_ISCHR(st.st_mode) tells a device such as /dev/fb0 or /dev/input/event0 from a file.',
        includes: ['sys/types.h', 'bits/types/struct_timespec.h', 'bits/syscall.h'],
        items: [
            struct('stat', 'What stat, fstat and lstat fill in, as Linux lays it out on x86-64.', [
                field('dev_t', 'st_dev', 'The device the file is on'),
                field('ino_t', 'st_ino', "The file's number"),
                field('nlink_t', 'st_nlink', 'How many names it has'),
                field('mode_t', 'st_mode', 'Its type (S_IFMT) and permission bits'),
                field('uid_t', 'st_uid', 'Its owner'),
                field('gid_t', 'st_gid', 'Its group'),
                field('int', '__pad0'),
                field(
                    'dev_t',
                    'st_rdev',
                    'For a device, which one: (major << 8) | minor here, 0x1d00 for /dev/fb0'
                ),
                field('off_t', 'st_size', 'Its size in bytes'),
                field('blksize_t', 'st_blksize'),
                field('blkcnt_t', 'st_blocks'),
                field('struct timespec', 'st_atim', 'When it was last read'),
                field('struct timespec', 'st_mtim', 'When it was last written'),
                field('struct timespec', 'st_ctim', 'When its details last changed'),
                field('long', '__glibc_reserved', undefined, { count: 3 })
            ]),
            macro('st_atime', [], 'st_atim.tv_sec', 'The older names of the times, in seconds'),
            macro('st_mtime', [], 'st_mtim.tv_sec'),
            macro('st_ctime', [], 'st_ctim.tv_sec'),
            note(
                "st_mode's file types: compare st_mode & S_IFMT with one, or use S_ISCHR and the rest."
            ),
            ...defines(
                [
                    ['S_IFMT', 0o170000, 'The bits that hold the type'],
                    ['S_IFSOCK', 0o140000],
                    ['S_IFLNK', 0o120000, 'A symbolic link, which lstat sees and stat follows'],
                    ['S_IFREG', 0o100000, 'A file'],
                    ['S_IFBLK', 0o060000],
                    ['S_IFDIR', 0o040000, 'A directory'],
                    ['S_IFCHR', 0o020000, 'A character device: every device here'],
                    ['S_IFIFO', 0o010000]
                ],
                8
            ),
            ...[
                ['S_ISREG', 'S_IFREG', "Whether st_mode is a file's: 1 or 0"],
                ['S_ISDIR', 'S_IFDIR', 'A directory'],
                ['S_ISCHR', 'S_IFCHR', 'A character device'],
                ['S_ISBLK', 'S_IFBLK'],
                ['S_ISFIFO', 'S_IFIFO'],
                ['S_ISLNK', 'S_IFLNK'],
                ['S_ISSOCK', 'S_IFSOCK']
            ].map(([name, type, doc]) =>
                macro(name, ['mode'], `(((mode) & S_IFMT) == ${type})`, doc, {
                    samples: [[type], ['S_IFREG | 0644']]
                })
            ),
            note('The permission bits: read, write and run, for the owner, the group and others.'),
            ...defines(
                [
                    ['S_ISUID', 0o4000],
                    ['S_ISGID', 0o2000],
                    ['S_ISVTX', 0o1000],
                    ['S_IRWXU', 0o700],
                    ['S_IRUSR', 0o400],
                    ['S_IWUSR', 0o200],
                    ['S_IXUSR', 0o100],
                    ['S_IRWXG', 0o070],
                    ['S_IRGRP', 0o040],
                    ['S_IWGRP', 0o020],
                    ['S_IXGRP', 0o010],
                    ['S_IRWXO', 0o007],
                    ['S_IROTH', 0o004],
                    ['S_IWOTH', 0o002],
                    ['S_IXOTH', 0o001]
                ],
                8
            ),
            posix(
                'stat',
                'int',
                ['const char *path', 'struct stat *buffer'],
                'Describes the file at path in *buffer, following a symbolic link to what it names. Returns 0, or -1 with errno set (ENOENT when there is no such file).',
                { syscall: 'stat' }
            ),
            posix(
                'fstat',
                'int',
                ['int fd', 'struct stat *buffer'],
                'Describes the file or device open on fd in *buffer. Returns 0, or -1 with errno set.',
                { syscall: 'fstat' }
            ),
            posix(
                'lstat',
                'int',
                ['const char *path', 'struct stat *buffer'],
                'As stat, but describes a symbolic link itself rather than what it names. Returns 0, or -1 with errno set.',
                { syscall: 'lstat' }
            )
        ]
    },
    {
        path: 'dirent.h',
        nasmSummary:
            'struct dirent, one entry of what the getdents64 system call reads from a directory, and the types of its d_type.',
        summary:
            "opendir, readdir and closedir, which list a directory: a program finds the input devices by reading /dev/input. readdir gives one struct dirent at a time, the entry's name in d_name and, in d_type, whether it is a device (DT_CHR), a directory (DT_DIR) or a file (DT_REG). They are header-only like the rest, over the getdents64 system call: opendir maps 32 KiB of memory for the DIR it returns, which closedir gives back.",
        includes: ['sys/types.h', 'bits/syscall.h'],
        items: [
            struct('dirent', 'One entry of a directory, as readdir gives it.', [
                field('ino_t', 'd_ino', "The entry's file number"),
                field('off_t', 'd_off'),
                field(
                    'unsigned short',
                    'd_reclen',
                    "The entry's own size in the directory's buffer"
                ),
                field('unsigned char', 'd_type', 'What it is: DT_CHR, DT_DIR, DT_REG, ...'),
                field('char', 'd_name', 'Its name, ending with a NUL', { count: 256 })
            ]),
            note('d_type: what an entry is.'),
            ...defines([
                ['DT_UNKNOWN', 0],
                ['DT_FIFO', 1],
                ['DT_CHR', 2, 'A character device, such as /dev/fb0 or an input device'],
                ['DT_DIR', 4, 'A directory'],
                ['DT_BLK', 6],
                ['DT_REG', 8, 'A file'],
                ['DT_LNK', 10, 'A symbolic link, such as those under /dev/input/by-id'],
                ['DT_SOCK', 12]
            ]),
            {
                kind: 'code',
                doc: 'A directory being read, which opendir returns and the other functions take: its descriptor, and the entries the last getdents64 read. Use it only through the functions; as in the C library, its fields are not part of the interface.',
                c: [
                    'typedef struct __dirstream {',
                    '    int __fd;',
                    '    int __position;',
                    '    int __size;',
                    '    int __reserved;',
                    '    char __buffer[32768 - 16];',
                    '} DIR;'
                ]
            },
            posix(
                'opendir',
                'DIR *',
                ['const char *path'],
                'Opens a directory stream for path, such as "/dev/input", for use with readdir. Returns a DIR pointer, or NULL with errno set (ENOENT if the path does not exist, ENOTDIR if it is not a directory).',
                {
                    documentation: 'getdents64',
                    body: [
                        '/* O_RDONLY | O_NONBLOCK | O_DIRECTORY | O_CLOEXEC, as the C library opens it */',
                        'long fd = __aed_syscall(__NR_open, (long)path, 02204000, 0, 0, 0, 0);',
                        'long memory;',
                        'DIR *dir;',
                        'if (__aed_syscall_return(fd) < 0) return 0;',
                        '/* PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS */',
                        'memory = __aed_syscall(__NR_mmap, 0, sizeof(DIR), 3, 0x22, -1, 0);',
                        'if (__aed_syscall_return(memory) < 0) {',
                        '    __aed_syscall(__NR_close, fd, 0, 0, 0, 0, 0);',
                        '    return 0;',
                        '}',
                        'dir = (DIR *)memory;',
                        'dir->__fd = (int)fd;',
                        'dir->__position = 0;',
                        'dir->__size = 0;',
                        'return dir;'
                    ]
                }
            ),
            posix(
                'readdir',
                'struct dirent *',
                ['DIR *dir'],
                'Returns the next entry in dir, including "." and "..", in no guaranteed order. Returns NULL at end of directory without changing errno, or on error with errno set. To distinguish the two, set errno to 0 before the call and inspect it after a NULL result. The returned entry is valid until the next readdir or closedir on this stream.',
                {
                    documentation: 'getdents64',
                    body: [
                        'struct dirent *entry;',
                        'if (dir->__position >= dir->__size) {',
                        '    long size = __aed_syscall(__NR_getdents64, dir->__fd, (long)dir->__buffer, sizeof dir->__buffer, 0, 0, 0);',
                        '    if (size <= 0) {',
                        '        __aed_syscall_return(size);',
                        '        return 0;',
                        '    }',
                        '    dir->__size = (int)size;',
                        '    dir->__position = 0;',
                        '}',
                        'entry = (struct dirent *)(void *)(dir->__buffer + dir->__position);',
                        'dir->__position += entry->d_reclen;',
                        'return entry;'
                    ]
                }
            ),
            posix(
                'rewinddir',
                'void',
                ['DIR *dir'],
                'Resets dir to the beginning so the next readdir returns its first entry again.',
                {
                    documentation: 'lseek',
                    body: [
                        '__aed_syscall(__NR_lseek, dir->__fd, 0, 0 /* SEEK_SET */, 0, 0, 0);',
                        'dir->__position = 0;',
                        'dir->__size = 0;'
                    ]
                }
            ),
            posix(
                'dirfd',
                'int',
                ['DIR *dir'],
                'Returns the file descriptor used by dir, for calls such as fstat or openat. closedir closes that descriptor.',
                { documentation: 'getdents64', body: ['return dir->__fd;'] }
            ),
            posix(
                'closedir',
                'int',
                ['DIR *dir'],
                'Closes the directory stream and frees its memory. The DIR pointer and entries returned by readdir are no longer valid. Returns 0, or -1 with errno set.',
                {
                    documentation: 'close',
                    body: [
                        'long fd = dir->__fd;',
                        '__aed_syscall(__NR_munmap, (long)dir, sizeof(DIR), 0, 0, 0, 0);',
                        'return (int)__aed_syscall_return(__aed_syscall(__NR_close, fd, 0, 0, 0, 0, 0));'
                    ]
                }
            )
        ]
    },
    {
        path: 'signal.h',
        nasmSummary:
            "the signals' numbers, rt_sigaction's flags and struct kernel_sigaction, what the rt_sigaction system call takes: a handler needs SA_RESTORER and an sa_restorer that makes rt_sigreturn (mov eax, 15 then syscall), which the handler's ret returns to.",
        summary:
            'signals. Ctrl+C in the Terminal sends SIGINT, which ends the program unless it handles it: signal(SIGINT, handler) or sigaction runs handler instead, and kill and raise send a signal. As in the C library, sigaction gives the kernel a restorer, the code a handler returns to, which makes the rt_sigreturn system call.',
        includes: ['sys/types.h', 'bits/syscall.h'],
        items: [
            note('The signals. Those with a comment are the ones a program here meets.'),
            ...defines([
                ['SIGHUP', 1],
                ['SIGINT', 2, 'Ctrl+C in the Terminal'],
                ['SIGQUIT', 3, 'Ctrl+\\ in the Terminal'],
                ['SIGILL', 4, 'An instruction the processor does not have'],
                ['SIGTRAP', 5],
                ['SIGABRT', 6, 'abort()'],
                ['SIGIOT', 6],
                ['SIGBUS', 7],
                ['SIGFPE', 8, 'A division by zero'],
                ['SIGKILL', 9, 'Ends the program; it cannot be handled'],
                ['SIGUSR1', 10, "The program's own"],
                ['SIGSEGV', 11, 'Memory the program may not touch'],
                ['SIGUSR2', 12, "The program's own"],
                ['SIGPIPE', 13],
                ['SIGALRM', 14, "alarm's and setitimer's timer"],
                ['SIGTERM', 15],
                ['SIGSTKFLT', 16],
                ['SIGCHLD', 17],
                ['SIGCONT', 18],
                ['SIGSTOP', 19],
                ['SIGTSTP', 20],
                ['SIGTTIN', 21],
                ['SIGTTOU', 22],
                ['SIGURG', 23],
                ['SIGXCPU', 24],
                ['SIGXFSZ', 25],
                ['SIGVTALRM', 26],
                ['SIGPROF', 27],
                ['SIGWINCH', 28],
                ['SIGIO', 29],
                ['SIGPOLL', 29],
                ['SIGPWR', 30],
                ['SIGSYS', 31]
            ]),
            define('NSIG', 65, 'One more than the highest signal number'),
            typedef('sig_atomic_t', 'int', 'An integer a handler can set and the program read'),
            typedef(
                'sighandler_t',
                'void *',
                "A handler: a function that takes the signal's number",
                {
                    c: 'typedef void (*sighandler_t)(int);'
                }
            ),
            define('SIG_DFL', 0, "The signal's default action: SIGINT ends the program", {
                c: '((sighandler_t)0)',
                probe: '(long long)(long)SIG_DFL'
            }),
            define('SIG_IGN', 1, 'Ignore the signal', {
                c: '((sighandler_t)1)',
                probe: '(long long)(long)SIG_IGN'
            }),
            define('SIG_ERR', -1, 'What signal returns when it fails', {
                c: '((sighandler_t)-1)',
                probe: '(long long)(long)SIG_ERR'
            }),
            note("sigprocmask's how."),
            define('SIG_BLOCK', 0, 'Block the signals of the set too'),
            define('SIG_UNBLOCK', 1, 'Stop blocking them'),
            define('SIG_SETMASK', 2, 'Block exactly them'),
            note('sa_flags: how a handler runs.'),
            ...defines(
                [
                    ['SA_NOCLDSTOP', 0x00000001],
                    ['SA_NOCLDWAIT', 0x00000002],
                    [
                        'SA_SIGINFO',
                        0x00000004,
                        'The handler is sa_sigaction, which also gets a siginfo_t'
                    ],
                    ['SA_ONSTACK', 0x08000000],
                    [
                        'SA_RESTART',
                        0x10000000,
                        'A read or wait the signal interrupts starts over instead of failing with EINTR'
                    ],
                    ['SA_NODEFER', 0x40000000, 'Do not block the signal while its handler runs'],
                    ['SA_RESETHAND', 0x80000000, 'Handle the signal once, then go back to SIG_DFL']
                ],
                16
            ),
            define(
                'SA_RESTORER',
                0x04000000,
                "The kernel's, not in the C library's header: sa_restorer holds what a handler returns to. rt_sigaction refuses a handler without it, and sigaction sets it for you",
                { radix: 16, linux: false }
            ),
            struct(
                null,
                'A set of signals, one bit each: signal n is bit (n - 1) % 64 of __val[(n - 1) / 64]. Change it with sigemptyset, sigaddset and the rest.',
                [field('unsigned long', '__val', undefined, { count: 16 })],
                { typedef: 'sigset_t', nasm: false }
            ),
            struct(
                'sigval',
                'A value sent along with a signal.',
                [field('int', 'sival_int'), field('void *', 'sival_ptr')],
                { union: true }
            ),
            struct(
                '__aed_siginfo_kill',
                undefined,
                [field('pid_t', 'si_pid'), field('uid_t', 'si_uid')],
                { linux: false, nasm: false, offsets: false }
            ),
            struct(
                '__aed_siginfo_rt',
                undefined,
                [
                    field('pid_t', 'si_pid'),
                    field('uid_t', 'si_uid'),
                    field('union sigval', 'si_sigval')
                ],
                { linux: false, nasm: false, offsets: false }
            ),
            struct('__aed_siginfo_fault', undefined, [field('void *', 'si_addr')], {
                linux: false,
                nasm: false,
                offsets: false
            }),
            struct(
                '__aed_siginfo_fields',
                undefined,
                [
                    field('int', '_pad', undefined, { count: 28 }),
                    field('struct __aed_siginfo_kill', '_kill'),
                    field('struct __aed_siginfo_rt', '_rt'),
                    field('struct __aed_siginfo_fault', '_sigfault')
                ],
                { union: true, linux: false }
            ),
            struct(
                null,
                'What a handler with SA_SIGINFO gets about the signal: its number, why it came (si_code) and from whom, si_pid, or for SIGSEGV the address, si_addr.',
                [
                    field('int', 'si_signo', "The signal's number"),
                    field('int', 'si_errno'),
                    field('int', 'si_code', 'Why it came'),
                    field('int', '__pad0'),
                    field('union __aed_siginfo_fields', '_sifields', 'The rest, by si_code')
                ],
                { typedef: 'siginfo_t' }
            ),
            macro('si_pid', [], '_sifields._kill.si_pid', 'Who sent it, for kill and raise'),
            macro('si_uid', [], '_sifields._kill.si_uid'),
            macro('si_value', [], '_sifields._rt.si_sigval'),
            macro('si_int', [], '_sifields._rt.si_sigval.sival_int'),
            macro('si_ptr', [], '_sifields._rt.si_sigval.sival_ptr'),
            macro('si_addr', [], '_sifields._sigfault.si_addr', 'For SIGSEGV, the address touched'),
            check('offsetof(siginfo_t, si_pid)', 16),
            check('offsetof(siginfo_t, si_uid)', 20),
            check('offsetof(siginfo_t, si_value)', 24),
            check('offsetof(siginfo_t, si_int)', 24),
            check('offsetof(siginfo_t, si_ptr)', 24),
            check('offsetof(siginfo_t, si_addr)', 16),
            struct(
                '__aed_sigaction_handler',
                undefined,
                [
                    field('sighandler_t', 'sa_handler'),
                    field('void *', 'sa_sigaction', undefined, {
                        decl: 'void (*sa_sigaction)(int, siginfo_t *, void *)'
                    })
                ],
                { union: true, linux: false, offsets: false }
            ),
            struct(
                'sigaction',
                "What sigaction takes and gives back: the handler, the signals blocked while it runs, and how it runs. The C library's layout; sigaction makes the kernel's from it.",
                [
                    field(
                        'union __aed_sigaction_handler',
                        '__sigaction_handler',
                        'sa_handler, or sa_sigaction'
                    ),
                    field(
                        'sigset_t',
                        'sa_mask',
                        'The signals blocked while the handler runs, besides its own'
                    ),
                    field('int', 'sa_flags', 'SA_RESTART, SA_SIGINFO, ...'),
                    field('void *', 'sa_restorer', 'Set by sigaction', {
                        decl: 'void (*sa_restorer)(void)'
                    })
                ],
                { nasm: false }
            ),
            macro(
                'sa_handler',
                [],
                '__sigaction_handler.sa_handler',
                "The handler, which takes the signal's number"
            ),
            macro(
                'sa_sigaction',
                [],
                '__sigaction_handler.sa_sigaction',
                'With SA_SIGINFO, the handler that also gets a siginfo_t and the context'
            ),
            check('offsetof(struct sigaction, sa_handler)', 0),
            check('offsetof(struct sigaction, sa_sigaction)', 0),
            struct(
                'kernel_sigaction',
                "What the rt_sigaction system call takes, which sigaction makes from a struct sigaction. In assembly: k_sa_handler the handler, sa_flags with SA_RESTORER, sa_restorer the code the handler returns to, and 8, the size of sa_mask, as rt_sigaction's fourth argument.",
                [
                    field('void *', 'k_sa_handler', 'The handler, or SIG_DFL or SIG_IGN'),
                    field('unsigned long', 'sa_flags', 'SA_RESTORER and the others'),
                    field('void *', 'sa_restorer', 'Code that makes rt_sigreturn'),
                    field('unsigned long', 'sa_mask', 'The signals blocked while the handler runs')
                ],
                { linux: false }
            ),
            {
                kind: 'code',
                doc: "What a handler returns to: the rt_sigreturn system call, which puts back what the program was doing when the signal came. sigaction registers it, as the C library registers its own. It has no prologue, since it runs on the signal's frame.",
                c: [
                    '#pragma GCC diagnostic push',
                    '#pragma GCC diagnostic ignored "-Wattributes"',
                    '__attribute__((naked)) static inline void __aed_restore_rt(void) {',
                    '    __asm__("mov eax, 15\\n\\tsyscall"); /* rt_sigreturn */',
                    '}',
                    '#pragma GCC diagnostic pop'
                ]
            },
            posix('sigemptyset', 'int', ['sigset_t *set'], 'Empties *set. Returns 0.', {
                documentation: 'rt_sigprocmask',
                body: [
                    'unsigned __i;',
                    'if (!set) return (int)__aed_syscall_return(-22); /* EINVAL */',
                    'for (__i = 0; __i < 16; __i++) set->__val[__i] = 0;',
                    'return 0;'
                ]
            }),
            posix(
                'sigfillset',
                'int',
                ['sigset_t *set'],
                'Fills *set with every signal except 32 and 33, which are reserved by the C library. Returns 0.',
                {
                    documentation: 'rt_sigprocmask',
                    body: [
                        'unsigned __i;',
                        'if (!set) return (int)__aed_syscall_return(-22); /* EINVAL */',
                        'for (__i = 0; __i < 16; __i++) set->__val[__i] = ~0UL;',
                        'set->__val[0] &= ~(3UL << 31);',
                        'return 0;'
                    ]
                }
            ),
            posix(
                'sigaddset',
                'int',
                ['sigset_t *set', 'int sig'],
                'Adds sig to *set. Returns 0, or -1 with errno set to EINVAL for an invalid signal number.',
                {
                    documentation: 'rt_sigprocmask',
                    body: [
                        'if (!set || sig <= 0 || sig >= NSIG || sig == 32 || sig == 33)',
                        '    return (int)__aed_syscall_return(-22); /* EINVAL */',
                        'set->__val[(sig - 1) / 64] |= 1UL << ((sig - 1) % 64);',
                        'return 0;'
                    ]
                }
            ),
            posix(
                'sigdelset',
                'int',
                ['sigset_t *set', 'int sig'],
                'Removes sig from *set. Returns 0, or -1 with errno set to EINVAL for an invalid signal number.',
                {
                    documentation: 'rt_sigprocmask',
                    body: [
                        'if (!set || sig <= 0 || sig >= NSIG || sig == 32 || sig == 33)',
                        '    return (int)__aed_syscall_return(-22); /* EINVAL */',
                        'set->__val[(sig - 1) / 64] &= ~(1UL << ((sig - 1) % 64));',
                        'return 0;'
                    ]
                }
            ),
            posix(
                'sigismember',
                'int',
                ['const sigset_t *set', 'int sig'],
                'Returns 1 if sig belongs to *set, or 0 otherwise. Returns -1 with errno set to EINVAL for an invalid signal number.',
                {
                    documentation: 'rt_sigprocmask',
                    body: [
                        'if (!set || sig <= 0 || sig >= NSIG)',
                        '    return (int)__aed_syscall_return(-22); /* EINVAL */',
                        'return (int)((set->__val[(sig - 1) / 64] >> ((sig - 1) % 64)) & 1);'
                    ]
                }
            ),
            posix(
                'sigprocmask',
                'int',
                ['int how', 'const sigset_t *set', 'sigset_t *old'],
                'Changes the blocked signal set: SIG_BLOCK adds *set, SIG_UNBLOCK removes *set, and SIG_SETMASK replaces the blocked set with *set. A NULL set leaves it unchanged. If old is not NULL, stores the previous blocked set in *old. A blocked signal remains pending until unblocked. Returns 0, or -1 with errno set.',
                {
                    syscall: 'rt_sigprocmask',
                    //the C library keeps 32 and 33 for itself, out of any set it is given
                    before: ['unsigned long mask = set ? set->__val[0] & ~(3UL << 31) : 0;'],
                    args: ['how', 'set ? (long)&mask : 0', '(long)old', '8']
                }
            ),
            posix(
                'sigaction',
                'int',
                ['int sig', 'const struct sigaction *action', 'struct sigaction *old'],
                'Installs *action for sig; a NULL action leaves it unchanged. If old is not NULL, stores the previous action in *old. For example: struct sigaction action = { 0 }; action.sa_handler = handler; sigaction(SIGINT, &action, NULL). Returns 0, or -1 with errno set. SIGKILL and SIGSTOP cannot have their actions changed (EINVAL).',
                {
                    syscall: 'rt_sigaction',
                    before: [
                        'struct kernel_sigaction set, was;',
                        'if (sig <= 0 || sig >= NSIG || sig == 32 || sig == 33)',
                        '    return (int)__aed_syscall_return(-22); /* EINVAL */',
                        'if (action) {',
                        '    set.k_sa_handler = (void *)action->sa_handler;',
                        '    set.sa_flags = action->sa_flags | SA_RESTORER;',
                        '    set.sa_restorer = (void *)__aed_restore_rt;',
                        '    set.sa_mask = action->sa_mask.__val[0];',
                        '}'
                    ],
                    args: ['sig', 'action ? (long)&set : 0', 'old ? (long)&was : 0', '8'],
                    after: [
                        'if (rax == 0 && old) {',
                        '    old->sa_handler = (sighandler_t)was.k_sa_handler;',
                        '    old->sa_mask.__val[0] = was.sa_mask;',
                        '    old->sa_flags = (int)was.sa_flags;',
                        '    old->sa_restorer = (void (*)(void))was.sa_restorer;',
                        '}'
                    ]
                }
            ),
            posix(
                'signal',
                'sighandler_t',
                ['int sig', 'sighandler_t handler'],
                'Installs handler for sig. Pass a function taking the signal number, SIG_DFL to restore the default action, or SIG_IGN to ignore the signal. For example: signal(SIGINT, on_ctrl_c). Uses SA_RESTART so eligible interrupted calls restart automatically; see the syscall reference for restart rules. Returns the previous handler or action, or SIG_ERR with errno set.',
                {
                    documentation: 'rt_sigaction',
                    body: [
                        'struct sigaction action, old;',
                        'if (handler == SIG_ERR || sig < 1 || sig >= NSIG) {',
                        '    __aed_syscall_return(-22); /* EINVAL */',
                        '    return SIG_ERR;',
                        '}',
                        'action.sa_handler = handler;',
                        'sigemptyset(&action.sa_mask);',
                        'action.sa_mask.__val[0] = 1UL << (sig - 1);',
                        'action.sa_flags = SA_RESTART;',
                        'action.sa_restorer = 0;',
                        'if (sigaction(sig, &action, &old) < 0) return SIG_ERR;',
                        'return old.sa_handler;'
                    ]
                }
            ),
            posix(
                'kill',
                'int',
                ['pid_t pid', 'int sig'],
                'Sends sig to process pid. Use getpid() from <unistd.h> to identify this program. Returns 0, or -1 with errno set (ESRCH if no such process exists).',
                { syscall: 'kill' }
            ),
            posix(
                'raise',
                'int',
                ['int sig'],
                'Sends sig to this program. An unblocked signal with a handler runs that handler before raise returns. A blocked signal remains pending until unblocked. SIG_IGN discards the signal; SIG_DFL applies its default action, which may end the program. Returns 0, or -1 with errno set.',
                {
                    documentation: 'tgkill',
                    body: [
                        'long pid = __aed_syscall(__NR_getpid, 0, 0, 0, 0, 0, 0);',
                        'long tid = __aed_syscall(__NR_gettid, 0, 0, 0, 0, 0, 0);',
                        'return (int)__aed_syscall_return(__aed_syscall(__NR_tgkill, pid, tid, sig, 0, 0, 0));'
                    ]
                }
            )
        ]
    },
    {
        path: 'linux/fb.h',
        summary:
            'the framebuffer, /dev/fb0: the Screen as memory. FBIOGET_VSCREENINFO and FBIOGET_FSCREENINFO say how big it is and how a pixel is laid out (32 bits, 0x00RRGGBB), mmap maps its memory, and FBIOPAN_DISPLAY shows the other page of a double-buffered program. As on Linux, ioctl itself comes from <sys/ioctl.h>.',
        includes: ['linux/types.h'],
        items: [
            define('FB_MAX', 32, 'How many framebuffers Linux numbers'),
            note('The requests.'),
            define(
                'FBIOGET_VSCREENINFO',
                0x4600,
                'Read the current dimensions, pan offsets and pixel layout into struct fb_var_screeninfo',
                {
                    radix: 16
                }
            ),
            define(
                'FBIOPUT_VSCREENINFO',
                0x4601,
                'Apply reported dimensions and pan offsets; the configured Screen size and allocation remain fixed',
                {
                    radix: 16
                }
            ),
            define(
                'FBIOGET_FSCREENINFO',
                0x4602,
                'Read the framebuffer allocation and row stride into struct fb_fix_screeninfo',
                {
                    radix: 16
                }
            ),
            define(
                'FBIOPAN_DISPLAY',
                0x4606,
                'Display the page at fb_var_screeninfo.yoffset at the next vertical blank',
                {
                    radix: 16
                }
            ),
            define(
                'FBIOBLANK',
                0x4611,
                'Blank the Screen or show it again: the argument is an FB_BLANK_*',
                {
                    radix: 16
                }
            ),
            ioctl(
                'FBIO_WAITFORVSYNC',
                'W',
                "'F'",
                0x20,
                '__u32',
                'Wait for the next vertical blank; the display refreshes at 60 Hz'
            ),
            note(
                "FBIOBLANK's argument, a number rather than a pointer: every level but FB_BLANK_UNBLANK leaves the Screen black."
            ),
            ...defines([
                ['FB_BLANK_UNBLANK', 0, 'Show the Screen'],
                ['FB_BLANK_NORMAL', 1, 'Blank it'],
                ['FB_BLANK_VSYNC_SUSPEND', 2],
                ['FB_BLANK_HSYNC_SUSPEND', 3],
                ['FB_BLANK_POWERDOWN', 4, 'Blank it, the display powered down']
            ]),
            note("fb_fix_screeninfo's type and visual."),
            ...defines([
                ['FB_TYPE_PACKED_PIXELS', 0, "Each pixel's bits together, pixel after pixel"],
                ['FB_TYPE_PLANES', 1],
                ['FB_TYPE_INTERLEAVED_PLANES', 2],
                ['FB_TYPE_TEXT', 3],
                ['FB_TYPE_VGA_PLANES', 4],
                ['FB_TYPE_FOURCC', 5],
                ['FB_VISUAL_MONO01', 0],
                ['FB_VISUAL_MONO10', 1],
                ['FB_VISUAL_TRUECOLOR', 2, 'Each pixel holds its color, as the bitfields say'],
                ['FB_VISUAL_PSEUDOCOLOR', 3],
                ['FB_VISUAL_DIRECTCOLOR', 4],
                ['FB_VISUAL_STATIC_PSEUDOCOLOR', 5],
                ['FB_VISUAL_FOURCC', 6],
                ['FB_ACCEL_NONE', 0, 'No drawing hardware']
            ]),
            struct(
                'fb_fix_screeninfo',
                'What FBIOGET_FSCREENINFO reads: what the device is and how its memory is laid out, which a program cannot change.',
                [
                    field('char', 'id', 'The driver\'s name: "bochs-drmdrmfb" here', { count: 16 }),
                    field('unsigned long', 'smem_start', "The memory's physical address"),
                    field(
                        '__u32',
                        'smem_len',
                        "The memory's size in bytes, every page: what to mmap"
                    ),
                    field('__u32', 'type', 'FB_TYPE_PACKED_PIXELS'),
                    field('__u32', 'type_aux'),
                    field('__u32', 'visual', 'FB_VISUAL_TRUECOLOR'),
                    field('__u16', 'xpanstep', 'Steps panning can take, 0 if it cannot'),
                    field('__u16', 'ypanstep'),
                    field('__u16', 'ywrapstep'),
                    field(
                        '__u32',
                        'line_length',
                        'Bytes from one line to the next, which can be more than xres times 4'
                    ),
                    field('unsigned long', 'mmio_start'),
                    field('__u32', 'mmio_len'),
                    field('__u32', 'accel'),
                    field('__u16', 'capabilities'),
                    field('__u16', 'reserved', undefined, { count: 2 })
                ]
            ),
            struct(
                'fb_bitfield',
                'Where one color component is in a pixel: offset bits from the right, length bits long. XRGB8888 has red at 16, green at 8 and blue at 0, each 8 long.',
                [
                    field('__u32', 'offset'),
                    field('__u32', 'length'),
                    field('__u32', 'msb_right', '0: the most significant bit is on the left')
                ]
            ),
            note("fb_var_screeninfo's activate: when FBIOPUT_VSCREENINFO applies the change."),
            ...defines([
                ['FB_ACTIVATE_NOW', 0, 'At once'],
                ['FB_ACTIVATE_NXTOPEN', 1],
                ['FB_ACTIVATE_TEST', 2, 'Only check it'],
                ['FB_ACTIVATE_MASK', 15],
                ['FB_ACTIVATE_VBL', 16, 'At the next vertical blank'],
                ['FB_ACTIVATE_ALL', 64],
                ['FB_ACTIVATE_FORCE', 128],
                ['FB_ACTIVATE_INV_MODE', 256]
            ]),
            note("fb_var_screeninfo's vmode and rotate."),
            ...defines([
                ['FB_VMODE_NONINTERLACED', 0],
                ['FB_VMODE_INTERLACED', 1],
                ['FB_VMODE_DOUBLE', 2],
                ['FB_VMODE_ODD_FLD_FIRST', 4],
                ['FB_VMODE_MASK', 255],
                ['FB_VMODE_YWRAP', 256, 'Panning wraps around instead of stopping'],
                ['FB_VMODE_SMOOTH_XPAN', 512],
                ['FB_VMODE_CONUPDATE', 512],
                ['FB_ROTATE_UR', 0],
                ['FB_ROTATE_CW', 1],
                ['FB_ROTATE_UD', 2],
                ['FB_ROTATE_CCW', 3]
            ]),
            struct(
                'fb_var_screeninfo',
                "What FBIOGET_VSCREENINFO reads and FBIOPUT_VSCREENINFO asks for: the visible size, the size of the memory behind it, which part of it is shown, and how a pixel's bits are laid out.",
                [
                    field(
                        '__u32',
                        'xres',
                        'Reported width in pixels; initially the configured Screen width'
                    ),
                    field(
                        '__u32',
                        'yres',
                        'Reported height in pixels; initially the configured Screen height'
                    ),
                    field('__u32', 'xres_virtual', 'The width of the memory, in pixels'),
                    field(
                        '__u32',
                        'yres_virtual',
                        'Allocated height: twice the configured Screen height'
                    ),
                    field('__u32', 'xoffset', 'The first visible column'),
                    field(
                        '__u32',
                        'yoffset',
                        'First displayed row: 0 for the first page, the configured Screen height for the second'
                    ),
                    field('__u32', 'bits_per_pixel', '32 here'),
                    field('__u32', 'grayscale'),
                    field('struct fb_bitfield', 'red', 'Where each component is in a pixel'),
                    field('struct fb_bitfield', 'green'),
                    field('struct fb_bitfield', 'blue'),
                    field('struct fb_bitfield', 'transp'),
                    field('__u32', 'nonstd'),
                    field('__u32', 'activate', 'FB_ACTIVATE_*'),
                    field('__u32', 'height', "The picture's height in millimetres, or -1"),
                    field('__u32', 'width'),
                    field('__u32', 'accel_flags'),
                    field(
                        '__u32',
                        'pixclock',
                        'The video timing, which this display does not have'
                    ),
                    field('__u32', 'left_margin'),
                    field('__u32', 'right_margin'),
                    field('__u32', 'upper_margin'),
                    field('__u32', 'lower_margin'),
                    field('__u32', 'hsync_len'),
                    field('__u32', 'vsync_len'),
                    field('__u32', 'sync'),
                    field('__u32', 'vmode', 'FB_VMODE_*'),
                    field('__u32', 'rotate', 'FB_ROTATE_*'),
                    field('__u32', 'colorspace'),
                    field('__u32', 'reserved', undefined, { count: 4 })
                ]
            )
        ]
    },
    {
        path: 'linux/input-event-codes.h',
        summary:
            'the numbers in an input event: its type (EV_KEY, EV_ABS, ...) and its code (KEY_A, BTN_LEFT, ABS_X, ...). Keys are physical keys, whatever the keyboard layout: KEY_Q is the key left of W, which an AZERTY keyboard labels A.',
        items: [
            note('Properties of a device, which EVIOCGPROP reads as bits.'),
            ...defines(
                [
                    ['INPUT_PROP_POINTER', 0x00],
                    ['INPUT_PROP_DIRECT', 0x01],
                    ['INPUT_PROP_BUTTONPAD', 0x02],
                    ['INPUT_PROP_SEMI_MT', 0x03],
                    ['INPUT_PROP_TOPBUTTONPAD', 0x04],
                    ['INPUT_PROP_POINTING_STICK', 0x05],
                    ['INPUT_PROP_ACCELEROMETER', 0x06],
                    ['INPUT_PROP_MAX', 0x1f]
                ],
                16
            ),
            define('INPUT_PROP_CNT', 'INPUT_PROP_MAX + 1'),
            note("Event types: struct input_event's type."),
            ...defines(
                [
                    [
                        'EV_SYN',
                        0x00,
                        'The end of a report, SYN_REPORT, or lost events, SYN_DROPPED'
                    ],
                    ['EV_KEY', 0x01, 'A key or button: value 1 down, 0 up, 2 a repeat'],
                    ['EV_REL', 0x02, 'A relative movement, such as a wheel notch'],
                    ['EV_ABS', 0x03, "An absolute position, such as the tablet's"],
                    ['EV_MSC', 0x04, 'Anything else, such as the scan code before a key'],
                    ['EV_SW', 0x05],
                    ['EV_LED', 0x11, 'A keyboard light'],
                    ['EV_SND', 0x12, 'A sound, written to the PC speaker'],
                    ['EV_REP', 0x14],
                    ['EV_FF', 0x15],
                    ['EV_PWR', 0x16],
                    ['EV_FF_STATUS', 0x17],
                    ['EV_MAX', 0x1f]
                ],
                16
            ),
            define('EV_CNT', 'EV_MAX + 1'),
            note("EV_SYN's codes."),
            ...defines([
                ['SYN_REPORT', 0, 'The events since the last one belong together'],
                ['SYN_CONFIG', 1],
                ['SYN_MT_REPORT', 2],
                ['SYN_DROPPED', 3, 'The queue overflowed: events were lost'],
                ['SYN_MAX', 0xf]
            ]),
            define('SYN_CNT', 'SYN_MAX + 1'),
            note("EV_KEY's codes for keys."),
            ...keyCodes.map(([name, value]) => define(name, value)),
            note(
                "EV_KEY's codes for buttons. The tablet has BTN_LEFT, BTN_RIGHT, BTN_MIDDLE, BTN_SIDE and BTN_EXTRA, the browser's back and forward buttons."
            ),
            ...defines(
                [
                    ['BTN_MISC', 0x100],
                    ['BTN_0', 0x100],
                    ['BTN_1', 0x101],
                    ['BTN_2', 0x102],
                    ['BTN_3', 0x103],
                    ['BTN_4', 0x104],
                    ['BTN_5', 0x105],
                    ['BTN_6', 0x106],
                    ['BTN_7', 0x107],
                    ['BTN_8', 0x108],
                    ['BTN_9', 0x109],
                    ['BTN_MOUSE', 0x110],
                    ['BTN_LEFT', 0x110],
                    ['BTN_RIGHT', 0x111],
                    ['BTN_MIDDLE', 0x112],
                    ['BTN_SIDE', 0x113],
                    ['BTN_EXTRA', 0x114],
                    ['BTN_FORWARD', 0x115],
                    ['BTN_BACK', 0x116],
                    ['BTN_TASK', 0x117],
                    ['BTN_DIGI', 0x140],
                    ['BTN_TOOL_PEN', 0x140],
                    ['BTN_TOOL_RUBBER', 0x141],
                    ['BTN_TOOL_BRUSH', 0x142],
                    ['BTN_TOOL_PENCIL', 0x143],
                    ['BTN_TOOL_AIRBRUSH', 0x144],
                    ['BTN_TOOL_FINGER', 0x145],
                    ['BTN_TOOL_MOUSE', 0x146],
                    ['BTN_TOOL_LENS', 0x147],
                    ['BTN_TOOL_QUINTTAP', 0x148],
                    ['BTN_STYLUS3', 0x149],
                    ['BTN_TOUCH', 0x14a],
                    ['BTN_STYLUS', 0x14b],
                    ['BTN_STYLUS2', 0x14c],
                    ['BTN_TOOL_DOUBLETAP', 0x14d],
                    ['BTN_TOOL_TRIPLETAP', 0x14e],
                    ['BTN_TOOL_QUADTAP', 0x14f],
                    ['KEY_MAX', 0x2ff, 'The highest key or button code']
                ],
                16
            ),
            define(
                'KEY_CNT',
                'KEY_MAX + 1',
                'How many bits EVIOCGKEY and EVIOCGBIT(EV_KEY, ...) need'
            ),
            note(
                "EV_REL's codes. The wheel reports REL_WHEEL, 1 a notch, beside REL_WHEEL_HI_RES, 120 a notch."
            ),
            ...defines(
                [
                    ['REL_X', 0x00],
                    ['REL_Y', 0x01],
                    ['REL_Z', 0x02],
                    ['REL_RX', 0x03],
                    ['REL_RY', 0x04],
                    ['REL_RZ', 0x05],
                    ['REL_HWHEEL', 0x06],
                    ['REL_DIAL', 0x07],
                    ['REL_WHEEL', 0x08],
                    ['REL_MISC', 0x09],
                    ['REL_RESERVED', 0x0a],
                    ['REL_WHEEL_HI_RES', 0x0b],
                    ['REL_HWHEEL_HI_RES', 0x0c],
                    ['REL_MAX', 0x0f]
                ],
                16
            ),
            define('REL_CNT', 'REL_MAX + 1'),
            note(
                "EV_ABS's codes. The tablet reports ABS_X and ABS_Y from 0 to 32767 across the Screen, whatever its size: EVIOCGABS gives the range."
            ),
            ...defines(
                [
                    ['ABS_X', 0x00],
                    ['ABS_Y', 0x01],
                    ['ABS_Z', 0x02],
                    ['ABS_RX', 0x03],
                    ['ABS_RY', 0x04],
                    ['ABS_RZ', 0x05],
                    ['ABS_THROTTLE', 0x06],
                    ['ABS_RUDDER', 0x07],
                    ['ABS_WHEEL', 0x08],
                    ['ABS_GAS', 0x09],
                    ['ABS_BRAKE', 0x0a],
                    ['ABS_HAT0X', 0x10],
                    ['ABS_HAT0Y', 0x11],
                    ['ABS_HAT1X', 0x12],
                    ['ABS_HAT1Y', 0x13],
                    ['ABS_HAT2X', 0x14],
                    ['ABS_HAT2Y', 0x15],
                    ['ABS_HAT3X', 0x16],
                    ['ABS_HAT3Y', 0x17],
                    ['ABS_PRESSURE', 0x18],
                    ['ABS_DISTANCE', 0x19],
                    ['ABS_TILT_X', 0x1a],
                    ['ABS_TILT_Y', 0x1b],
                    ['ABS_TOOL_WIDTH', 0x1c],
                    ['ABS_VOLUME', 0x20],
                    ['ABS_PROFILE', 0x21],
                    ['ABS_MISC', 0x28],
                    ['ABS_MAX', 0x3f]
                ],
                16
            ),
            define('ABS_CNT', 'ABS_MAX + 1'),
            note(
                "EV_MSC's codes. A key or button event comes after its MSC_SCAN, the key's scan code."
            ),
            ...defines(
                [
                    ['MSC_SERIAL', 0x00],
                    ['MSC_PULSELED', 0x01],
                    ['MSC_GESTURE', 0x02],
                    ['MSC_RAW', 0x03],
                    ['MSC_SCAN', 0x04],
                    ['MSC_TIMESTAMP', 0x05],
                    ['MSC_MAX', 0x07]
                ],
                16
            ),
            define('MSC_CNT', 'MSC_MAX + 1'),
            note("EV_LED's codes: the keyboard's lights, which the lock keys toggle."),
            ...defines(
                [
                    ['LED_NUML', 0x00],
                    ['LED_CAPSL', 0x01],
                    ['LED_SCROLLL', 0x02],
                    ['LED_COMPOSE', 0x03],
                    ['LED_KANA', 0x04],
                    ['LED_SLEEP', 0x05],
                    ['LED_SUSPEND', 0x06],
                    ['LED_MUTE', 0x07],
                    ['LED_MISC', 0x08],
                    ['LED_MAIL', 0x09],
                    ['LED_CHARGING', 0x0a],
                    ['LED_MAX', 0x0f]
                ],
                16
            ),
            define('LED_CNT', 'LED_MAX + 1'),
            note("EV_REP's codes: the auto-repeat's delay and period, which EVIOCGREP reads."),
            ...defines(
                [
                    ['REP_DELAY', 0x00],
                    ['REP_PERIOD', 0x01],
                    ['REP_MAX', 0x01]
                ],
                16
            ),
            define('REP_CNT', 'REP_MAX + 1'),
            note(
                "EV_SND's codes, for the PC speaker: SND_TONE with a frequency in Hz starts a tone and 0 stops it; SND_BELL with any value but 0 sounds 1000 Hz."
            ),
            ...defines(
                [
                    ['SND_CLICK', 0x00],
                    ['SND_BELL', 0x01],
                    ['SND_TONE', 0x02],
                    ['SND_MAX', 0x07]
                ],
                16
            ),
            define('SND_CNT', 'SND_MAX + 1')
        ]
    },
    {
        path: 'linux/input.h',
        summary:
            'the input devices, /dev/input/event*: the keyboard, the tablet (the pointer) and the PC speaker. A read gives whole struct input_events, and the EVIOC* requests ask a device what it is and what it has.',
        includes: [
            'sys/time.h',
            'sys/ioctl.h',
            'sys/types.h',
            'linux/types.h',
            'linux/input-event-codes.h'
        ],
        items: [
            struct(
                'input_event',
                'One event, 24 bytes, as a read of an input device gives it: a key going down, a move along one axis, the end of a report. The events of one report end with an EV_SYN SYN_REPORT.',
                [
                    field(
                        'struct timeval',
                        'time',
                        'When it happened, CLOCK_REALTIME unless EVIOCSCLOCKID chose another clock'
                    ),
                    field('__u16', 'type', 'EV_KEY, EV_ABS, ...'),
                    field('__u16', 'code', 'KEY_A, ABS_X, ...'),
                    field(
                        '__s32',
                        'value',
                        'For a key 1 down, 0 up and 2 a repeat; for an axis the position'
                    )
                ]
            ),
            macro('input_event_sec', [], 'time.tv_sec', 'Its seconds: event.input_event_sec.'),
            macro('input_event_usec', [], 'time.tv_usec', 'Its microseconds.'),
            define('EV_VERSION', 0x010001, 'What EVIOCGVERSION answers', { radix: 16 }),
            struct(
                'input_id',
                'What EVIOCGID reads: who made the device and how it is connected.',
                [
                    field('__u16', 'bustype', 'BUS_USB, BUS_I8042, ...'),
                    field('__u16', 'vendor'),
                    field('__u16', 'product'),
                    field('__u16', 'version')
                ]
            ),
            struct(
                'input_absinfo',
                'The current value and range of an absolute axis, read by EVIOCGABS. For this tablet, clamp (value * xres + 32766) / 32767 to 0 through xres - 1 to obtain a horizontal pixel coordinate; minimum is 0 and maximum is 32767.',
                [
                    field('__s32', 'value', 'The position now'),
                    field('__s32', 'minimum', 'Lowest axis value: 0 for the Screen tablet'),
                    field('__s32', 'maximum', 'Highest axis value: 32767 for the Screen tablet'),
                    field('__s32', 'fuzz'),
                    field('__s32', 'flat'),
                    field('__s32', 'resolution')
                ]
            ),
            note(
                'The requests. The ones with a len read up to len bytes into a buffer and return how many they wrote; the bit sets have one bit per code, the lowest bit of the first byte for code 0.'
            ),
            ioctl(
                'EVIOCGVERSION',
                'R',
                "'E'",
                0x01,
                'int',
                'The evdev version, EV_VERSION, into an int'
            ),
            ioctl('EVIOCGID', 'R', "'E'", 0x02, 'struct input_id', "The device's identity"),
            ioctl(
                'EVIOCGREP',
                'R',
                "'E'",
                0x03,
                'unsigned int[2]',
                "The auto-repeat's delay and period in ms"
            ),
            ioctl(
                'EVIOCSREP',
                'W',
                "'E'",
                0x03,
                'unsigned int[2]',
                'Ask for another delay and period'
            ),
            ioctl('EVIOCGKEYCODE', 'R', "'E'", 0x04, 'unsigned int[2]'),
            ioctl('EVIOCSKEYCODE', 'W', "'E'", 0x04, 'unsigned int[2]'),
            macro(
                'EVIOCGNAME',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x06, len)",
                'Read the device name into a buffer of len bytes, such as "AT Translated Set 2 keyboard".',
                {
                    samples: [['256']]
                }
            ),
            macro(
                'EVIOCGPHYS',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x07, len)",
                'Where the device is connected, such as "isa0060/serio0/input0".',
                {
                    samples: [['64']]
                }
            ),
            macro(
                'EVIOCGUNIQ',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x08, len)",
                "The device's serial number, if it has one.",
                {
                    samples: [['64']]
                }
            ),
            macro(
                'EVIOCGPROP',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x09, len)",
                "The device's INPUT_PROP_* bits.",
                {
                    samples: [['4']]
                }
            ),
            macro(
                'EVIOCGKEY',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x18, len)",
                'Read held keys and buttons into a bit set of len bytes, one bit per code. Also discard queued EV_KEY events for this reader.',
                {
                    samples: [['96']]
                }
            ),
            macro(
                'EVIOCGLED',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x19, len)",
                'The lights lit now, one bit per LED_* code.',
                {
                    samples: [['2']]
                }
            ),
            macro(
                'EVIOCGSND',
                ['len'],
                "_IOC(_IOC_READ, 'E', 0x1a, len)",
                'The sounds playing now, one bit per SND_* code.',
                {
                    samples: [['1']]
                }
            ),
            macro('EVIOCGSW', ['len'], "_IOC(_IOC_READ, 'E', 0x1b, len)", undefined, {
                samples: [['1']]
            }),
            macro(
                'EVIOCGBIT',
                ['ev', 'len'],
                "_IOC(_IOC_READ, 'E', 0x20 + (ev), len)",
                'Read supported codes for event type ev into a bit set of len bytes. With ev equal to 0, read supported event types instead.',
                {
                    samples: [
                        ['0', '4'],
                        ['EV_KEY', '96'],
                        ['EV_ABS', '8']
                    ]
                }
            ),
            macro(
                'EVIOCGABS',
                ['abs'],
                "_IOR('E', 0x40 + (abs), struct input_absinfo)",
                'Read the current value and range for axis code abs, such as ABS_X, into struct input_absinfo. Queued events remain unchanged.',
                {
                    nasm: "_IOC(_IOC_READ, 'E', 0x40 + (abs), input_absinfo_size)",
                    samples: [['ABS_X'], ['ABS_Y']]
                }
            ),
            macro(
                'EVIOCSABS',
                ['abs'],
                "_IOW('E', 0xc0 + (abs), struct input_absinfo)",
                "Change the axis abs's struct input_absinfo.",
                {
                    nasm: "_IOC(_IOC_WRITE, 'E', 0xc0 + (abs), input_absinfo_size)",
                    samples: [['ABS_X']]
                }
            ),
            ioctl(
                'EVIOCGRAB',
                'W',
                "'E'",
                0x90,
                'int',
                'An immediate integer 1 gives this reader exclusive events; 0 releases the device'
            ),
            ioctl('EVIOCREVOKE', 'W', "'E'", 0x91, 'int'),
            ioctl(
                'EVIOCSCLOCKID',
                'W',
                "'E'",
                0xa0,
                'int',
                'The clock of the event times: CLOCK_REALTIME, CLOCK_MONOTONIC or CLOCK_BOOTTIME'
            ),
            note('Where each part of a struct input_id is in an array of four __u16.'),
            define('ID_BUS', 0),
            define('ID_VENDOR', 1),
            define('ID_PRODUCT', 2),
            define('ID_VERSION', 3),
            note(
                "input_id's bustype. The keyboard is on BUS_I8042, the tablet on BUS_USB, the PC speaker on BUS_ISA."
            ),
            ...defines(
                [
                    ['BUS_PCI', 0x01],
                    ['BUS_ISAPNP', 0x02],
                    ['BUS_USB', 0x03],
                    ['BUS_HIL', 0x04],
                    ['BUS_BLUETOOTH', 0x05],
                    ['BUS_VIRTUAL', 0x06],
                    ['BUS_ISA', 0x10],
                    ['BUS_I8042', 0x11],
                    ['BUS_XTKBD', 0x12],
                    ['BUS_RS232', 0x13],
                    ['BUS_GAMEPORT', 0x14],
                    ['BUS_PARPORT', 0x15],
                    ['BUS_AMIGA', 0x16],
                    ['BUS_ADB', 0x17],
                    ['BUS_I2C', 0x18],
                    ['BUS_HOST', 0x19],
                    ['BUS_GSC', 0x1a],
                    ['BUS_ATARI', 0x1b],
                    ['BUS_SPI', 0x1c],
                    ['BUS_RMI', 0x1d],
                    ['BUS_CEC', 0x1e],
                    ['BUS_INTEL_ISHTP', 0x1f],
                    ['BUS_AMD_SFH', 0x20]
                ],
                16
            )
        ]
    },
    {
        path: 'linux/soundcard.h',
        summary:
            "OSS, sampled sound through /dev/dsp and its volumes through /dev/mixer. A program sets the format, the channels and the rate, in that order, then writes samples: a write waits while the device's buffer is full, so the sound paces the program.",
        includes: ['linux/ioctl.h'],
        items: [
            define('SOUND_VERSION', 0x030802, 'The OSS version this header describes', {
                radix: 16
            }),
            note("OSS's names for the ioctl macros of <linux/ioctl.h>."),
            macro('_SIO', [], '_IO'),
            macro('_SIOR', [], '_IOR'),
            macro('_SIOW', [], '_IOW'),
            macro('_SIOWR', [], '_IOWR'),
            note(
                "/dev/dsp's requests. Each one that sets something writes back what it set, which can differ from what was asked: check it."
            ),
            ioctl(
                'SNDCTL_DSP_RESET',
                '',
                "'P'",
                0,
                undefined,
                'Stop at once and drop the samples not played',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_SYNC',
                '',
                "'P'",
                1,
                undefined,
                'Wait until every sample written has played',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_SPEED',
                'WR',
                "'P'",
                2,
                'int',
                'Set the sample rate and write back the selected value, from 1000 to 192000 samples per second; initially 8000',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_STEREO',
                'WR',
                "'P'",
                3,
                'int',
                '0 mono, 1 stereo: the old way of SNDCTL_DSP_CHANNELS',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_GETBLKSIZE',
                'WR',
                "'P'",
                4,
                'int',
                'Read the selected fragment size in bytes',
                {
                    spelling: '_SIO'
                }
            ),
            ioctl(
                'SNDCTL_DSP_SETFMT',
                'WR',
                "'P'",
                5,
                'int',
                'Set an AFMT_* sample format and write back the selected value; initially AFMT_U8',
                { spelling: '_SIO' }
            ),
            define('SNDCTL_DSP_SAMPLESIZE', 'SNDCTL_DSP_SETFMT'),
            ioctl(
                'SNDCTL_DSP_CHANNELS',
                'WR',
                "'P'",
                6,
                'int',
                'Set the channel count, 1 to 128, and write back the selected value: 1 is mono, 2 stereo',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_POST',
                '',
                "'P'",
                8,
                undefined,
                'Start playing what has been written, even an unfinished fragment',
                { spelling: '_SIO' }
            ),
            ioctl('SNDCTL_DSP_SUBDIVIDE', 'WR', "'P'", 9, 'int', undefined, { spelling: '_SIO' }),
            ioctl(
                'SNDCTL_DSP_SETFRAGMENT',
                'WR',
                "'P'",
                10,
                'int',
                'Request the buffer configuration through an int pointer: 0xMMMMSSSS requests MMMM fragments of 2^SSSS bytes. Call immediately after open; only one request can succeed per playback open. A smaller buffer reduces queued playback delay',
                { spelling: '_SIO' }
            ),
            ioctl(
                'SNDCTL_DSP_GETFMTS',
                'R',
                "'P'",
                11,
                'int',
                'The formats the device takes, AFMT_* bits',
                { spelling: '_SIO' }
            ),
            note(
                'Sample formats: one sample of one channel. The NE ones are the native byte order, little-endian on x86.'
            ),
            ...defines(
                [
                    [
                        'AFMT_QUERY',
                        0x00000000,
                        'With SNDCTL_DSP_SETFMT: read the format without changing it'
                    ],
                    ['AFMT_MU_LAW', 0x00000001],
                    ['AFMT_A_LAW', 0x00000002],
                    ['AFMT_IMA_ADPCM', 0x00000004],
                    ['AFMT_U8', 0x00000008, 'Unsigned 8-bit: 128 is silence'],
                    ['AFMT_S16_LE', 0x00000010, 'Signed 16-bit, little-endian: 0 is silence'],
                    ['AFMT_S16_BE', 0x00000020],
                    ['AFMT_S8', 0x00000040],
                    ['AFMT_U16_LE', 0x00000080],
                    ['AFMT_U16_BE', 0x00000100],
                    ['AFMT_MPEG', 0x00000200],
                    ['AFMT_AC3', 0x00000400]
                ],
                16
            ),
            define('AFMT_S16_NE', 'AFMT_S16_LE'),
            note(
                "OSS 4's names for formats Linux's own <linux/soundcard.h> leaves out: a program that names them builds here and not against Linux's header, where it defines them itself. Linux's OSS emulation takes the values all the same."
            ),
            ...[
                ['AFMT_S32_LE', 0x00001000, 'Signed 32-bit, little-endian'],
                ['AFMT_S32_BE', 0x00002000],
                ['AFMT_S24_LE', 0x00008000, 'Signed 24-bit in 32 bits, little-endian'],
                ['AFMT_S24_BE', 0x00010000],
                ['AFMT_S24_PACKED', 0x00040000, 'Signed 24-bit in 3 bytes, little-endian']
            ].map(([name, value, doc]) => define(name, value, doc, { radix: 16, linux: false })),
            struct(
                'audio_buf_info',
                'Playback buffer capacity and free space returned by SNDCTL_DSP_GETOSPACE. Total capacity in bytes is fragstotal * fragsize.',
                [
                    field(
                        'int',
                        'fragments',
                        'Whole free fragments; may be negative while a partial fragment is staged'
                    ),
                    field(
                        'int',
                        'fragstotal',
                        'Total fragment count; capacity is fragstotal times fragsize bytes'
                    ),
                    field(
                        'int',
                        'fragsize',
                        'Fragment size in bytes, also returned by SNDCTL_DSP_GETBLKSIZE'
                    ),
                    field(
                        'int',
                        'bytes',
                        'Free bytes; can be negative while a partial fragment is staged'
                    )
                ],
                { typedef: 'audio_buf_info' }
            ),
            ioctl(
                'SNDCTL_DSP_GETOSPACE',
                'R',
                "'P'",
                12,
                'audio_buf_info',
                'Read playback buffer capacity and free space into audio_buf_info',
                { spelling: '_SIO' }
            ),
            ioctl('SNDCTL_DSP_GETISPACE', 'R', "'P'", 13, 'audio_buf_info', undefined, {
                spelling: '_SIO'
            }),
            ioctl('SNDCTL_DSP_NONBLOCK', '', "'P'", 14, undefined, 'Turn O_NONBLOCK on', {
                spelling: '_SIO'
            }),
            ioctl(
                'SNDCTL_DSP_GETCAPS',
                'R',
                "'P'",
                15,
                'int',
                'What the device can do, DSP_CAP_* bits',
                { spelling: '_SIO' }
            ),
            ...defines(
                [
                    ['DSP_CAP_REVISION', 0x000000ff],
                    ['DSP_CAP_DUPLEX', 0x00000100],
                    ['DSP_CAP_REALTIME', 0x00000200],
                    ['DSP_CAP_BATCH', 0x00000400],
                    ['DSP_CAP_COPROC', 0x00000800],
                    ['DSP_CAP_TRIGGER', 0x00001000],
                    [
                        'DSP_CAP_MMAP',
                        0x00002000,
                        'mmap of /dev/dsp: not here, so a program writes instead'
                    ],
                    ['DSP_CAP_MULTI', 0x00004000],
                    ['DSP_CAP_BIND', 0x00008000]
                ],
                16
            ),
            ioctl('SNDCTL_DSP_GETTRIGGER', 'R', "'P'", 16, 'int', undefined, { spelling: '_SIO' }),
            ioctl('SNDCTL_DSP_SETTRIGGER', 'W', "'P'", 16, 'int', undefined, { spelling: '_SIO' }),
            define('PCM_ENABLE_INPUT', 0x00000001, undefined, { radix: 16 }),
            define('PCM_ENABLE_OUTPUT', 0x00000002, undefined, { radix: 16 }),
            struct(
                'count_info',
                'What SNDCTL_DSP_GETOPTR reads.',
                [
                    field('int', 'bytes', 'Bytes played so far'),
                    field('int', 'blocks', 'Fragments played since the last call'),
                    field('int', 'ptr')
                ],
                { typedef: 'count_info' }
            ),
            ioctl('SNDCTL_DSP_GETIPTR', 'R', "'P'", 17, 'count_info', undefined, {
                spelling: '_SIO'
            }),
            ioctl('SNDCTL_DSP_GETOPTR', 'R', "'P'", 18, 'count_info', undefined, {
                spelling: '_SIO'
            }),
            ioctl('SNDCTL_DSP_SETSYNCRO', '', "'P'", 21, undefined, undefined, {
                spelling: '_SIO'
            }),
            ioctl('SNDCTL_DSP_SETDUPLEX', '', "'P'", 22, undefined, undefined, {
                spelling: '_SIO'
            }),
            ioctl(
                'SNDCTL_DSP_GETODELAY',
                'R',
                "'P'",
                23,
                'int',
                'Read bytes submitted for playback but not yet heard, excluding an incomplete staged fragment',
                { spelling: '_SIO' }
            ),
            note('The older names of the same requests.'),
            define('SOUND_PCM_WRITE_BITS', 'SNDCTL_DSP_SETFMT'),
            define('SOUND_PCM_WRITE_CHANNELS', 'SNDCTL_DSP_CHANNELS'),
            define('SOUND_PCM_WRITE_RATE', 'SNDCTL_DSP_SPEED'),
            ioctl('SOUND_PCM_READ_RATE', 'R', "'P'", 2, 'int', undefined, { spelling: '_SIO' }),
            ioctl('SOUND_PCM_READ_CHANNELS', 'R', "'P'", 6, 'int', undefined, { spelling: '_SIO' }),
            ioctl('SOUND_PCM_READ_BITS', 'R', "'P'", 5, 'int', undefined, { spelling: '_SIO' }),
            define('SOUND_PCM_POST', 'SNDCTL_DSP_POST'),
            define('SOUND_PCM_RESET', 'SNDCTL_DSP_RESET'),
            define('SOUND_PCM_SYNC', 'SNDCTL_DSP_SYNC'),
            define('SOUND_PCM_SETFRAGMENT', 'SNDCTL_DSP_SETFRAGMENT'),
            define('SOUND_PCM_GETFMTS', 'SNDCTL_DSP_GETFMTS'),
            define('SOUND_PCM_SETFMT', 'SNDCTL_DSP_SETFMT'),
            define('SOUND_PCM_GETOSPACE', 'SNDCTL_DSP_GETOSPACE'),
            define('SOUND_PCM_GETCAPS', 'SNDCTL_DSP_GETCAPS'),
            note(
                "The mixer's channels, on /dev/mixer and on /dev/dsp. A level is left in the low byte and right in the next, each 0 to 100: 75 | 75 << 8. VOLUME sets the gain of /dev/dsp's sound; the other channels, PCM among them, keep what is written to them and change nothing on this card."
            ),
            define('SOUND_MIXER_NRDEVICES', 25, 'How many channels'),
            ...mixerChannels.map((name, index) => define(`SOUND_MIXER_${name}`, index)),
            define('SOUND_MIXER_NONE', 31),
            ...defines(
                [
                    ['SOUND_MIXER_RECSRC', 0xff, 'Recording sources, a bit each'],
                    ['SOUND_MIXER_DEVMASK', 0xfe, 'The channels the mixer has, a bit each'],
                    ['SOUND_MIXER_RECMASK', 0xfd],
                    ['SOUND_MIXER_CAPS', 0xfc],
                    ['SOUND_MIXER_STEREODEVS', 0xfb, 'The channels with a left and right level'],
                    ['SOUND_MIXER_OUTSRC', 0xfa],
                    ['SOUND_MIXER_OUTMASK', 0xf9]
                ],
                16
            ),
            ...mixerChannels.map((name) =>
                define(`SOUND_MASK_${name}`, `1 << SOUND_MIXER_${name}`)
            ),
            macro(
                'MIXER_READ',
                ['dev'],
                "_SIOR('M', dev, int)",
                'Read the level of the channel dev into an int.',
                {
                    nasm: "_IOC(_IOC_READ, 'M', dev, 4)",
                    samples: [['SOUND_MIXER_PCM'], ['SOUND_MIXER_DEVMASK']]
                }
            ),
            ...mixerChannels
                .slice(0, 17)
                .map((name) =>
                    define(`SOUND_MIXER_READ_${name}`, `MIXER_READ(SOUND_MIXER_${name})`)
                ),
            ...['RECSRC', 'DEVMASK', 'RECMASK', 'STEREODEVS', 'CAPS'].map((name) =>
                define(`SOUND_MIXER_READ_${name}`, `MIXER_READ(SOUND_MIXER_${name})`)
            ),
            macro(
                'MIXER_WRITE',
                ['dev'],
                "_SIOWR('M', dev, int)",
                'Set the level of the channel dev from an int, which it writes back.',
                {
                    nasm: "_IOC(_IOC_READ | _IOC_WRITE, 'M', dev, 4)",
                    samples: [['SOUND_MIXER_VOLUME']]
                }
            ),
            ...mixerChannels
                .slice(0, 17)
                .map((name) =>
                    define(`SOUND_MIXER_WRITE_${name}`, `MIXER_WRITE(SOUND_MIXER_${name})`)
                ),
            define('SOUND_MIXER_WRITE_RECSRC', 'MIXER_WRITE(SOUND_MIXER_RECSRC)'),
            struct(
                'mixer_info',
                "What SOUND_MIXER_INFO reads: the mixer's names.",
                [
                    field('char', 'id', undefined, { count: 16 }),
                    field('char', 'name', undefined, { count: 32 }),
                    field('int', 'modify_counter', 'Counts the changes to the levels'),
                    field('int', 'fillers', undefined, { count: 10 })
                ],
                { typedef: 'mixer_info' }
            ),
            ioctl('SOUND_MIXER_INFO', 'R', "'M'", 101, 'mixer_info', undefined, {
                spelling: '_SIO'
            })
        ]
    },
    {
        path: 'sys/soundcard.h',
        summary: "the C library's name for <linux/soundcard.h>, which it includes.",
        includes: ['linux/soundcard.h'],
        items: []
    },
    {
        path: 'sound/asound.h',
        summary:
            "ALSA's raw MIDI part, /dev/snd/midiC1D0: MIDI bytes written to the port play on the General MIDI synthesizer, at MIDI's 31,250 baud. These requests ask about the port and its buffer.",
        //as Linux's on Linux: the types, <stdlib.h> and <time.h>, but no ioctl, nor _IOR for the
        //requests: a program includes <sys/ioctl.h> for both
        includes: ['linux/types.h', 'stdlib.h', 'time.h'],
        items: [
            macro(
                'SNDRV_PROTOCOL_VERSION',
                ['major', 'minor', 'subminor'],
                '(((major) << 16) | ((minor) << 8) | (subminor))',
                'A version number from its three parts.',
                { samples: [['2', '0', '5']] }
            ),
            define(
                'SNDRV_RAWMIDI_VERSION',
                'SNDRV_PROTOCOL_VERSION(2, 0, 5)',
                "What SNDRV_RAWMIDI_IOCTL_PVERSION answers on the guest's Linux 7.2",
                { since: '6.14' }
            ),
            note('The two directions of a port.'),
            define('SNDRV_RAWMIDI_STREAM_OUTPUT', 0, 'From the program to the synthesizer'),
            define('SNDRV_RAWMIDI_STREAM_INPUT', 1),
            define('SNDRV_RAWMIDI_STREAM_LAST', 'SNDRV_RAWMIDI_STREAM_INPUT'),
            note("snd_rawmidi_info's flags."),
            ...defines(
                [
                    ['SNDRV_RAWMIDI_INFO_OUTPUT', 0x00000001],
                    ['SNDRV_RAWMIDI_INFO_INPUT', 0x00000002],
                    ['SNDRV_RAWMIDI_INFO_DUPLEX', 0x00000004],
                    ['SNDRV_RAWMIDI_INFO_UMP', 0x00000008]
                ],
                16
            ),
            struct(
                'snd_rawmidi_info',
                'What SNDRV_RAWMIDI_IOCTL_INFO reads: which card and device the port is, and its names.',
                [
                    field('unsigned int', 'device'),
                    field('unsigned int', 'subdevice'),
                    field('int', 'stream', 'Which direction to ask about, set before the call'),
                    field('int', 'card', '1 here: the card after the sound card'),
                    field('unsigned int', 'flags', 'SNDRV_RAWMIDI_INFO_*'),
                    field('unsigned char', 'id', undefined, { count: 64 }),
                    field('unsigned char', 'name', undefined, { count: 80 }),
                    field('unsigned char', 'subname', undefined, { count: 32 }),
                    field('unsigned int', 'subdevices_count'),
                    field('unsigned int', 'subdevices_avail'),
                    field('int', 'tied_device', 'The device tied to this one, 0 here', {
                        since: '6.14'
                    }),
                    field('unsigned char', 'reserved', undefined, { count: 60, since: '6.14' })
                ]
            ),
            note("snd_rawmidi_params's mode, for input only."),
            define('SNDRV_RAWMIDI_MODE_FRAMING_MASK', '7 << 0'),
            define('SNDRV_RAWMIDI_MODE_FRAMING_SHIFT', 0),
            define('SNDRV_RAWMIDI_MODE_FRAMING_NONE', '0 << 0'),
            define('SNDRV_RAWMIDI_MODE_FRAMING_TSTAMP', '1 << 0'),
            define('SNDRV_RAWMIDI_MODE_CLOCK_MASK', '7 << 3'),
            define('SNDRV_RAWMIDI_MODE_CLOCK_SHIFT', 3),
            define('SNDRV_RAWMIDI_MODE_CLOCK_NONE', '0 << 3'),
            define('SNDRV_RAWMIDI_MODE_CLOCK_REALTIME', '1 << 3'),
            define('SNDRV_RAWMIDI_MODE_CLOCK_MONOTONIC', '2 << 3'),
            define('SNDRV_RAWMIDI_MODE_CLOCK_MONOTONIC_RAW', '3 << 3'),
            struct(
                'snd_rawmidi_params',
                "What SNDRV_RAWMIDI_IOCTL_PARAMS sets: the size of the port's buffer.",
                [
                    field('int', 'stream'),
                    field('size_t', 'buffer_size', "The buffer's size in bytes"),
                    field('size_t', 'avail_min', 'How much room a write waits for'),
                    field(
                        'unsigned int',
                        'no_active_sensing',
                        'Do not send Active Sensing at close',
                        { bits: 1 }
                    ),
                    field('unsigned int', 'mode'),
                    field('unsigned char', 'reserved', undefined, { count: 12 })
                ]
            ),
            struct(
                null,
                'Padding that puts the next field where a time_t would align it.',
                [field('unsigned char', 'pad', undefined, { count: 4 })],
                { typedef: '__time_pad' }
            ),
            struct(
                'snd_rawmidi_status',
                "What SNDRV_RAWMIDI_IOCTL_STATUS reads: the room in the port's buffer.",
                [
                    field('int', 'stream', 'Which direction to ask about, set before the call'),
                    field('__time_pad', 'pad1'),
                    field('struct timespec', 'tstamp', 'When it was asked'),
                    field('size_t', 'avail', 'Bytes free in the buffer'),
                    field('size_t', 'xruns'),
                    field('unsigned char', 'reserved', undefined, { count: 16 })
                ]
            ),
            note('The requests.'),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_PVERSION',
                'R',
                "'W'",
                0x00,
                'int',
                'The protocol version, SNDRV_RAWMIDI_VERSION, into an int'
            ),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_INFO',
                'R',
                "'W'",
                0x01,
                'struct snd_rawmidi_info',
                "The port's identity"
            ),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_PARAMS',
                'WR',
                "'W'",
                0x10,
                'struct snd_rawmidi_params',
                'Change the buffer'
            ),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_STATUS',
                'WR',
                "'W'",
                0x20,
                'struct snd_rawmidi_status',
                "The buffer's state"
            ),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_DROP',
                'W',
                "'W'",
                0x30,
                'int',
                'Drop the bytes not sent yet; the argument points to the stream'
            ),
            ioctl(
                'SNDRV_RAWMIDI_IOCTL_DRAIN',
                'W',
                "'W'",
                0x31,
                'int',
                'Wait until every byte has been sent; the argument points to the stream'
            )
        ]
    },
    {
        path: 'linux/kd.h',
        summary:
            "the console's requests. Opened as /dev/tty0, the console sounds the PC speaker. The program's own terminal is a serial line, so the other requests answer ENOTTY there.",
        items: defines(
            [
                [
                    'KIOCSOUND',
                    0x4b2f,
                    "Sound the PC speaker with the argument as the timer's period, 1193182 / frequency, until a 0 stops it"
                ],
                [
                    'KDMKTONE',
                    0x4b30,
                    'Sound a tone for a while: the period as for KIOCSOUND in the low 16 bits, the time in ms in the high 16'
                ],
                ['KDGETMODE', 0x4b3b, 'Read whether the console shows text or graphics'],
                ['KDSETMODE', 0x4b3a, 'Make the console show text or let a program draw'],
                ['KD_TEXT', 0x00],
                ['KD_GRAPHICS', 0x01],
                ['KDGKBMODE', 0x4b44, "Read how the console's keyboard reports keys"],
                ['KDSKBMODE', 0x4b45, 'Change it'],
                ['K_RAW', 0x00],
                ['K_XLATE', 0x01],
                ['K_MEDIUMRAW', 0x02],
                ['K_UNICODE', 0x03],
                ['K_OFF', 0x04]
            ],
            16
        )
    },
    {
        path: 'errno.h',
        summary:
            'the error numbers. The kernel answers a failed system call with one of them, negated, in rax: compare rax with -ENOTTY, or check for any failure with cmp rax, -4095 and jae.',
        /** The Runtime library's shared <errno.h> declares them for C; the table only checks it. */
        c: false,
        items: errnoCodes.map(([name, value, doc]) => define(name, value, doc))
    }
]

/** The error numbers, with what each means. */
export const ERRNO_CODES = errnoCodes.map(([name, value, doc]) => ({ name, value, doc }))

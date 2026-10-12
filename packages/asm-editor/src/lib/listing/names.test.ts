import { describe, expect, it } from 'vite-plus/test'
import { fnv1a64, inventName, numberedName, printableSymbolName, stringLabelBase } from './names'

describe('invented names', () => {
    it('hash with FNV-1a 64', () => {
        const bytes = (text: string) => Array.from(text, (char) => char.charCodeAt(0))
        expect(fnv1a64([])).toBe(0xcbf29ce484222325n)
        expect(fnv1a64(bytes('a'))).toBe(0xaf63dc4c8601ec8cn)
        expect(fnv1a64(bytes('foobar'))).toBe(0x85944171f73967e8n)
    })

    // Frozen: a failure here means the v1 lists or the derivation changed, which renames
    // functions in every saved Project. Make a new version instead.
    it('give these names to these addresses in v1', () => {
        const free = () => false
        const pinned: [number, string][] = [
            [0x0, 'singing_ermine'],
            [0x1000, 'bronze_barracuda'],
            [0x1100, 'dreamy_ermine'],
            [0x1130, 'moonlit_vole'],
            [0x11a0, 'peachy_anteater'],
            [0x11e0, 'sunny_moth'],
            [0x11e9, 'sturdy_ocelot'],
            [0x4010, 'olive_nautilus'],
            [0x28000, 'saffron_ibis'],
            [0x2a820, 'hazy_yak'],
            [0x401000, 'glowing_oriole'],
            [0x401780, 'grand_serval'],
            [0x4b1a40, 'brisk_giraffe']
        ]
        for (const [address, words] of pinned) {
            expect(inventName('FUN_', address, free, 'v1')).toBe(`FUN_${words}`)
            expect(inventName('DAT_', address, free, 'v1')).toBe(`DAT_${words}`)
        }
    })

    it('take the next name in a fixed sequence when one is taken', () => {
        const first = inventName('FUN_', 0x1130, () => false, 'v1')
        const second = inventName('FUN_', 0x1130, (name) => name === first, 'v1')
        const third = inventName('FUN_', 0x1130, (name) => name === first || name === second, 'v1')
        expect([first, second, third]).toEqual([
            'FUN_moonlit_vole',
            'FUN_sapphire_dormouse',
            'FUN_earthy_scorpion'
        ])
    })

    it('fall back to the address only when every retry is taken', () => {
        expect(inventName('FUN_', 0x1130, () => true, 'v1')).toMatch(/^FUN_[a-z]+_[a-z]+_1130$/)
    })
})

describe('names from the file', () => {
    it('name a string from its first 24 characters', () => {
        expect(stringLabelBase('Enter password: ')).toBe('s_Enter_password')
        expect(stringLabelBase('hello %s argc=%d\n')).toBe('s_hello_s_argc_d')
        expect(stringLabelBase('/lib64/ld-linux-x86-64.so.2')).toBe('s_lib64_ld_linux_x86_64_s')
        expect(stringLabelBase('\n')).toBe('')
    })

    it('number a name that is taken', () => {
        const taken = new Set(['s_Hi', 's_Hi_2'])
        expect(numberedName('s_Hi', (name) => taken.has(name))).toBe('s_Hi_3')
        expect(numberedName('s_Ho', (name) => taken.has(name))).toBe('s_Ho')
    })

    it('keep a symbol name from breaking its line', () => {
        expect(printableSymbolName('main')).toBe('main')
        expect(printableSymbolName('_ZNSt6vectorIiSaIiEED2Ev')).toBe('_ZNSt6vectorIiSaIiEED2Ev')
        expect(printableSymbolName('read_encoded_value.cold')).toBe('read_encoded_value.cold')
        expect(printableSymbolName('fmt.(*pp).doPrintf')).toBe('fmt.__pp_.doPrintf')
        expect(printableSymbolName('a b;c\nd')).toBe('a_b_c_d')
        expect(printableSymbolName('.annobin_init.c')).toBe('_annobin_init.c')
    })
})
